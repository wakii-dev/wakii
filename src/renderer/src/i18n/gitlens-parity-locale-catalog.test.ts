// Acceptance contract — GitLens-parity i18n (SF-1 hover card + SF-2 toggle
// setting + SF-3 context menu). Intentionally RED until the two strings
// modules exist and every catalog ships the new keys. Keys follow the
// localize-renderer-strings formula: sha1(filePath:fallback)[:10] nested
// under auto.<dotted path segments> — same pattern as
// git-blame-locale-catalog.test.ts.
import { describe, expect, it } from 'vitest'
import { buildDefaultSettings } from '../../../shared/default-global-settings'
import type { NotificationSettings } from '../../../shared/notification-settings-types'
import type { VoiceSettings } from '../../../shared/speech-types'
import { GIT_BLAME_HOVER_CARD_STRINGS_EN } from '../components/editor/git-blame-hover-card-strings'
import { GIT_CONTEXT_MENU_STRINGS_EN } from '../components/editor/git-context-menu-strings'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import vi from './locales/vi.json'
import zh from './locales/zh.json'

// Every string in git-blame-hover-card-strings.ts — asserting the full set (not
// a sample) is what catches a locale missing a key the module translates.
const HOVER_CARD_CATALOG_KEYS = {
  viewCommit: 'auto.components.editor.git.blame.hover.card.strings.a50716ea63',
  blamePrevious: 'auto.components.editor.git.blame.hover.card.strings.40fa6020df',
  copySha: 'auto.components.editor.git.blame.hover.card.strings.0eae340db7',
  committedLabel: 'auto.components.editor.git.blame.hover.card.strings.90ad97b410',
  loadingDiff: 'auto.components.editor.git.blame.hover.card.strings.3391c6e774',
  diffError: 'auto.components.editor.git.blame.hover.card.strings.8e4efd3b58',
  diffTruncated: 'auto.components.editor.git.blame.hover.card.strings.9e1ebf17fd',
  binaryFile: 'auto.components.editor.git.blame.hover.card.strings.d100bd0ac1',
  viewingBlameAt: 'auto.components.editor.git.blame.hover.card.strings.72ed431302',
  backToHead: 'auto.components.editor.git.blame.hover.card.strings.b82be82a58'
} as const

const GIT_CONTEXT_MENU_CATALOG_KEYS = {
  openFileHistory: 'auto.components.editor.git.context.menu.strings.99fa55520a',
  toggleFileBlame: 'auto.components.editor.git.context.menu.strings.59d25cc797'
} as const

const FILE_BLAME_SETTING_KEYS = {
  title: 'auto.components.settings.FileBlameSetting.563f0463d9',
  description: 'auto.components.settings.FileBlameSetting.308f71ffa1'
} as const

const FILE_BLAME_SETTING_EN = {
  title: 'File Blame',
  description: 'Show blame for every line of the file in the editor gutter.'
} as const

const ALL_KEYS = [
  ...Object.values(HOVER_CARD_CATALOG_KEYS),
  ...Object.values(GIT_CONTEXT_MENU_CATALOG_KEYS),
  ...Object.values(FILE_BLAME_SETTING_KEYS)
]

const CATALOGS: Record<string, unknown> = { en, es, fr, ja, ko, vi, zh }

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

describe('gitlens-parity locale catalog', () => {
  it('ships every new GitLens-parity string in all seven locales', () => {
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
      [HOVER_CARD_CATALOG_KEYS.viewCommit]: GIT_BLAME_HOVER_CARD_STRINGS_EN.viewCommit,
      [HOVER_CARD_CATALOG_KEYS.blamePrevious]: GIT_BLAME_HOVER_CARD_STRINGS_EN.blamePrevious,
      [HOVER_CARD_CATALOG_KEYS.copySha]: GIT_BLAME_HOVER_CARD_STRINGS_EN.copySha,
      [HOVER_CARD_CATALOG_KEYS.committedLabel]: GIT_BLAME_HOVER_CARD_STRINGS_EN.committedLabel,
      [HOVER_CARD_CATALOG_KEYS.loadingDiff]: GIT_BLAME_HOVER_CARD_STRINGS_EN.loadingDiff,
      [HOVER_CARD_CATALOG_KEYS.diffError]: GIT_BLAME_HOVER_CARD_STRINGS_EN.diffError,
      [HOVER_CARD_CATALOG_KEYS.diffTruncated]: GIT_BLAME_HOVER_CARD_STRINGS_EN.diffTruncated,
      [HOVER_CARD_CATALOG_KEYS.binaryFile]: GIT_BLAME_HOVER_CARD_STRINGS_EN.binaryFile,
      [HOVER_CARD_CATALOG_KEYS.viewingBlameAt]: GIT_BLAME_HOVER_CARD_STRINGS_EN.viewingBlameAt,
      [HOVER_CARD_CATALOG_KEYS.backToHead]: GIT_BLAME_HOVER_CARD_STRINGS_EN.backToHead,
      [GIT_CONTEXT_MENU_CATALOG_KEYS.openFileHistory]: GIT_CONTEXT_MENU_STRINGS_EN.openFileHistory,
      [GIT_CONTEXT_MENU_CATALOG_KEYS.toggleFileBlame]: GIT_CONTEXT_MENU_STRINGS_EN.toggleFileBlame,
      [FILE_BLAME_SETTING_KEYS.title]: FILE_BLAME_SETTING_EN.title,
      [FILE_BLAME_SETTING_KEYS.description]: FILE_BLAME_SETTING_EN.description
    }
    for (const [key, expected] of Object.entries(englishValues)) {
      expect(readCatalogValue(en, key)).toBe(expected)
    }
  })
})

describe('gitlens-parity settings defaults', () => {
  it('defaults file blame off for new profiles — the gutter is opt-in', () => {
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
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: notification/voice defaults are irrelevant to editor settings under test; those sections are exercised by their own suites.
      voice: {} as VoiceSettings
    })
    expect(defaults.editorFileBlameEnabled).toBe(false)
  })
})
