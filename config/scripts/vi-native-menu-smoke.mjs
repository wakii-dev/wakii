// Node-level replay of the native-menu read path: SF-1's lazy backend imports vi.json
// (bundled by electron-vite) and translateMain resolves keys against it. Electron's `app`
// is unavailable here, so this validates the artifact itself — every translateMain menu
// call site's key must resolve to a non-empty Vietnamese string from the real vi.json.
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')
const MAIN_DIR = path.join('src', 'main')

async function collectTranslateMainCallSites(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const callSites = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      callSites.push(...(await collectTranslateMainCallSites(fullPath)))
      continue
    }
    if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) {
      continue
    }
    const source = await fs.readFile(fullPath, 'utf8')
    const callSitePattern = /translateMain\(\s*(['"])([^']+)\1\s*,\s*(['"])((?:[^\\]|\\.)*?)\3/g
    for (const [, , key, , fallback] of source.matchAll(callSitePattern)) {
      callSites.push([key, fallback.replace(/\\(['"])/g, '$1')])
    }
  }
  return callSites
}

// Literal key+fallback pairs scanned from translateMain call sites in src/main
// (or an explicit JSON file of pairs). Zero call sites is a hard failure — an
// empty scan must not produce a vacuous PASS.
const MENU_CALL_SITES = process.argv[2]
  ? JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
  : await collectTranslateMainCallSites(MAIN_DIR)

function resolvePath(catalog, key) {
  return key.split('.').reduce((cursor, part) => (cursor == null ? cursor : cursor[part]), catalog)
}

const viCatalog = JSON.parse(await fs.readFile(path.join(LOCALES_DIR, 'vi.json'), 'utf8'))

const failures = []
let resolvedNonEnglish = 0
let resolvedPreserved = 0

for (const [key, fallback] of MENU_CALL_SITES) {
  const viValue = resolvePath(viCatalog, key)
  if (typeof viValue !== 'string' || viValue.length === 0) {
    failures.push(`RAW KEY (no vi entry): ${key} fallback=${fallback}`)
    continue
  }
  if (viValue !== fallback) {
    resolvedNonEnglish += 1
  } else {
    resolvedPreserved += 1
    console.log(`  preserved-en: ${key} = "${viValue}"`)
  }
}

const menuViTotal = Object.keys(viCatalog.menu ?? {}).length
console.log(
  `menu call sites checked: ${MENU_CALL_SITES.length} · resolved Vietnamese: ${resolvedNonEnglish}` +
    ` · resolved identical-to-en (preserve): ${resolvedPreserved}` +
    ` · vi.json menu.* leaf keys: ${menuViTotal}`
)

if (MENU_CALL_SITES.length === 0) {
  console.error('SMOKE FAILED: zero translateMain call sites scanned — nothing was verified.')
  process.exit(1)
}

if (failures.length > 0) {
  console.error('SMOKE FAILED:')
  for (const failure of failures) {
    console.error(`  ${failure}`)
  }
  process.exit(1)
}
console.log('vi native-menu catalog smoke PASSED')
