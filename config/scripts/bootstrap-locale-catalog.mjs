import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  collectStringLeaves,
  repairCatalog,
  repairTranslatedValue,
  setLeaf,
  shouldPreserveEnglishValue
} from './locale-translation-policy.mjs'

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g
const LOCALES_DIR = path.join('src', 'renderer', 'src', 'i18n', 'locales')

const LOCALE_CONFIG = {
  zh: {
    targetLanguage: 'zh-CN',
    displayName: 'Simplified Chinese',
    cacheFile: '.zh-catalog-cache.json'
  },
  ko: {
    targetLanguage: 'ko',
    displayName: 'Korean',
    cacheFile: '.ko-catalog-cache.json'
  },
  ja: {
    targetLanguage: 'ja',
    displayName: 'Japanese',
    cacheFile: '.ja-catalog-cache.json'
  },
  es: {
    targetLanguage: 'es',
    displayName: 'Spanish',
    cacheFile: '.es-catalog-cache.json'
  },
  fr: {
    targetLanguage: 'fr',
    displayName: 'French',
    cacheFile: '.fr-catalog-cache.json'
  },
  vi: {
    targetLanguage: 'vi',
    displayName: 'Vietnamese',
    cacheFile: '.vi-catalog-cache.json'
  }
}

function protectPlaceholders(text) {
  const tokens = []
  const protectedText = text.replace(PLACEHOLDER_RE, (match) => {
    const token = `__PH${tokens.length}__`
    tokens.push(match)
    return token
  })
  return { protectedText, tokens }
}

function restorePlaceholders(text, tokens) {
  let result = text
  for (let index = 0; index < tokens.length; index += 1) {
    const patterns = [`__PH${index}__`, `__ PH ${index} __`, `__PH ${index}__`, `__ PH${index}__`]
    for (const pattern of patterns) {
      result = result.replaceAll(pattern, tokens[index])
    }
  }
  return result
}

function shouldSkipTranslation(text, locale) {
  return shouldPreserveEnglishValue(text, '', locale)
}

async function translateText(text, targetLanguage) {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'en')
  url.searchParams.set('tl', targetLanguage)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)

  let lastError
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      // Why: undici waits indefinitely on a throttled connection — an orphan batch
      // hung socket-less for 6+ min; cap each attempt so the retry loop keeps moving.
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) {
        throw new Error(`Translation request failed with status ${response.status}`)
      }
      const payload = await response.json()
      return payload[0].map((part) => part[0]).join('')
    } catch (error) {
      lastError = error
      // Why: gtx throttles in bursts — a 429 needs seconds-long backoff (vi lô 1 died at 1.3k values on 500ms steps).
      const backoff = Math.min(20000, 1000 * 2 ** attempt) + Math.random() * 500
      await new Promise((resolve) => setTimeout(resolve, backoff))
    }
  }
  throw lastError
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = Array.from({ length: items.length })
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function loadCache(cachePath) {
  try {
    const raw = JSON.parse(await fs.readFile(cachePath, 'utf8'))
    return new Map(Object.entries(raw))
  } catch {
    return new Map()
  }
}

async function saveCache(cachePath, cache) {
  const raw = Object.fromEntries(cache.entries())
  await fs.writeFile(cachePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
}

function parseLocaleArg(argv) {
  const localeFlagIndex = argv.indexOf('--locale')
  if (localeFlagIndex !== -1 && argv[localeFlagIndex + 1]) {
    return argv[localeFlagIndex + 1]
  }
  return argv[2]
}

export function parsePrefixArg(argv) {
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

export function filterLeavesByPrefix(leaves, prefixes) {
  if (prefixes.length === 0) {
    return leaves
  }
  return leaves.filter((leaf) => prefixes.some((prefix) => leaf.key.startsWith(prefix)))
}

export async function main(root = process.cwd(), locale = parseLocaleArg(process.argv)) {
  const config = LOCALE_CONFIG[locale]
  if (!config) {
    console.error(
      `Unsupported locale "${locale}". Supported: ${Object.keys(LOCALE_CONFIG).join(', ')}`
    )
    return 1
  }

  const prefixes = parsePrefixArg(process.argv)
  const enPath = path.join(root, LOCALES_DIR, 'en.json')
  const localePath = path.join(root, LOCALES_DIR, `${locale}.json`)
  const cachePath = path.join(root, LOCALES_DIR, config.cacheFile)
  const enCatalog = JSON.parse(await fs.readFile(enPath, 'utf8'))
  const localeCatalog = structuredClone(enCatalog)
  const leaves = filterLeavesByPrefix(collectStringLeaves(enCatalog), prefixes)
  const uniqueValues = [...new Set(leaves.map((leaf) => leaf.value))]
  const cache = await loadCache(cachePath)
  const toTranslate = uniqueValues.filter(
    (value) => !shouldSkipTranslation(value, locale) && !cache.has(value)
  )

  console.log(
    `Translating ${toTranslate.length} unique strings to ${config.displayName} (${cache.size} cached)` +
      `${prefixes.length ? ` [prefix: ${prefixes.join(', ')}]` : ''}...`
  )

  let completed = 0
  let failed = 0
  // Why: sustained >4 req/s tripped sustained 429s — single worker keeps the gtx endpoint under the throttle.
  // A 429 starts an IP penalty window of tens of minutes; hammering the remaining list at 300ms/value
  // extends it (vi lô 1: 3 passes all-failed). Latch a shared cooldown, wait it out, retry the value.
  const THROTTLE_COOLDOWN_MS = 15 * 60 * 1000
  const MAX_THROTTLE_WAITS = 8
  let throttleCooldownUntil = 0
  let throttleWaits = 0
  await mapWithConcurrency(toTranslate, 1, async (value) => {
    completed += 1
    if (completed % 25 === 0) {
      console.log(`  ${completed}/${toTranslate.length}`)
      await saveCache(cachePath, cache)
    }
    const { protectedText, tokens } = protectPlaceholders(value)
    const translateAndCache = async () => {
      const translated = await translateText(protectedText, config.targetLanguage)
      const restored = restorePlaceholders(translated, tokens)
      cache.set(
        value,
        repairTranslatedValue({ key: '', enValue: value, localeValue: restored, locale })
      )
    }
    try {
      await translateAndCache()
    } catch (error) {
      let reportError = error
      const throttled = /status 429/.test(String(error))
      if (throttled && throttleWaits < MAX_THROTTLE_WAITS) {
        throttleWaits += 1
        const waitUntil = Math.max(Date.now() + THROTTLE_COOLDOWN_MS, throttleCooldownUntil)
        throttleCooldownUntil = waitUntil
        console.log(
          `  429 at ${completed}/${toTranslate.length} — cooling down until ${new Date(waitUntil).toISOString()}`
        )
        await new Promise((resolve) => setTimeout(resolve, waitUntil - Date.now()))
        try {
          await translateAndCache()
          console.log(`  resumed after cooldown (${completed}/${toTranslate.length})`)
          await new Promise((resolve) => setTimeout(resolve, 750))
          return
        } catch (retryError) {
          reportError = retryError
        }
      } else if (throttled) {
        // Why: a window outlasting the latch budget means every remaining value 429s too —
        // burning the list extends the penalty (lo1d). Bail out; monitor relaunch resumes via cache.
        console.log(
          `  429 persists after ${MAX_THROTTLE_WAITS} cooldowns — aborting; re-run the same command to resume.`
        )
        await saveCache(cachePath, cache)
        process.exit(1)
      }
      // Why: one throttled value must not kill a hours-long batch — leave it uncached
      // (falls back to en), the per-batch metric gate + re-run resume catch the holes.
      failed += 1
      console.log(
        `  failed (${completed}/${toTranslate.length}): ${String(reportError).slice(0, 140)}`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 750 + Math.random() * 250))
  })

  for (const value of uniqueValues) {
    if (shouldSkipTranslation(value, locale) && !cache.has(value)) {
      cache.set(value, value)
    }
  }

  await saveCache(cachePath, cache)

  for (const leaf of leaves) {
    const cached = cache.get(leaf.value) ?? leaf.value
    setLeaf(
      localeCatalog,
      leaf.key,
      repairTranslatedValue({
        key: leaf.key,
        enValue: leaf.value,
        localeValue: cached,
        locale
      })
    )
  }

  repairCatalog(enCatalog, localeCatalog, locale)

  await fs.writeFile(localePath, `${JSON.stringify(localeCatalog, null, 2)}\n`, 'utf8')
  console.log(
    failed > 0
      ? `Wrote ${localePath} with ${failed} untranslated value(s) — re-run the same command to resume them.`
      : `Wrote ${localePath}`
  )
  return failed > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
