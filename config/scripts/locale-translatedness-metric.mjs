import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { filterLeavesByPrefix } from './bootstrap-locale-catalog.mjs'
import { collectStringLeaves, shouldPreserveEnglishValue } from './locale-translation-policy.mjs'

const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')

// Language-picker labels are endonyms pinned to the same value in every catalog
// (en.json already carries 中文（简体）/Tiếng Việt verbatim) — repairCatalog enforces
// them, so equality with en is by design, not missing translation.
const ENDONYM_LABEL_KEYS = new Set([
  'english',
  'chinese',
  'korean',
  'japanese',
  'spanish',
  'french',
  'vietnamese'
])
const LANGUAGE_LABELS_PREFIX = 'settings.appearance.language.'

function lookupLeafValue(catalog, key) {
  return key
    .split('.')
    .reduce(
      (cursor, part) => (cursor === null || cursor === undefined ? cursor : cursor[part]),
      catalog
    )
}

function isEndonymLabelLeaf(key, enValue) {
  return (
    key.startsWith(LANGUAGE_LABELS_PREFIX) &&
    ENDONYM_LABEL_KEYS.has(key.slice(LANGUAGE_LABELS_PREFIX.length)) &&
    typeof enValue === 'string'
  )
}

// Translatedness for one leaf: vi must DIFFER from en wherever translation is
// expected; preserve-by-design leaves (policy preserves, endonym labels) are
// satisfied by staying equal to en. So-sánh-key-only là vacuous — bootstrap
// clone full tree nên key không bao giờ thiếu, chỉ giá trị mới nói lên việc dịch.
function isLeafTranslated(key, enValue, viValue, locale) {
  if (isEndonymLabelLeaf(key, enValue)) {
    return viValue === enValue
  }
  if (typeof viValue !== 'string') {
    return false
  }
  if (shouldPreserveEnglishValue(enValue, key, locale)) {
    return viValue === enValue
  }
  return viValue !== enValue
}

export function computeTranslatedness(enCatalog, localeCatalog, locale, prefixes = []) {
  const leaves = filterLeavesByPrefix(collectStringLeaves(enCatalog), prefixes)
  const untranslated = []
  let translated = 0

  for (const leaf of leaves) {
    const viValue = lookupLeafValue(localeCatalog, leaf.key)
    if (isLeafTranslated(leaf.key, leaf.value, viValue, locale)) {
      translated += 1
    } else {
      untranslated.push({ key: leaf.key, enValue: leaf.value, viValue })
    }
  }

  return {
    locale,
    prefixes,
    total: leaves.length,
    translated,
    untranslated,
    ratio: leaves.length === 0 ? 1 : translated / leaves.length
  }
}

function parsePrefixArg(argv) {
  const prefixes = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--prefix' && argv[index + 1]) {
      prefixes.push(
        ...argv[index + 1]
          .split(',')
          .map((prefix) => prefix.trim())
          .filter(Boolean)
      )
    }
  }
  return prefixes
}

export async function main(argv = process.argv.slice(2), root = process.cwd()) {
  const locale = argv.find((arg) => !arg.startsWith('--'))
  const prefixes = parsePrefixArg(argv)
  if (!locale) {
    console.error('Usage: locale-translatedness-metric.mjs <locale> [--prefix p1,p2]')
    return 1
  }

  const enPath = path.join(root, LOCALES_DIR, 'en.json')
  const localePath = path.join(root, LOCALES_DIR, `${locale}.json`)
  const enCatalog = JSON.parse(await fs.readFile(enPath, 'utf8'))
  const localeCatalog = JSON.parse(await fs.readFile(localePath, 'utf8'))

  const result = computeTranslatedness(enCatalog, localeCatalog, locale, prefixes)
  const percent = (result.ratio * 100).toFixed(2)
  console.log(
    `translatedness[${locale}]${prefixes.length ? ` prefix=[${prefixes.join(',')}]` : ''}: ` +
      `${result.translated}/${result.total} = ${percent}%`
  )
  for (const leaf of result.untranslated.slice(0, 20)) {
    console.log(
      `  untranslated ${leaf.key}: en=${JSON.stringify(leaf.enValue)} vi=${JSON.stringify(leaf.viValue)}`
    )
  }
  if (result.untranslated.length > 20) {
    console.log(`  ... and ${result.untranslated.length - 20} more`)
  }
  return result.untranslated.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
