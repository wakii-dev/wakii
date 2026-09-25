import { describe, expect, it } from 'vitest'
import { buildDefaultSettings } from '../../../shared/default-global-settings'
import type { NotificationSettings } from '../../../shared/notification-settings-types'
import type { VoiceSettings } from '../../../shared/speech-types'
import { GIT_BLAME_STRINGS_EN } from '../components/editor/git-blame-strings'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import zh from './locales/zh.json'

// Keys follow the localize-renderer-strings formula: sha1(filePath:fallback)[:10]
// nested under auto.<dotted path segments>.
const GIT_BLAME_CATALOG_KEYS = {
  you: 'auto.components.editor.git.blame.strings.f553e19e41',
  stale: 'auto.components.editor.git.blame.strings.e6fc8a66b3',
  skipReasonTooLarge: 'auto.components.editor.git.blame.strings.5d58990105',
  skipReasonTooManyLines: 'auto.components.editor.git.blame.strings.1f32d46ce0',
  hashLabel: 'auto.components.editor.git.blame.strings.1f078da5df',
  authorLabel: 'auto.components.editor.git.blame.strings.6f3313de46',
  dateLabel: 'auto.components.editor.git.blame.strings.2f33a41d63'
} as const

const INLINE_BLAME_SETTING_KEYS = {
  title: 'auto.components.settings.InlineBlameSetting.683fd9af0f',
  description: 'auto.components.settings.InlineBlameSetting.9142b8bc2f'
} as const

const ALL_KEYS = [...Object.values(GIT_BLAME_CATALOG_KEYS), ...Object.values(INLINE_BLAME_SETTING_KEYS)]

const CATALOGS: Record<string, unknown> = { en, es, fr, ja, ko, zh }

function readCatalogValue(catalog: unknown, key: string): unknown {
  let current: unknown = catalog
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object') {
      return undefined
    }
    current = Reflect.get(current, segment)
  }
  return current
}

describe('inline blame settings defaults', () => {
  it('defaults inline blame on for new profiles', () => {
    const defaults = buildDefaultSettings({
      workspaceDir: '/workspace',
      appFontFamily: 'system-ui',
      editorAutoSaveDelayMs: 1_000,
      primarySelectionMiddleClickPaste: false,
      primarySelectionDefaultedForLinux: false,
      terminalFontFamily: 'monospace',
      terminalInactivePaneOpacity: 1,
      terminalRightClickToPaste: false,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: notification/voice defaults are irrelevant to editor settings under test; those sections are exercised by their own suites.
      notifications: {} as NotificationSettings,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: voice defaults are irrelevant to editor settings under test; those sections are exercised by their own suites.
      voice: {} as VoiceSettings
    })
    expect(defaults.editorInlineBlameEnabled).toBe(true)
  })
})

describe('git blame locale catalog', () => {
  it('ships every git blame string in all six locales', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const key of ALL_KEYS) {
        const value = readCatalogValue(catalog, key)
        expect(value, `${locale} missing ${key}`).toBeTypeOf('string')
        expect(value, `${locale} empty ${key}`).not.toBe('')
      }
    }
  })

  it('keeps the English catalog values in sync with the source fallbacks', () => {
    const englishValues: Record<string, string> = {
      [GIT_BLAME_CATALOG_KEYS.you]: GIT_BLAME_STRINGS_EN.you,
      [GIT_BLAME_CATALOG_KEYS.stale]: GIT_BLAME_STRINGS_EN.stale,
      [GIT_BLAME_CATALOG_KEYS.skipReasonTooLarge]: GIT_BLAME_STRINGS_EN.skipReasonTooLarge,
      [GIT_BLAME_CATALOG_KEYS.skipReasonTooManyLines]: GIT_BLAME_STRINGS_EN.skipReasonTooManyLines,
      [GIT_BLAME_CATALOG_KEYS.hashLabel]: GIT_BLAME_STRINGS_EN.hashLabel,
      [GIT_BLAME_CATALOG_KEYS.authorLabel]: GIT_BLAME_STRINGS_EN.authorLabel,
      [GIT_BLAME_CATALOG_KEYS.dateLabel]: GIT_BLAME_STRINGS_EN.dateLabel,
      [INLINE_BLAME_SETTING_KEYS.title]: 'Inline Blame',
      [INLINE_BLAME_SETTING_KEYS.description]:
        'Show commit author, date and summary at the end of the current line in the file editor.'
    }
    for (const [key, expected] of Object.entries(englishValues)) {
      expect(readCatalogValue(en, key)).toBe(expected)
    }
  })
})
