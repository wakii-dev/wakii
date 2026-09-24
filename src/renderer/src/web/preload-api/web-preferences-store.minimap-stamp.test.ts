// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_STORAGE_KEY } from './web-storage'

import { getStoredSettings } from './web-preferences-store'

beforeEach(() => {
  window.localStorage.clear()
})

describe('web-preferences-store editor minimap one-shot stamp', () => {
  it('flips a legacy persisted-off profile on and writes the stamp back', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ editorMinimapEnabled: false })
    )

    const settings = getStoredSettings()

    expect(settings.editorMinimapEnabled).toBe(true)
    expect(settings.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)

    const persisted = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'
    ) as Record<string, unknown>
    expect(persisted.editorMinimapEnabled).toBe(true)
    expect(persisted.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })

  it('honors a stamped manual opt-out across reloads', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        editorMinimapEnabled: false,
        editorMinimapEnabledDefaultedOnForAllUsers: true
      })
    )

    const settings = getStoredSettings()

    expect(settings.editorMinimapEnabled).toBe(false)
    expect(settings.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })

  it('defaults a fresh profile on', () => {
    const settings = getStoredSettings()
    expect(settings.editorMinimapEnabled).toBe(true)
    expect(settings.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })
})
