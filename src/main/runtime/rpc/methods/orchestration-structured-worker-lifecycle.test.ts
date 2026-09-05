import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredWorkerIdentity } from '../../structured-worker-identity'

const hostRef: { current: unknown } = { current: null }

vi.mock('../../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => hostRef.current
}))
vi.mock('./orchestration-structured-worker-session', () => ({
  releaseStructuredWorkerSession: vi.fn()
}))

const {
  captureStructuredWorkerArchive,
  observeStructuredWorker,
  readArchivedStructuredJournal,
  readStructuredWorkerJournal,
  stopStructuredWorker
} = await import('./orchestration-structured-worker-lifecycle')

const IDENTITY: StructuredWorkerIdentity = {
  handle: 'structworker_1',
  sessionId: 'session-1',
  agent: 'claude',
  paneKey: 'structured-agent-session-session-1:11111111-1111-4111-a111-111111111111',
  processIncarnation: 'structured:session-1',
  worktreeId: 'wt_1',
  hostScope: { kind: 'local', hostId: 'local' }
}

const ITEMS: AgentJournalRenderItem[] = [
  {
    itemId: 'i1',
    observedAt: 1,
    body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'hello' }] }
  } as unknown as AgentJournalRenderItem
]

function installHost(options: {
  items?: AgentJournalRenderItem[]
  hasSession?: boolean
  claimStatus?: string
  runtimeKind?: string
  deathEvidence?: unknown
  record?: unknown
  close?: () => Promise<void>
}) {
  const record =
    options.record === undefined
      ? {
          location: { executionHostId: 'local', wslDistro: null },
          lease: {
            runtimeKind: options.runtimeKind ?? 'native',
            claimStatus: options.claimStatus ?? 'live',
            deathEvidence: options.deathEvidence ?? null,
            runtimeFence: 3
          }
        }
      : options.record
  let closed = false
  hostRef.current = {
    deps: { store: { getRecord: () => record } },
    hasSession: () => (closed ? false : (options.hasSession ?? true)),
    setSessionTabVisibility: async () => {},
    close:
      options.close ??
      (async () => {
        closed = true
      }),
    history: () => ({
      ok: true,
      page: { items: options.items ?? ITEMS, hasOlder: false }
    })
  }
}

describe('structured worker observation', () => {
  beforeEach(() => {
    hostRef.current = null
  })

  it('is unverifiable, never exited, when the host is not installed', () => {
    // Not being able to look is not a death certificate.
    expect(observeStructuredWorker(IDENTITY)).toEqual({
      status: 'unverifiable',
      reason: expect.stringContaining('not installed')
    })
  })

  it('is live when the host holds the session under a live native lease', () => {
    installHost({})
    expect(observeStructuredWorker(IDENTITY).status).toBe('live')
  })

  it('is exited only on a released lease with death evidence', () => {
    installHost({
      claimStatus: 'released',
      deathEvidence: { kind: 'exit-observed', detail: 'x', observedAt: 1 }
    })
    expect(observeStructuredWorker(IDENTITY).status).toBe('exited')
  })

  it('is unverifiable when the lease moved to a terminal owner', () => {
    installHost({ runtimeKind: 'tui' })
    expect(observeStructuredWorker(IDENTITY).status).toBe('unverifiable')
  })
})

describe('structured worker stop', () => {
  beforeEach(() => {
    hostRef.current = null
  })

  it('settles only when the session is proven gone after the close', async () => {
    installHost({})
    await expect(stopStructuredWorker(IDENTITY, 'd1')).resolves.toEqual({ stopped: true })
  })

  it('retains when the close throws', async () => {
    installHost({
      close: async () => {
        throw new Error('close is queued for retry')
      }
    })
    const result = await stopStructuredWorker(IDENTITY, 'd1')
    expect(result.stopped).toBe(false)
    expect(result.reason).toContain('retry')
  })

  it('retains when the session is still attached after the close', async () => {
    installHost({ hasSession: true, close: async () => {} })
    const result = await stopStructuredWorker(IDENTITY, 'd1')
    expect(result.stopped).toBe(false)
  })

  it('retains when the host is not installed', async () => {
    const result = await stopStructuredWorker(IDENTITY, 'd1')
    expect(result.stopped).toBe(false)
  })
})

describe('structured worker output', () => {
  beforeEach(() => {
    hostRef.current = null
  })

  it('round-trips the journal through the archive and back out of a released read', () => {
    installHost({})
    const live = readStructuredWorkerJournal({
      identity: IDENTITY,
      dispatchId: 'd1',
      workerState: 'ready',
      agent: 'claude'
    })
    expect(live.source).toBe('transcript')
    const archive = captureStructuredWorkerArchive(IDENTITY, 'claude')
    hostRef.current = null
    const archived = readArchivedStructuredJournal({
      dispatchId: 'd1',
      workerState: 'succeeded',
      resourceId: 'res_1',
      createdAt: '2026-09-05 00:00:00',
      archive
    })
    expect(archived.source).toBe('transcript')
    expect(archived.archived).toBe(true)
    expect(archived.transcript?.messages).toHaveLength(1)
    expect(archived.transcript?.messages[0]?.blocks[0]).toMatchObject({ text: 'hello' })
    // The frozen source has its own identity, so a live cursor cannot be replayed against it.
    expect(archived.sourceIdentity).not.toBe(live.sourceIdentity)
  })

  it('redacts dispatch capabilities from the archived journal', () => {
    installHost({
      items: [
        {
          itemId: 'i1',
          observedAt: 1,
          body: {
            kind: 'message',
            role: 'assistant',
            blocks: [{ type: 'text', text: `token dcap_${'a'.repeat(30)} here` }]
          }
        } as unknown as AgentJournalRenderItem
      ]
    })
    const archive = captureStructuredWorkerArchive(IDENTITY, 'claude')
    expect(JSON.stringify(archive)).not.toContain('dcap_aaa')
    expect(JSON.stringify(archive)).toContain('[dispatch capability redacted]')
  })

  it('refuses to read a session the host no longer holds', () => {
    expect(() =>
      readStructuredWorkerJournal({
        identity: IDENTITY,
        dispatchId: 'd1',
        workerState: 'ready',
        agent: 'claude'
      })
    ).toThrow(/not attached/)
  })
})
