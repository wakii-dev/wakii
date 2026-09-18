import { describe, expect, it } from 'vitest'
import {
  buildTerminalSendPayload,
  maybeWrapTerminalSendTextForTuiAgent
} from './terminal-send-payload'
import { TERMINAL_INPUT_CHUNK_MAX_BYTES } from '../../shared/terminal-input'

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

  it('passes a single-line send raw without paste markers (#59)', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent(
      { text: 'git status', enter: true },
      'claude'
    )
    expect(routed.text).toBe('git status')
    expect(routed.enter).toBe(true)
  })

  it('neutralizes ESC sequences on the raw single-line path without markers', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent(
      { text: 'echo \x1b[31mred', enter: true },
      'claude'
    )
    expect(routed.text).toBe('echo <ESC>[31mred')
    expect(routed.text).not.toContain('\x1b[200~')
  })

  it('preserves a CRLF terminator in single-line output (detection-only strip)', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent(
      { text: 'orca status\r\n', enter: false },
      'claude'
    )
    expect(routed.text).toBe('orca status\r\n')
    expect(routed.text?.includes(PASTE_BEGIN)).toBe(false)
  })

  it('treats a lone trailing CR as single-line and preserves it', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text: 'x\r', enter: false }, 'claude')
    expect(routed.text).toBe('x\r')
    expect(routed.text?.includes(PASTE_BEGIN)).toBe(false)
  })

  it('keeps a CR inside the body on the wrapped multiline path', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text: 'a\rb', enter: true }, 'claude')
    expect(routed.text?.startsWith(PASTE_BEGIN)).toBe(true)
    expect(routed.text?.endsWith(PASTE_END)).toBe(true)
  })

  it('keeps a CRLF body on the wrapped multiline path', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text: 'a\r\nb', enter: true }, 'claude')
    expect(routed.text?.startsWith(PASTE_BEGIN)).toBe(true)
    expect(routed.text).toContain('a\r\nb')
  })

  it('leaves empty-string text untouched', () => {
    const action = { text: '', enter: true }
    expect(maybeWrapTerminalSendTextForTuiAgent(action, 'claude')).toBe(action)
  })

  it('passes an oversized single-line payload raw for downstream chunking', () => {
    const text = 'y'.repeat(TERMINAL_INPUT_CHUNK_MAX_BYTES + 1)
    const routed = maybeWrapTerminalSendTextForTuiAgent({ text, enter: true }, 'claude')
    expect(routed.text).toBe(text)
    expect(routed.text?.includes(PASTE_BEGIN)).toBe(false)
  })

  it('preserves the interrupt flag through the single-line gate', () => {
    const routed = maybeWrapTerminalSendTextForTuiAgent(
      { text: 'git status', interrupt: true },
      'codex'
    )
    expect(routed.interrupt).toBe(true)
    expect(routed.enter).toBeUndefined()
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
