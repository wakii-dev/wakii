import { describe, expect, it } from 'vitest'

import {
  NATIVE_PICKER_LABELS,
  repairCatalog,
  repairTranslatedValue,
  setLeaf,
  shouldPreserveEnglishValue
} from './locale-translation-policy.mjs'
import { computeTranslatedness } from './locale-translatedness-metric.mjs'

describe('vi preserve-English tech labels', () => {
  it('keeps whole-value tech terms English for vi only', () => {
    expect(shouldPreserveEnglishValue('Rebase', '', 'vi')).toBe(true)
    expect(shouldPreserveEnglishValue('worktrees', '', 'vi')).toBe(true)
    expect(shouldPreserveEnglishValue('Staging', '', 'vi')).toBe(true)
  })

  it('does not change behavior for other locales or when locale is omitted', () => {
    expect(shouldPreserveEnglishValue('Rebase', '', 'ko')).toBe(false)
    expect(shouldPreserveEnglishValue('Rebase')).toBe(false)
    expect(shouldPreserveEnglishValue('worktrees', '')).toBe(false)
  })
})

describe('never-translate split invariant (review round 2)', () => {
  // The CJK-MT-transliterated tokens live in the vi preserve set, NOT the global
  // NEVER_TRANSLATE extensions — a global entry silently reverts existing ja/ko/zh
  // renderings on their next repair (review round-1 P1-1). These assertions are RED
  // when e.g. 'WebSocket' is moved back into locale-never-translate-extensions.mjs.
  it('never-translate extensions do not revert CJK-MT renderings of their tokens', async () => {
    const { NEVER_TRANSLATE_EXTENSIONS } = await import('./locale-never-translate-extensions.mjs')
    expect(NEVER_TRANSLATE_EXTENSIONS).not.toContain('WebSocket')
    expect(
      repairTranslatedValue({
        key: 'auto.web.web.runtime.environment.07f788de83',
        enValue: 'WebSocket',
        localeValue: 'ウェブソケット',
        locale: 'ja'
      })
    ).toBe('ウェブソケット')
    expect(
      repairTranslatedValue({
        key: 'auto.components.settings.DeveloperPermissionsPane.b2210b1b4f',
        enValue: 'Bluetooth',
        localeValue: '블루투스',
        locale: 'ko'
      })
    ).toBe('블루투스')
  })

  it('decorated/reordered brand renderings in other locales are left alone', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.status.bar.ResourceUsageStatusSegment.288a4dd177',
        enValue: 'Wakii',
        localeValue: '・ Wakii',
        locale: 'ja'
      })
    ).toBe('・ Wakii')
    expect(
      repairTranslatedValue({
        key: 'auto.components.settings.CliSection.c5c0f2641d',
        enValue: 'Wakii CLI',
        localeValue: 'CLI de Wakii',
        locale: 'es'
      })
    ).toBe('CLI de Wakii')
  })
})

describe('vi brand mistranslation reverts (GT en→vi observed forms)', () => {
  it('reverts Gemini zodiac homograph', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'Gemini Usage',
        localeValue: 'Cách sử dụng của Song Tử',
        locale: 'vi'
      })
    ).toBe('Cách sử dụng của Gemini')
  })

  it('reverts Linear common-word rendering but keeps an already-Latin one', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'How Linear works in Orca: browse issues',
        localeValue: 'Cách tuyến tính hoạt động trong Orca: duyệt các vấn đề',
        locale: 'vi'
      })
    ).toBe('Cách Linear hoạt động trong Orca: duyệt các vấn đề')
  })

  it('repairs Claude Code rendered as Mã Claude', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'Sign in with Claude Code to continue',
        localeValue: 'Đăng nhập bằng Mã Claude để tiếp tục',
        locale: 'vi'
      })
    ).toBe('Đăng nhập bằng Claude Code để tiếp tục')
  })

  it('keeps tech terms Latin inside a sentence (commit, branch, terminal)', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'commits this week',
        localeValue: 'cam kết tuần này',
        locale: 'vi'
      })
    ).toBe('commits tuần này')
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'Switch branch',
        localeValue: 'Chuyển nhánh',
        locale: 'vi'
      })
    ).toBe('Chuyển branch')
  })
})

describe('vi value overrides (observed GT-vi wrong buttons)', () => {
  it('pins Quit to Thoát, not Từ bỏ', () => {
    expect(
      repairTranslatedValue({
        key: 'menu.exit',
        enValue: 'Quit',
        localeValue: 'Từ bỏ',
        locale: 'vi'
      })
    ).toBe('Thoát')
  })

  it('pins Save to Lưu, not Cứu', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.x',
        enValue: 'Save',
        localeValue: 'Cứu',
        locale: 'vi'
      })
    ).toBe('Lưu')
  })
})

describe('NATIVE_PICKER_LABELS.vi pins all picker endonyms', () => {
  it('has an entry for every picker language including vietnamese', () => {
    expect(NATIVE_PICKER_LABELS.vi).toEqual({
      english: 'English',
      chinese: '中文（简体）',
      korean: '한국어',
      japanese: '日本語',
      spanish: 'Español',
      french: 'Français',
      vietnamese: 'Tiếng Việt'
    })
  })

  it('repairCatalog rewrites GT-mangled picker labels back to endonyms', () => {
    const enCatalog = {
      settings: {
        appearance: {
          language: {
            title: 'Language',
            english: 'English',
            chinese: '中文（简体）',
            korean: '한국어',
            japanese: '日本語',
            spanish: 'Español',
            french: 'Français',
            vietnamese: 'Tiếng Việt'
          }
        }
      }
    }
    const viCatalog = structuredClone(enCatalog)
    setLeaf(viCatalog, 'settings.appearance.language.chinese', 'Tiếng Trung (Giản thể)')
    setLeaf(viCatalog, 'settings.appearance.language.vietnamese', 'tiếng Việt')
    repairCatalog(enCatalog, viCatalog, 'vi')
    expect(viCatalog.settings.appearance.language.chinese).toBe('中文（简体）')
    expect(viCatalog.settings.appearance.language.vietnamese).toBe('Tiếng Việt')
    expect(viCatalog.settings.appearance.language.english).toBe('English')
  })
})

describe('translatedness counts preserve-set leaves as satisfied', () => {
  it('a vi value equal to a preserve-set en value is translated, not missing', () => {
    const enCatalog = { a: { reb: 'Rebase', save: 'Save', nested: { deep: 'Push' } } }
    const viCatalog = structuredClone(enCatalog)
    setLeaf(viCatalog, 'a.save', 'Lưu')
    const result = computeTranslatedness(enCatalog, viCatalog, 'vi')
    expect(result.total).toBe(3)
    expect(result.translated).toBe(3)
    expect(result.untranslated).toEqual([])
  })
})
