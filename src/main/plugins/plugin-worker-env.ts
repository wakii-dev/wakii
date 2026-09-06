/**
 * Scrubbed environment for plugin workers. Deliberately an allowlist — the
 * app's own environment can carry secrets (tokens exported in the user's
 * shell, CI credentials); plugins must not inherit it. This intentionally
 * diverges from the sidecar precedent, which spreads the full process.env.
 */

import { existsSync } from 'node:fs'

const WORKER_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  // Why: Windows Node/libuv need these to resolve DLLs and the machine root.
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS'
] as const

export function buildPluginWorkerEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const env: Record<string, string> = {}
  const windowsLookup = new Map<string, string>()
  if (platform === 'win32') {
    // Why: Windows environment keys are case-insensitive, while POSIX keys
    // are not; folding on every platform could promote an attacker-set `path`.
    for (const [key, value] of Object.entries(baseEnv)) {
      if (typeof value === 'string') {
        windowsLookup.set(key.toUpperCase(), value)
      }
    }
  }
  for (const key of WORKER_ENV_ALLOWLIST) {
    const value = platform === 'win32' ? windowsLookup.get(key) : baseEnv[key]
    if (value !== undefined) {
      env[key === 'SYSTEMROOT' ? 'SystemRoot' : key] = value
    }
  }
  // FORK-LOCAL (Wakii): kit CLIs (story-verify/watchdog…) resolve the app CLI
  // through ORCA_BIN with a hardcoded /opt/homebrew fallback — pin the real
  // binary so those calls never exit 127 on machines without that path.
  const baseOrcaBin = platform === 'win32' ? windowsLookup.get('ORCA_BIN') : baseEnv.ORCA_BIN
  env.ORCA_BIN =
    baseOrcaBin ??
    [
      '/usr/local/bin/orca',
      '/opt/homebrew/bin/orca',
      '/Applications/Wakii.app/Contents/Resources/bin/orca',
      '/Applications/Orca.app/Contents/Resources/bin/orca'
    ].find((candidate) => existsSync(candidate)) ??
    '/usr/local/bin/orca'
  env.ELECTRON_RUN_AS_NODE = '1'
  return env
}
