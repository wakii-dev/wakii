import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { bindPluginHostServices } from './plugin-host-service-bindings'

const WORKTREE_ID = 'wt-1'
const TERMINAL_ID = 'term_1'

function makeDelegate(worktreePath = '/w') {
  return {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue({
      worktreeId: WORKTREE_ID,
      branch: 'main',
      displayName: 'W',
      path: worktreePath
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

// workspace fs reads are containment-guarded against the real worktree root —
// escape attempts must fail even when the schema-validating facade is bypassed.
describe('readWorktreeFile containment', () => {
  it('reads a file under the worktree root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-plugin-read-'))
    try {
      mkdirSync(join(root, 'docs', 'brackets'), { recursive: true })
      writeFileSync(join(root, 'docs', 'brackets', 'a.md'), '# plan', 'utf8')
      const services = bindPluginHostServices({
        delegate: makeDelegate(root) as never,
        pluginsDataDir: join(root, 'plugins-data'),
        subscribeEvents: (_k, events) => events
      })
      await expect(services.readWorktreeFile('docs/brackets/a.md')).resolves.toEqual({
        content: '# plan'
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws on missing file, directory target, and escape attempts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-plugin-read-'))
    try {
      mkdirSync(join(root, 'docs'), { recursive: true })
      const services = bindPluginHostServices({
        delegate: makeDelegate(root) as never,
        pluginsDataDir: join(root, 'plugins-data'),
        subscribeEvents: (_k, events) => events
      })
      await expect(services.readWorktreeFile('docs/missing.md')).rejects.toThrow(
        'file not found: docs/missing.md'
      )
      await expect(services.readWorktreeFile('docs')).rejects.toThrow('path is a directory: docs')
      await expect(services.readWorktreeFile('../outside.md')).rejects.toThrow(
        'path escapes the active worktree'
      )
      await expect(services.readWorktreeFile('/etc/hosts')).rejects.toThrow(
        'path escapes the active worktree'
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when no active worktree is available', async () => {
    const delegate = makeDelegate()
    delegate.resolveActiveWorktreeContext.mockResolvedValue(null)
    const services = bindPluginHostServices({
      delegate: delegate as never,
      pluginsDataDir: '/tmp/x',
      subscribeEvents: (_k, events) => events
    })
    await expect(services.readWorktreeFile('docs/a.md')).rejects.toThrow(
      'no active worktree is available'
    )
  })
})
