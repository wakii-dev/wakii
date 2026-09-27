/**
 * `getIntlLocale()` exists because plugin catalogs register under a synthetic
 * `plugin<hex>` resource language. Passing that straight to `Intl` throws, and
 * passing `undefined` silently falls back to the OS locale rather than the
 * language the user selected.
 *
 * The branch assertions stub `supportedLocalesOf` so they describe the helper's
 * logic rather than whichever locales the runtime's ICU build happens to carry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIntlLocale, i18n, setRendererPluginLanguagePacks } from './i18n'
import { pluginLanguageResourceId } from '../../../shared/plugins/plugin-language-pack-artifact'
import { DEFAULT_LOCALE } from './supported-languages'

const PACK_ID = 'plugin:smwbev.russian/ru-RU' as const
const PACK_RESOURCE = pluginLanguageResourceId(PACK_ID)
const PACK = {
  id: PACK_ID,
  resourceLanguage: PACK_RESOURCE,
  pluginKey: 'smwbev.russian',
  locale: 'ru-RU',
  catalog: {}
}

// A fixed Sunday at local noon so the weekday assertion holds in every TZ.
const SUNDAY = new Date(2026, 8, 27, 12, 0, 0)

type Packs = Parameters<typeof setRendererPluginLanguagePacks>[0]

async function activate(language: string, packs: Packs = []): Promise<void> {
  setRendererPluginLanguagePacks(packs)
  await i18n.changeLanguage(language)
}

/** Stubs ICU lookup so a locale counts as supported only when listed. */
function withSupportedLocales(supported: readonly string[]): void {
  vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation((requested) => {
    const tags = Array.isArray(requested) ? requested : [requested as string]
    return tags.filter((tag) => supported.includes(tag)) as string[]
  })
}

afterEach(async () => {
  vi.restoreAllMocks()
  setRendererPluginLanguagePacks([])
  await i18n.changeLanguage(DEFAULT_LOCALE)
})

describe('getIntlLocale', () => {
  it('passes a supported built-in locale straight through', async () => {
    withSupportedLocales(['es'])
    await activate('es')
    expect(getIntlLocale()).toBe('es')
  })

  it('resolves a plugin resource language to the locale the pack declares', async () => {
    withSupportedLocales(['ru-RU'])
    await activate(PACK_RESOURCE, [PACK])
    // Without the pack lookup this would reach Intl as `plugin<hex>`.
    expect(getIntlLocale()).toBe('ru-RU')
  })

  it('falls back to the default locale when ICU has no data for the tag', async () => {
    withSupportedLocales([])
    await activate('es')
    // Returning the tag here would let Intl silently format with the runtime locale.
    expect(getIntlLocale()).toBe(DEFAULT_LOCALE)
  })

  it('falls back to the default locale when Intl rejects the tag', async () => {
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation(() => {
      throw new RangeError('invalid language tag')
    })
    await activate(PACK_RESOURCE)
    expect(getIntlLocale()).toBe(DEFAULT_LOCALE)
  })

  it('keeps the synthetic resource language unusable for Intl directly', () => {
    // Unstubbed on purpose: this is a property of the tag, not of ICU data.
    expect(() => Intl.DateTimeFormat.supportedLocalesOf(PACK_RESOURCE)).toThrow(RangeError)
  })

  // Unstubbed on purpose: Chromium's ICU ships Vietnamese, so a real formatter
  // must resolve the selected locale instead of silently falling back to the
  // OS locale (the exact regression getIntlLocale exists to prevent).
  it('formats dates and relative time with real ICU data for vi', async () => {
    await activate('vi')
    expect(getIntlLocale()).toBe('vi')
    // 2026-09-27 is a Sunday; CLDR vi weekday names are Thứ Hai…Chủ Nhật.
    expect(new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'long' }).format(SUNDAY)).toBe(
      'Chủ Nhật'
    )
    expect(new Intl.RelativeTimeFormat(getIntlLocale()).format(-1, 'day')).toBe('1 ngày trước')
  })
})
