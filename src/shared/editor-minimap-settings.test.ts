import { describe, expect, it } from 'vitest'
import { normalizeEditorMinimapDefaultOn } from './editor-minimap-settings'

describe('normalizeEditorMinimapDefaultOn', () => {
  it('flips an unstamped profile on, because its `false` came from the old default', () => {
    expect(normalizeEditorMinimapDefaultOn({ editorMinimapEnabled: false })).toEqual({
      editorMinimapEnabled: true,
      editorMinimapEnabledDefaultedOnForAllUsers: true
    })
  })

  it('keeps an unstamped persisted `true` on (no downgrade)', () => {
    expect(normalizeEditorMinimapDefaultOn({ editorMinimapEnabled: true })).toEqual({
      editorMinimapEnabled: true,
      editorMinimapEnabledDefaultedOnForAllUsers: true
    })
  })

  it('leaves a stamped opt-out off', () => {
    expect(
      normalizeEditorMinimapDefaultOn({
        editorMinimapEnabled: false,
        editorMinimapEnabledDefaultedOnForAllUsers: true
      })
    ).toEqual({
      editorMinimapEnabled: false,
      editorMinimapEnabledDefaultedOnForAllUsers: true
    })
  })

  it('defaults a fresh or absent profile on', () => {
    for (const settings of [
      undefined,
      {},
      { editorMinimapEnabledDefaultedOnForAllUsers: true }
    ]) {
      expect(normalizeEditorMinimapDefaultOn(settings)).toEqual({
        editorMinimapEnabled: true,
        editorMinimapEnabledDefaultedOnForAllUsers: true
      })
    }
  })

  it('is idempotent, so a crash before the write-back cannot re-flip an opt-out', () => {
    const once = normalizeEditorMinimapDefaultOn({ editorMinimapEnabled: false })
    expect(normalizeEditorMinimapDefaultOn(once)).toEqual(once)

    const optedOut = normalizeEditorMinimapDefaultOn({
      editorMinimapEnabled: false,
      editorMinimapEnabledDefaultedOnForAllUsers: true
    })
    expect(normalizeEditorMinimapDefaultOn(optedOut)).toEqual(optedOut)
  })
})
