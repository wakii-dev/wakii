import { describe, expect, it } from 'vitest'
import {
  buildTerminalSendPayload,
  maybeWrapTerminalSendTextForTuiAgent
} from './terminal-send-payload'

// Why: plugin terminal.sendText is the path panels use to reach agent TUIs. A
// TUI submits on every newline, so multi-line prompt text must ride inside one
// bracketed paste or the agent receives only the first line as its prompt.
describe('maybeWrapTerminalSendTextForTuiAgent', () => {
  const PASTE_BEGIN = '\x1b[200~'
  const PASTE_END = '\x1b[201~'
  const multiline = 'Use the story-workflow skill to CREATE A STORY:\nline two\nline three'

  it('wraps text in bracketed paste for a TUI agent', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text: multiline, enter: true }, 'claude')
    expect(routed.text?.startsWith(PASTE_BEGIN)).toBe(true)
    expect(routed.text?.endsWith(PASTE_END)).toBe(true)
    expect(routed.text).toContain('line two\nline three')
    expect(routed.enter).toBe(true)
  })

  it('wraps for every known TUI agent', () => {
    for (const agent of ['claude', 'codex'] as const) {
      const routed = maybeWrapTerminalSendTextForTuiAgent({ text: 'a\nb', enter: false }, agent)
      expect(routed.text?.startsWith(PASTE_BEGIN)).toBe(true)
    }
  })

  it('leaves non-TUI targets raw', () => {
    const action = { text: multiline, enter: true }
    expect(maybeWrapTerminalSendTextForTuiAgent(action, null)).toBe(action)
    expect(maybeWrapTerminalSendTextForTuiAgent(action, 'bash')).toBe(action)
  })

  it('leaves empty text untouched', () => {
    const action = { enter: true }
    expect(maybeWrapTerminalSendTextForTuiAgent(action, 'claude')).toBe(action)
  })

  it('buildTerminalSendPayload appends enter to the wrapped text', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text: 'a\nb', enter: true }, 'claude')
    const payload = buildTerminalSendPayload(routed)
    expect(payload?.endsWith('\r')).toBe(true)
    expect(payload).toBe(`${PASTE_BEGIN}a\nb${PASTE_END}\r`)
  })
})
