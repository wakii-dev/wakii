import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import { normalizeLoadedGlobalSettings } from './normalize-loaded-global-settings'
import { prepareLoadedTerminalSettings } from './prepare-loaded-terminal-settings'
import { prepareLoadedProfileSettings } from './prepare-loaded-profile-settings'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { PersistedState } from '../../../shared/persisted-state-types'

// Simulates a profile created before the dedicated Experimental switch was persisted.
function normalizeLegacyProfile(overrides: Record<string, unknown>): PersistedState['settings'] {
  const defaults = getDefaultPersistedState(homedir())
  const settings: Partial<GlobalSettings> = { ...defaults.settings }
  delete settings.experimentalActivity
  delete settings.experimentalAgentDashboardPopout
  Object.assign(settings, overrides)
  const parsed: PersistedState = { ...defaults, settings: settings as GlobalSettings }
  const noop = (): void => {}
  const terminal = prepareLoadedTerminalSettings(parsed, noop)
  const profile = prepareLoadedProfileSettings(parsed, defaults, noop)
  return normalizeLoadedGlobalSettings(parsed, terminal, profile)
}

describe('retired Agents sidebar setting', () => {
  it('does not mark new profiles as migrated', () => {
    expect(normalizeLegacyProfile({}).agentsSidebarMigratedFromExperimental).toBe(false)
  })

  it('drops the old visibility setting while preserving migration metadata', () => {
    const normalized = normalizeLegacyProfile({
      experimentalActivity: true,
      showAgentsSidebar: false
    })
    expect('showAgentsSidebar' in normalized).toBe(false)
    expect(normalized.agentsSidebarMigratedFromExperimental).toBe(true)
  })
})

describe('editor minimap one-shot stamp (desktop store wiring)', () => {
  // Why a bespoke harness: normalizeLegacyProfile seeds defaults, which now carry the
  // stamp; a legacy profile predates the stamp entirely, so it must be stripped.
  function normalizePreStampProfile(overrides: Record<string, unknown>): PersistedState['settings'] {
    const defaults = getDefaultPersistedState(homedir())
    const settings: Partial<GlobalSettings> = { ...defaults.settings }
    delete settings.editorMinimapEnabledDefaultedOnForAllUsers
    Object.assign(settings, overrides)
    const parsed: PersistedState = { ...defaults, settings: settings as GlobalSettings }
    const noop = (): void => {}
    const terminal = prepareLoadedTerminalSettings(parsed, noop)
    const profile = prepareLoadedProfileSettings(parsed, defaults, noop)
    return normalizeLoadedGlobalSettings(parsed, terminal, profile)
  }

  it('flips a legacy persisted-off profile on exactly once', () => {
    const normalized = normalizePreStampProfile({ editorMinimapEnabled: false })
    expect(normalized.editorMinimapEnabled).toBe(true)
    expect(normalized.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })

  it('honors a stamped opt-out', () => {
    const normalized = normalizePreStampProfile({
      editorMinimapEnabled: false,
      editorMinimapEnabledDefaultedOnForAllUsers: true
    })
    expect(normalized.editorMinimapEnabled).toBe(false)
    expect(normalized.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })

  it('defaults fresh profiles on', () => {
    const defaults = getDefaultPersistedState(homedir())
    expect(defaults.settings.editorMinimapEnabled).toBe(true)
    expect(defaults.settings.editorMinimapEnabledDefaultedOnForAllUsers).toBe(true)
  })
})
