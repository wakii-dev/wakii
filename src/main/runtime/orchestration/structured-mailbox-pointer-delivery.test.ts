import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import type { AgentSessionPtyWriteRefusal } from '../../../shared/agent-session-pty-write-admission'
import {
  OrchestrationStructuredMailboxPointerDelivery,
  type StructuredMailboxPointerHost
} from './structured-mailbox-pointer-delivery'
import type { StructuredWorkerIdentity } from '../structured-worker-identity'

const IDENTITY: StructuredWorkerIdentity = {
  handle: 'structworker_1',
  sessionId: 'session-1',
  agent: 'claude',
  paneKey: 'structured-agent-session-session-1:11111111-1111-4111-a111-111111111111',
  processIncarnation: 'structured:session-1',
  worktreeId: 'wt_1',
  hostScope: { kind: 'local', hostId: 'local' }
}

function idleJournal(): AgentJournalRenderItem[] {
  return [
    {
      itemId: 'i1',
      observedAt: 1,
      body: { kind: 'status', text: 'done', turnLifecycle: { state: 'completed', turnId: 't1' } }
    } as unknown as AgentJournalRenderItem
  ]
}

function runningJournal(): AgentJournalRenderItem[] {
  return [
    {
      itemId: 'i1',
      observedAt: 1,
      body: { kind: 'status', text: 'working', turnLifecycle: { state: 'running', turnId: 't1' } }
    } as unknown as AgentJournalRenderItem
  ]
}

function attentionJournal(): AgentJournalRenderItem[] {
  return [
    {
      itemId: 'i1',
      observedAt: 1,
      body: {
        kind: 'question',
        question: 'which?',
        options: [],
        resolution: { state: 'pending' }
      }
    } as unknown as AgentJournalRenderItem
  ]
}

function harness(options: {
  journal: AgentJournalRenderItem[] | null
  dispatchState?: 'accepted' | 'rejected' | 'unknown'
  refusal?: AgentSessionPtyWriteRefusal
}) {
  let journal = options.journal
  const markAsDelivered = vi.fn()
  const send: StructuredMailboxPointerHost['send'] = vi.fn(async () => ({
    kind: 'sent' as const,
    state: options.dispatchState ?? ('accepted' as const)
  }))
  const sendMock = vi.mocked(send)
  const stored = new Map<string, unknown>()
  const db = {
    getDispatchContextById: () => ({ run_id: 'run_1' }),
    hasOutstandingRunDelivery: () => false,
    getUndeliveredUnreadMessages: () => [{ id: 'm1', type: 'status', sequence: 3 }],
    markAsDelivered,
    getStructuredPointerOperation: (key: string) => stored.get(key),
    putStructuredPointerOperation: (row: { mailbox_handle: string }) =>
      stored.set(row.mailbox_handle, row),
    deleteStructuredPointerOperation: (key: string) => stored.delete(key)
  }
  const delivery = new OrchestrationStructuredMailboxPointerDelivery({
    getDb: () => db as never,
    getMessageWaiters: () => undefined,
    resolveStructuredTarget: (mailboxHandle) =>
      mailboxHandle === 'dispatch:d1'
        ? {
            sessionId: IDENTITY.sessionId,
            dispatchId: 'd1',
            ...(options.refusal ? { refusal: options.refusal } : {})
          }
        : null,
    host: {
      readJournalTail: () => (journal === null ? null : { items: journal, hasOlder: false }),
      currentFence: () => 4,
      send
    }
  })
  return {
    delivery,
    markAsDelivered,
    send: sendMock,
    stored,
    setJournal: (next: AgentJournalRenderItem[] | null) => {
      journal = next
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('structured mailbox pointer delivery', () => {
  it('claims only mailboxes whose assignee is a structured worker', () => {
    const { delivery } = harness({ journal: idleJournal() })
    expect(delivery.deliverForHandle('dispatch:d1')).toBe(true)
    expect(delivery.deliverForHandle('run:run_1')).toBe(false)
  })

  it('sends the pointer as a turn and consumes mail on an accepted dispatch', async () => {
    const { delivery, markAsDelivered, send } = harness({ journal: idleJournal() })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![0].operationId).toMatch(/^\d{13}-[0-9a-f]{32}$/)
    expect(markAsDelivered).toHaveBeenCalledWith(['m1'])
  })

  it('retains mail when the dispatch settles unknown', async () => {
    const { delivery, markAsDelivered } = harness({
      journal: idleJournal(),
      dispatchState: 'unknown'
    })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(markAsDelivered).not.toHaveBeenCalled()
  })

  it('retains mail while a turn is running', async () => {
    const { delivery, send, markAsDelivered } = harness({ journal: runningJournal() })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(markAsDelivered).not.toHaveBeenCalled()
  })

  it('retains mail while a prompt is waiting for a human', async () => {
    const { delivery, send } = harness({ journal: attentionJournal() })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('retains mail when the session is not attached', async () => {
    const { delivery, send } = harness({ journal: null })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('retries a parked pointer when the journal moves', async () => {
    const { delivery, send, setJournal, markAsDelivered } = harness({ journal: runningJournal() })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).not.toHaveBeenCalled()
    setJournal(idleJournal())
    delivery.onTurnSettled('session-1')
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(markAsDelivered).toHaveBeenCalledWith(['m1'])
  })

  it('reuses one operation id for the same batch and re-mints when it grows', async () => {
    const { delivery, send, stored } = harness({
      journal: idleJournal(),
      dispatchState: 'unknown'
    })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    const first = send.mock.calls[0]![0].operationId
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send.mock.calls[1]![0].operationId).toBe(first)
    stored.clear()
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send.mock.calls[2]![0].operationId).not.toBe(first)
  })
})

describe('an adopted pane is redirected through its native owner', () => {
  const settled: AgentSessionPtyWriteRefusal = {
    code: 'agent_session_conflict',
    sessionId: 'session-1',
    ownerRuntimeKind: 'native',
    handoffStage: null,
    ownerPid: 4242,
    runtimeFence: 7
  }

  it('sends through the session when the refusal names a settled native owner', async () => {
    const { delivery, send, markAsDelivered } = harness({
      journal: idleJournal(),
      refusal: settled
    })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(markAsDelivered).toHaveBeenCalledWith(['m1'])
  })

  it('retains rather than redirecting into a lease that is handing back to a TUI', async () => {
    // Re-checked at SEND time: the owner can settle differently between resolve and send, and
    // redirecting into a mid-handoff lease races the takeover.
    const { delivery, send, markAsDelivered } = harness({
      journal: idleJournal(),
      refusal: { ...settled, handoffStage: 'preparing' }
    })
    delivery.deliverForHandle('dispatch:d1')
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(markAsDelivered).not.toHaveBeenCalled()
  })
})
