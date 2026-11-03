#!/usr/bin/env node
// Boot a packaged Wakii build headless and assert startup milestones — release-cut smoke receipt.
// Reuses the boot contract of tests/e2e/helpers/packaged-old-orca.ts without the Playwright test runner.

import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { _electron } from 'playwright-core'
import esbuild from 'esbuild'

const FIRST_WINDOW_TIMEOUT_MS = 120_000
const MILESTONE_TIMEOUT_MS = 120_000
const MILESTONE_PATTERN = /(?:^|\n)\[startup\] plugin-system-initialized(?:\s|$)/

function readFlag(argv, name) {
  const prefix = `--${name}=`
  const explicit = argv.find((arg) => arg.startsWith(prefix))
  return explicit ? explicit.slice(prefix.length) : null
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`)
}

function defaultAppDir() {
  if (process.platform === 'darwin') {
    return 'dist/mac-arm64/Wakii.app'
  }
  if (process.platform === 'win32') {
    return 'dist/win-unpacked'
  }
  return 'dist/linux-unpacked'
}

function executablePathForApp(appDir) {
  if (process.platform === 'darwin' || appDir.endsWith('.app')) {
    return path.join(appDir, 'Contents', 'MacOS', 'Wakii')
  }
  if (process.platform === 'win32') {
    return path.join(appDir, 'Wakii.exe')
  }
  return path.join(appDir, 'orca-ide')
}

function bundledLaunchPluginsDir(appDir) {
  if (process.platform === 'darwin' || appDir.endsWith('.app')) {
    return path.join(appDir, 'Contents', 'Resources', 'plugins', 'launch')
  }
  return path.join(appDir, 'resources', 'plugins', 'launch')
}

// esbuild is the single source of truth for consent fingerprints: bundle the TS module instead of porting it.
async function importTsModule(entryPath, outfile) {
  await esbuild.build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'silent'
  })
  return import(pathToFileURL(outfile))
}

async function collectBundledPluginConsents(launchDir, fingerprintPluginConsent) {
  let entries
  try {
    entries = await readdir(launchDir, { withFileTypes: true })
  } catch {
    return { consents: {}, skipped: 'no bundled launch plugins dir' }
  }
  const consents = {}
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const manifestPath = path.join(launchDir, entry.name, 'orca-plugin.json')
    if (!existsSync(manifestPath)) {
      continue
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const pluginKey = `${manifest.publisher}.${manifest.id}`
    consents[pluginKey] = fingerprintPluginConsent(manifest)
  }
  return { consents, skipped: null }
}

async function seedProfile({ tempRoot, appDir, fingerprintPluginConsent }) {
  const userDataDir = path.join(tempRoot, 'profile')
  const isolatedHome = path.join(userDataDir, 'home')
  await mkdir(isolatedHome, { recursive: true, mode: 0o700 })
  // Pre-create roaming AppData before Electron 43's Windows home lookup, mirroring the e2e helper.
  if (process.platform === 'win32') {
    await mkdir(path.join(isolatedHome, 'AppData', 'Roaming'), { recursive: true })
    await mkdir(path.join(isolatedHome, 'AppData', 'Local'), { recursive: true })
  }

  const bundled = await collectBundledPluginConsents(
    bundledLaunchPluginsDir(appDir),
    fingerprintPluginConsent
  )
  if (bundled.skipped) {
    console.warn(`[packaged-app-smoke] ${bundled.skipped}; seeding empty pluginConsents`)
  }

  const profileModule = await importTsModule(
    path.join(repoRoot(), 'tests', 'e2e', 'helpers', 'e2e-completed-onboarding-profile.ts'),
    path.join(tempRoot, 'onboarding-profile.mjs')
  )
  const profile = profileModule.getE2ECompletedOnboardingProfile()
  profile.settings = {
    ...profile.settings,
    pluginSystemEnabled: true,
    pluginConsents: bundled.consents,
    disabledPlugins: [],
    devPluginPaths: []
  }
  await writeFile(path.join(userDataDir, 'orca-data.json'), `${JSON.stringify(profile, null, 2)}\n`)
  return { userDataDir, isolatedHome, bundledPluginCount: Object.keys(bundled.consents).length }
}

function repoRoot() {
  return path.resolve(import.meta.dirname, '..', '..')
}

function launchEnv({ userDataDir, isolatedHome }) {
  const env = { ...process.env }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'HOME',
    'USERPROFILE',
    'ORCA_E2E_USER_DATA_DIR',
    'ORCA_E2E_HOME_DIR',
    'ORCA_E2E_HEADLESS'
  ]) {
    delete env[key]
  }
  return {
    ...env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    ORCA_E2E_USER_DATA_DIR: userDataDir,
    ORCA_E2E_HOME_DIR: isolatedHome,
    ORCA_E2E_HEADLESS: '1',
    ORCA_BYPASS_SINGLE_INSTANCE_LOCK: '1',
    ORCA_STARTUP_DIAGNOSTICS: '1',
    NODE_ENV: 'production',
    // macOS login resets HOME to the native account before the shell starts.
    ...(process.platform === 'darwin' ? { ORCA_DISABLE_MACOS_LOGIN_SHELL: '1' } : {})
  }
}

function attachLogCapture(child, buffer) {
  const forward = (stream) => {
    child[stream]?.on('data', (chunk) => {
      const text = chunk.toString()
      buffer.logs += text
      process.stdout.write(`[electron:${stream}] ${text.trimEnd()}\n`)
    })
  }
  forward('stdout')
  forward('stderr')
  child.on('exit', (code, signal) => {
    buffer.exit = { code, signal }
    console.log(`[electron:exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`)
  })
}

function printPlan({ appDir, executablePath, dryRun }) {
  console.log('[packaged-app-smoke] plan:')
  console.log(`  app-dir: ${appDir}`)
  console.log(`  executable: ${executablePath}`)
  console.log(`  platform: ${process.platform}`)
  console.log(
    '  env: ORCA_E2E_HEADLESS=1 ORCA_BYPASS_SINGLE_INSTANCE_LOCK=1 ORCA_STARTUP_DIAGNOSTICS=1'
  )
  console.log('  env: HOME/USERPROFILE + ORCA_E2E_USER_DATA_DIR isolated into a temp profile')
  console.log(
    '  asserts: firstWindow(120s) + domcontentloaded + [startup] plugin-system-initialized milestone'
  )
  console.log('  asserts: app resolves isolated home + screenshot receipt')
  console.log(`  mode: ${dryRun ? 'DRY RUN (no boot)' : 'boot'}`)
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = hasFlag(argv, 'dry-run')
  const appDir = path.resolve(readFlag(argv, 'app-dir') ?? defaultAppDir())
  const executablePath = executablePathForApp(appDir)
  const screenshotPath = path.resolve(
    readFlag(argv, 'screenshot') ?? 'smoke-packaged-app-receipt.png'
  )

  printPlan({ appDir, executablePath, dryRun })
  if (!existsSync(executablePath)) {
    if (dryRun) {
      console.warn(
        `[packaged-app-smoke] executable missing at ${executablePath}; dry-run continues`
      )
      return
    }
    throw new Error(`Packaged executable not found at ${executablePath}`)
  }
  if (dryRun) {
    return
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'orca-packaged-app-smoke-'))
  let smokeFailure = null
  try {
    const copiedAppDir = path.join(tempRoot, path.basename(appDir))
    await cp(appDir, copiedAppDir, { recursive: true, verbatimSymlinks: true })
    const copiedExecutablePath = executablePathForApp(copiedAppDir)

    const fingerprintModule = await importTsModule(
      path.join(
        repoRoot(),
        'src',
        'shared',
        'plugins',
        'approval',
        'plugin-consent-fingerprint.ts'
      ),
      path.join(tempRoot, 'plugin-consent-fingerprint.mjs')
    )
    const { userDataDir, isolatedHome, bundledPluginCount } = await seedProfile({
      tempRoot,
      appDir: copiedAppDir,
      fingerprintPluginConsent: fingerprintModule.fingerprintPluginConsent
    })
    console.log(
      `[packaged-app-smoke] seeded profile with ${bundledPluginCount} bundled plugin consents`
    )

    const buffer = { logs: '', exit: null }
    const app = await _electron.launch({
      executablePath: copiedExecutablePath,
      args: [],
      env: launchEnv({ userDataDir, isolatedHome })
    })
    attachLogCapture(app.process(), buffer)

    try {
      const resolvedHome = await app.evaluate(({ app: electronApp }) => electronApp.getPath('home'))
      assert.equal(
        path.resolve(resolvedHome),
        path.resolve(isolatedHome),
        'app escaped the disposable profile boundary'
      )

      const milestoneDeadline = Date.now() + MILESTONE_TIMEOUT_MS
      while (!MILESTONE_PATTERN.test(buffer.logs)) {
        if (Date.now() > milestoneDeadline) {
          throw new Error(
            `milestone plugin-system-initialized not seen within ${
              MILESTONE_TIMEOUT_MS / 1000
            }s; log tail:\n${buffer.logs.slice(-2000)}`
          )
        }
        if (buffer.exit && !MILESTONE_PATTERN.test(buffer.logs)) {
          throw new Error(
            `app exited before milestone (code=${buffer.exit.code} signal=${buffer.exit.signal}); log tail:\n${buffer.logs.slice(-2000)}`
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      console.log('[packaged-app-smoke] milestone plugin-system-initialized seen')

      const page = await app.firstWindow({ timeout: FIRST_WINDOW_TIMEOUT_MS })
      await page.waitForLoadState('domcontentloaded')
      await page.screenshot({ path: screenshotPath })
      console.log(`[packaged-app-smoke] screenshot receipt at ${screenshotPath}`)
    } finally {
      await app.close().catch(() => {})
    }
  } catch (error) {
    smokeFailure = error
  }

  const cleanupFailure = await rm(tempRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250
  }).then(
    () => null,
    (error) => error
  )

  if (smokeFailure) {
    if (cleanupFailure) {
      console.warn(`[packaged-app-smoke] temp cleanup failed: ${cleanupFailure.message}`)
    }
    throw smokeFailure
  }
  if (cleanupFailure) {
    throw cleanupFailure
  }
  console.log('[packaged-app-smoke] PASS')
}

await main()
