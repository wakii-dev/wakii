import { describe, expect, it } from 'vitest'

import { filterLeavesByPrefix, parsePrefixArg } from './bootstrap-locale-catalog.mjs'

const LEAVES = [
  { key: 'settings.appearance.title', value: 'Appearance' },
  { key: 'auto.components.settings.TerminalWindowSection.abc', value: 'Shell' },
  { key: 'auto.components.sidebar.header', value: 'Sidebar' },
  { key: 'menu.file', value: 'File' }
]

describe('parsePrefixArg', () => {
  it('returns [] when no --prefix flag', () => {
    expect(parsePrefixArg(['node', 'script.mjs', 'vi'])).toEqual([])
  })

  it('reads single --prefix value', () => {
    expect(parsePrefixArg(['node', 's.mjs', 'vi', '--prefix', 'settings.'])).toEqual(['settings.'])
  })

  it('splits comma-separated prefixes and trims blanks', () => {
    expect(
      parsePrefixArg(['node', 's.mjs', 'vi', '--prefix', 'settings., auto.components.sidebar.,'])
    ).toEqual(['settings.', 'auto.components.sidebar.'])
  })

  it('accumulates repeated --prefix flags', () => {
    expect(
      parsePrefixArg(['node', 's.mjs', 'vi', '--prefix', 'settings.', '--prefix', 'menu.'])
    ).toEqual(['settings.', 'menu.'])
  })
})

describe('filterLeavesByPrefix', () => {
  it('returns all leaves when prefix list empty (full run)', () => {
    expect(filterLeavesByPrefix(LEAVES, [])).toEqual(LEAVES)
  })

  it('keeps leaves matching any prefix', () => {
    const scoped = filterLeavesByPrefix(LEAVES, ['settings.', 'auto.components.settings.'])
    expect(scoped.map((leaf) => leaf.key)).toEqual([
      'settings.appearance.title',
      'auto.components.settings.TerminalWindowSection.abc'
    ])
  })

  it('does not match auto.components.settings.* with bare settings. prefix', () => {
    const scoped = filterLeavesByPrefix(LEAVES, ['settings.'])
    expect(scoped.map((leaf) => leaf.key)).toEqual(['settings.appearance.title'])
  })
})
