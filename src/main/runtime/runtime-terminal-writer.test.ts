import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeTerminalWriter } from './runtime-terminal-writer'
import { getAgentPromptSubmitDelayMs } from '../../shared/agent-prompt-injection'
import { TERMINAL_INPUT_CHUNK_MAX_BYTES } from '../../shared/terminal-input'

// Why (#59): the raw single-line fast path bypasses bracketed-paste framing, so
// the only Enter safety left is the writer's own pacing. These pins prove the
// suffix hold is computed from the text byte length it receives — framing or
// no framing — and never skipped for unframed payloads.

function makeWriter(platform: NodeJS.Platform = 'linux'): {
  writer: RuntimeTerminalWriter
  write: ReturnType<typeof vi.fn>
} {
  const write = vi.fn(() => true)
  return { writer: new RuntimeTerminalWriter(write, () => platform), write }
}

describe('runtime terminal writer pacing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds Enter for the settle window after raw unframed single-line text', async () => {
    vi.useFakeTimers()
    const { writer, write } = makeWriter()
    const text = 'git status'
    const holdMs = getAgentPromptSubmitDelayMs('linux', Buffer.byteLength(text, 'utf8'))
    const done = writer.writeAction('pty-1', { text, enter: true }, `${text}\r`)

    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenNthCalledWith(1, 'pty-1', text)

    await vi.advanceTimersByTimeAsync(holdMs - 1)
    expect(write).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenNthCalledWith(2, 'pty-1', '\r')
    await done
  })

  it('paces Enter on the full text byte length including the chunked ingest floor', async () => {
    vi.useFakeTimers()
    const { writer, write } = makeWriter()
    const text = 'y'.repeat(TERMINAL_INPUT_CHUNK_MAX_BYTES + 1)
    const holdMs = getAgentPromptSubmitDelayMs('linux', Buffer.byteLength(text, 'utf8'))
    expect(holdMs).toBeGreaterThan(getAgentPromptSubmitDelayMs('linux', 0))
    const done = writer.writeAction('pty-1', { text, enter: true }, `${text}\r`)

    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(holdMs - 1)
    expect(write).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenNthCalledWith(3, 'pty-1', '\r')
    await done
  })
})
