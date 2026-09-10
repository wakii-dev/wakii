import { describe, expect, it, vi } from 'vitest'
import { bindPluginHostServices } from './plugin-host-service-bindings'

const WORKTREE_ID = 'wt-1'
const TERMINAL_ID = 'term_1'

function makeDelegate() {
  return {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue({
      worktreeId: WORKTREE_ID,
      branch: 'main',
      displayName: 'W',
      path: '/w'
    }),
    listTerminals: vi.fn().mockResolvedValue({ terminals: [{ handle: TERMINAL_ID }] }),
    sendTerminal: vi.fn().mockResolvedValue({ accepted: true }),
    sendTerminalAgentPrompt: vi.fn().mockResolvedValue({ accepted: true }),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true })
  }
}

// Panels compose multi-line agent prompts. Submit-carrying sends must ride the
// agent-prompt path (one atomic bracketed paste + settled submit) — a raw
// multi-line write reaches a TUI composer as one fragment per newline.
describe('sendTerminalText routing', () => {
  it('uses sendTerminalAgentPrompt when enter=true', async () => {
    const delegate = makeDelegate()
    const services = bindPluginHostServices({
      delegate: delegate as never,
      pluginsDataDir: '/tmp/x',
      subscribeEvents: (_k, events) => events
    })
    const result = await services.sendTerminalText(TERMINAL_ID, {
      text: 'a\nb\nc',
      enter: true
    })
    expect(result.accepted).toBe(true)
    expect(delegate.sendTerminalAgentPrompt).toHaveBeenCalledWith(TERMINAL_ID, 'a\nb\nc')
    expect(delegate.sendTerminal).not.toHaveBeenCalled()
  })

  it('keeps the raw path for enter=false', async () => {
    const delegate = makeDelegate()
    const services = bindPluginHostServices({
      delegate: delegate as never,
      pluginsDataDir: '/tmp/x',
      subscribeEvents: (_k, events) => events
    })
    await services.sendTerminalText(TERMINAL_ID, { text: 'echo hi', enter: false })
    expect(delegate.sendTerminal).toHaveBeenCalled()
    expect(delegate.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
})
