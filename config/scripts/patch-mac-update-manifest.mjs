#!/usr/bin/env node

// macos-build renames the built DMGs to branded `Wakii-<version>-<arch>.dmg`
// before uploading, but electron-builder's latest-mac.yml still names the
// builder's originals (`orca-macos-<arch>.dmg`). Left as-is, the updater's
// readiness probe HEADs those two names, 404s, and every release reads as
// "not ready" — the check fails forever with "Couldn't reach the update
// server" (found on v1.4.223, 12/10).

const BUILDER_DMG_NAMES = [
  { original: 'orca-macos-arm64.dmg', releaseName: (version) => `Wakii-${version}-arm64.dmg` },
  { original: 'orca-macos-x64.dmg', releaseName: (version) => `Wakii-${version}-x64.dmg` }
]

/** Rewrites the renamed DMG url entries in a latest-mac.yml body. Idempotent. */
export function patchMacUpdateManifest(manifestText, version) {
  let patched = manifestText
  for (const { original, releaseName } of BUILDER_DMG_NAMES) {
    patched = patched.replaceAll(`url: ${original}`, `url: ${releaseName(version)}`)
  }
  return patched
}

export async function runCli(argv) {
  const [manifestPath, version] = argv.slice(2)
  if (!manifestPath || !version) {
    console.error(
      'Usage: node config/scripts/patch-mac-update-manifest.mjs <latest-mac.yml> <version>'
    )
    process.exitCode = 1
    return
  }
  const { readFileSync, writeFileSync } = await import('node:fs')
  const before = readFileSync(manifestPath, 'utf8')
  const after = patchMacUpdateManifest(before, version)
  writeFileSync(manifestPath, after)
  console.info(after === before ? 'manifest already patched' : 'manifest dmg entries patched')
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  await runCli(process.argv)
}
