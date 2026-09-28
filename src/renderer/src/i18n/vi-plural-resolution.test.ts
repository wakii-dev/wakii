import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { i18n } from './i18n'

// SF-1 plural probe for the `vi` catalog (result recorded in the SF-1 plan —
// SF-2 batch translation depends on it). CLDR Vietnamese has a single plural
// category (`other`), so i18next must resolve every count through the `*_other`
// suffix; a `*_one` entry copied from en is unreachable (dead key). The stub
// `vi.json` is empty, so the probe seeds a bundle directly (addResourceBundle) —
// an unsynced probe would pass vacuum.
const PLURAL_PATH = {
  auto: {
    components: {
      status: {
        bar: {
          SshStatusSegment: {
            connectedHostCount_one: 'VI-ONE {{count}}',
            connectedHostCount_other: 'VI-OTHER {{count}}'
          }
        }
      }
    }
  }
}

const COUNTS = [0, 1, 2, 5, 100]

function tConnectedHostCount(count: number): string {
  return i18n.t('auto.components.status.bar.SshStatusSegment.connectedHostCount', {
    count,
    defaultValue: 'FALLBACK'
  })
}

describe('vi plural resolution probe', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('vi')
    // The switch must have delivered the (empty) stub through the lazy
    // backend — a missing NON_DEFAULT_LOCALE_LOADERS.vi entry leaves no bundle.
    expect(i18n.hasResourceBundle('vi', 'translation')).toBe(true)
    i18n.addResourceBundle('vi', 'translation', PLURAL_PATH, true, true)
  })

  afterEach(async () => {
    i18n.removeResourceBundle('vi', 'translation')
    await i18n.changeLanguage('en')
  })

  it('resolves every count through the *_other suffix', () => {
    for (const count of COUNTS) {
      expect(tConnectedHostCount(count)).toBe(`VI-OTHER ${count}`)
    }
  })

  it('never resolves a *_one entry copied from en (dead key)', async () => {
    i18n.removeResourceBundle('vi', 'translation')
    i18n.addResourceBundle(
      'vi',
      'translation',
      {
        auto: {
          components: {
            status: { bar: { SshStatusSegment: { connectedHostCount_one: 'VI-ONLY-ONE' } } }
          }
        }
      },
      true,
      true
    )
    for (const count of COUNTS) {
      const value = tConnectedHostCount(count)
      // Why: missing vi plurals fall through to the English catalog (en re-applies
      // its own plural rules), so the expected shape is en's `N host(s)` — the
      // vi *_one entry contributes nothing.
      expect(value).not.toContain('VI-ONLY-ONE')
      expect(value).toMatch(/^0 hosts$|^\d+ hosts?$/)
    }
    expect(tConnectedHostCount(1)).toBe('1 host')
  })

  it('lazy-loads the empty vi stub without crashing on switch', async () => {
    await i18n.changeLanguage('vi')
    expect(i18n.language).toBe('vi')
    expect(i18n.t('settings.appearance.language.title', { defaultValue: 'Language' })).toBe(
      'Language'
    )
  })
})
