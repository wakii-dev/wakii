import { beforeEach, describe, expect, it } from 'vitest'

import {
  UI_LANGUAGE_CHINESE,
  UI_LANGUAGE_ENGLISH,
  UI_LANGUAGE_SPANISH,
  UI_LANGUAGE_VIETNAMESE
} from '../../../shared/ui-language'
import { i18n, setRendererPluginLanguagePacks, setRendererUiLanguage } from './i18n'
import { pluginLanguageResourceId } from '../../../shared/plugins/plugin-language-pack-artifact'

// Why: the renderer now lazy-loads non-English catalogs through an i18next
// backend instead of bundling all five into the startup chunk. This guards the
// invariant that switching language (I18nProvider effect / Settings) resolves
// real translations once changeLanguage() settles — and that any direct
// i18n.changeLanguage() call (used across the codebase and tests) transparently
// loads its catalog. A regression would silently show English to a user who
// picked another language.

describe('renderer i18n lazy locale loading', () => {
  beforeEach(async () => {
    setRendererPluginLanguagePacks([])
    await i18n.changeLanguage('en')
  })

  it('serves English synchronously from the eager bundle', () => {
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('File')
  })

  it('lazy-loads Spanish via setRendererUiLanguage before it resolves', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_SPANISH)
    expect(i18n.language).toBe('es')
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Archivo')
  })

  it('lazy-loads a catalog through a direct changeLanguage call', async () => {
    await i18n.changeLanguage(UI_LANGUAGE_CHINESE)
    expect(i18n.t('menu.file', { defaultValue: 'File' })).not.toBe('File')
  })

  it('uses the inline English default when a target catalog omits a key', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_SPANISH)
    expect(i18n.t('missing.renderer.feature', { defaultValue: 'English fallback' })).toBe(
      'English fallback'
    )
  })

  it('returns to English from a lazily-loaded locale', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_SPANISH)
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Archivo')

    await setRendererUiLanguage(UI_LANGUAGE_ENGLISH)
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('File')
  })

  // VI-1 SF-3: the Vietnamese catalog ships 100% translated, so the lazy load
  // must deliver real Vietnamese — not the English fallback — for every
  // built-in key, while keys the catalog legitimately omits still fall back.
  it('lazy-loads Vietnamese via setRendererUiLanguage', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_VIETNAMESE)
    expect(i18n.language).toBe('vi')
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Tệp')

    await setRendererUiLanguage(UI_LANGUAGE_ENGLISH)
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('File')
  })

  it('falls back to English for a key vi.json omits', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_VIETNAMESE)
    expect(i18n.t('missing.renderer.feature', { defaultValue: 'English fallback' })).toBe(
      'English fallback'
    )
  })

  // Plugin-pack precedence: a pack declaring locale `vi` registers under its
  // own synthetic resource language, so selecting the pack's UI language wins
  // over the built-in vi catalog — while the built-in vi choice stays intact.
  it('lets a plugin pack declaring vi override the built-in vi catalog', async () => {
    const id = 'plugin:orca-samples.vietnamese/vi' as const
    setRendererPluginLanguagePacks([
      {
        id,
        resourceLanguage: pluginLanguageResourceId(id),
        pluginKey: 'orca-samples.vietnamese',
        locale: 'vi',
        catalog: { menu: { file: 'Tệp Wakii' } }
      }
    ])

    await setRendererUiLanguage(id)
    expect(i18n.language).toBe(pluginLanguageResourceId(id))
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Tệp Wakii')

    // The built-in vi pick still resolves the shipped catalog, not the pack's.
    await setRendererUiLanguage(UI_LANGUAGE_VIETNAMESE)
    expect(i18n.language).toBe('vi')
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Tệp')

    setRendererPluginLanguagePacks([])
    await setRendererUiLanguage(id)
    expect(i18n.language).toBe('en')
  })

  it('loads an isolated catalog contributed by an enabled plugin', async () => {
    const id = 'plugin:orca-samples.portuguese/pt-BR' as const
    setRendererPluginLanguagePacks([
      {
        id,
        resourceLanguage: pluginLanguageResourceId(id),
        pluginKey: 'orca-samples.portuguese',
        locale: 'pt-BR',
        catalog: { menu: { file: 'Arquivo Wakii' } }
      }
    ])

    await setRendererUiLanguage(id)
    expect(i18n.language).toBe(pluginLanguageResourceId(id))
    expect(i18n.t('menu.file', { defaultValue: 'File' })).toBe('Arquivo Wakii')

    setRendererPluginLanguagePacks([])
    await setRendererUiLanguage(id)
    expect(i18n.language).toBe('en')
  })
})
