import type { GlobalSettings } from './global-settings-types'

type EditorMinimapSettings = Pick<
  GlobalSettings,
  'editorMinimapEnabled' | 'editorMinimapEnabledDefaultedOnForAllUsers'
>

export function normalizeEditorMinimapDefaultOn(
  settings: Partial<EditorMinimapSettings> | undefined
): EditorMinimapSettings {
  const defaultedOn = settings?.editorMinimapEnabledDefaultedOnForAllUsers === true

  return {
    // Why: profiles saved under the old off default persisted `false`, which is
    // indistinguishable from a real opt-out; only stamped profiles can express one.
    editorMinimapEnabled: defaultedOn ? (settings?.editorMinimapEnabled ?? true) : true,
    editorMinimapEnabledDefaultedOnForAllUsers: true
  }
}
