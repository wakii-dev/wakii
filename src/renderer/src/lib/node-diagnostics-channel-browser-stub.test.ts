import { describe, expect, it } from 'vitest'
import { channel, default as stubDefault, hasSubscribers, subscribe, tracingChannel } from './node-diagnostics-channel-browser-stub'

describe('node:diagnostics_channel browser stub', () => {
  it('exposes a no-op channel surface for addon tracing', () => {
    const chan = channel('xterm-ligatures')
    expect(() => chan.addHandler(() => {})).not.toThrow()
    expect(() => chan.removeHandler(() => {})).not.toThrow()
    expect(chan.dispatch('event')).toBe(false)
    expect(chan.hasSubscribers).toBe(false)
  })

  it('covers every specifier shape the addon bundle may reach', () => {
    expect(typeof subscribe('name', () => {})).toBe('function')
    expect(hasSubscribers('name')).toBe(false)
    expect(tracingChannel('name')).toEqual({})
    expect(typeof stubDefault.channel).toBe('function')
  })
})
