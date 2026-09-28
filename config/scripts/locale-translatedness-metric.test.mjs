import { describe, expect, it } from 'vitest'

import { computeTranslatedness } from './locale-translatedness-metric.mjs'

const EN = {
  settings: {
    appearance: {
      title: 'Appearance',
      language: {
        title: 'Language',
        english: 'English',
        vietnamese: 'Tiếng Việt',
        chinese: '中文（简体）'
      }
    },
    general: { launch: 'Launch on startup' }
  },
  menu: { file: 'File', exit: 'Exit' },
  brand: { product: 'Orca', docs: 'https://example.com/docs' }
}

// Every normal leaf translated; preserve-by-design leaves (brand/URL/endonym
// labels) kept equal to en — the all-green baseline individual cases mutate.
function fullyTranslated() {
  const viCatalog = JSON.parse(JSON.stringify(EN))
  viCatalog.settings.appearance.title = 'Hiện diện'
  viCatalog.settings.appearance.language.title = 'Ngôn ngữ'
  viCatalog.settings.general.launch = 'Chạy khi khởi động'
  viCatalog.menu.file = 'Tệp'
  viCatalog.menu.exit = 'Thoát'
  return viCatalog
}

describe('computeTranslatedness', () => {
  it('counts leaves with vi value !== en value as translated', () => {
    const result = computeTranslatedness(EN, fullyTranslated(), 'vi')
    expect(result.total).toBe(10)
    expect(result.untranslated).toEqual([])
  })

  it('counts vi value === en value as untranslated for normal leaves', () => {
    const viCatalog = fullyTranslated()
    viCatalog.menu.exit = 'Exit'
    const result = computeTranslatedness(EN, viCatalog, 'vi')
    expect(result.untranslated.map((leaf) => leaf.key)).toEqual(['menu.exit'])
  })

  it('counts missing vi leaf as untranslated', () => {
    const viCatalog = fullyTranslated()
    delete viCatalog.menu.exit
    const result = computeTranslatedness(EN, viCatalog, 'vi')
    expect(result.untranslated.map((leaf) => leaf.key)).toEqual(['menu.exit'])
  })

  it('treats preserve-English values kept as en as translated', () => {
    const result = computeTranslatedness(EN, fullyTranslated(), 'vi')
    expect(result.untranslated).toEqual([])
  })

  it('treats language-picker endonym labels as translated when equal to en', () => {
    const result = computeTranslatedness(EN, fullyTranslated(), 'vi')
    expect(result.untranslated).toEqual([])
  })

  it('flags language-picker endonym labels that drifted from their endonym', () => {
    const viCatalog = fullyTranslated()
    viCatalog.settings.appearance.language.english = 'Anh'
    const result = computeTranslatedness(EN, viCatalog, 'vi')
    expect(result.untranslated.map((leaf) => leaf.key)).toEqual([
      'settings.appearance.language.english'
    ])
  })

  it('scopes counting to prefix filters', () => {
    const viCatalog = fullyTranslated()
    viCatalog.menu.exit = 'Exit'
    const result = computeTranslatedness(EN, viCatalog, 'vi', ['menu.'])
    expect(result.total).toBe(2)
    expect(result.untranslated.map((leaf) => leaf.key)).toEqual(['menu.exit'])
  })
})
