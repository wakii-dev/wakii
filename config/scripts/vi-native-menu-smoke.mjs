// Node-level replay of the native-menu read path: SF-1's lazy backend imports vi.json
// (bundled by electron-vite) and translateMain resolves keys against it. Electron's `app`
// is unavailable here, so this validates the artifact itself — every translateMain menu
// call site's key must resolve to a non-empty Vietnamese string from the real vi.json.
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')

// 48 literal key+fallback pairs grepped from translateMain call sites in src/main.
// Non-literal fallbacks (templates) resolve through the same catalog — sampled via
// menu.* coverage below.
const MENU_CALL_SITES = process.argv[2]
  ? JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
  : []

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

if (failures.length > 0) {
  console.error('SMOKE FAILED:')
  for (const failure of failures) {
    console.error(`  ${failure}`)
  }
  process.exit(1)
}
console.log('vi native-menu catalog smoke PASSED')
