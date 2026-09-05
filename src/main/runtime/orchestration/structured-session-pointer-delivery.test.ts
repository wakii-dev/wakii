import { describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import type { AgentSessionPtyWriteRefusal } from '../../../shared/agent-session-pty-write-admission'
import {
  decideStructuredPointerDelivery,
  isSettledNativeOwner,
  retainReasonForDispatch,
  retainWaitsForTurnSettle,
  structuredDispatchDelivered,
  structuredSessionIsBetweenTurns
} from './structured-session-pointer-delivery'

function refusal(
  overrides: Partial<AgentSessionPtyWriteRefusal> = {}
): AgentSessionPtyWriteRefusal {
  return {
    code: 'agent_session_conflict',
    sessionId: 'session-1',
    ownerRuntimeKind: 'native',
    handoffStage: null,
    ownerPid: 4242,
    runtimeFence: 7,
    ...overrides
  }
}

function statusItem(
  turnLifecycle: { turnId: string; state: 'running' } | undefined
): AgentJournalRenderItem {
  return {
    itemId: `item-${turnLifecycle?.turnId ?? 'plain'}`,
    revision: 1,
    body: { kind: 'status', text: 'working', ...(turnLifecycle ? { turnLifecycle } : {}) }
  } as unknown as AgentJournalRenderItem
}

describe('structured pointer owner admission', () => {
  it('accepts only a settled native owner', () => {
    expect(isSettledNativeOwner(refusal())).toBe(true)
  })

  it('refuses a tui owner', () => {
    expect(isSettledNativeOwner(refusal({ ownerRuntimeKind: 'tui' }))).toBe(false)
  })

  it('refuses a native owner that is mid-handoff, so a to-tui takeover is not raced', () => {
    expect(isSettledNativeOwner(refusal({ handoffStage: 'recovering' }))).toBe(false)
  })

  it('refuses a reconciling refusal even though it names a native owner', () => {
    expect(isSettledNativeOwner(refusal({ code: 'execution_owner_reconciling' }))).toBe(false)
  })
})

describe('structured session turn gate', () => {
  it('treats an empty journal as between turns', () => {
    expect(structuredSessionIsBetweenTurns([])).toBe(true)
  })

  it('treats a running turn as unsettled', () => {
    expect(
      structuredSessionIsBetweenTurns([statusItem({ turnId: 'turn-1', state: 'running' })])
    ).toBe(false)
  })

  it('treats a tombstoned turn as settled, since settlement removes the running row', () => {
    // A healthy completed turn leaves no turnLifecycle row behind at all.
    expect(structuredSessionIsBetweenTurns([statusItem(undefined)])).toBe(true)
  })

  it('reads a full page carrying no lifecycle item as busy, because the running item may be paged out', () => {
    expect(structuredSessionIsBetweenTurns([statusItem(undefined)], true)).toBe(false)
  })

  it('trusts a full page that still carries a lifecycle item', () => {
    expect(
      structuredSessionIsBetweenTurns([statusItem({ turnId: 'turn-1', state: 'running' })], true)
    ).toBe(false)
    expect(structuredSessionIsBetweenTurns([], false)).toBe(true)
  })
})

describe('decideStructuredPointerDelivery', () => {
  it('delivers to a settled, attached, idle session', () => {
    expect(
      decideStructuredPointerDelivery({
        refusal: refusal(),
        sessionAttached: true,
        journalItems: []
      })
    ).toEqual({ deliver: true })
  })

  it('retains when the session is not attached on this host', () => {
    expect(
      decideStructuredPointerDelivery({
        refusal: refusal(),
        sessionAttached: false,
        journalItems: []
      })
    ).toEqual({ deliver: false, retain: 'session-not-attached' })
  })

  it('retains mid-turn rather than delegating the race to the provider', () => {
    expect(
      decideStructuredPointerDelivery({
        refusal: refusal(),
        sessionAttached: true,
        journalItems: [statusItem({ turnId: 'turn-1', state: 'running' })]
      })
    ).toEqual({ deliver: false, retain: 'turn-unsettled' })
  })

  it('retains when the owner is not a settled native session', () => {
    expect(
      decideStructuredPointerDelivery({
        refusal: refusal({ handoffStage: 'preparing' }),
        sessionAttached: true,
        journalItems: []
      })
    ).toEqual({ deliver: false, retain: 'owner-not-settled-native' })
  })
})

describe('dispatch outcome classification', () => {
  it('marks mail delivered only on an accepted dispatch', () => {
    expect(structuredDispatchDelivered('accepted')).toBe(true)
    expect(structuredDispatchDelivered('rejected')).toBe(false)
  })

  it('does not treat unknown as delivered, because a dead child settles unknown', () => {
    expect(structuredDispatchDelivered('unknown')).toBe(false)
  })

  it('names the retain reason for each non-accepted dispatch', () => {
    expect(retainReasonForDispatch('rejected')).toBe('dispatch-rejected')
    expect(retainReasonForDispatch('unknown')).toBe('dispatch-unknown')
  })
})

describe('retry pacing', () => {
  it('waits for a settle edge when the nudge may already be queued', () => {
    expect(retainWaitsForTurnSettle('dispatch-unknown')).toBe(true)
    expect(retainWaitsForTurnSettle('turn-unsettled')).toBe(true)
  })

  it('allows a plain retry for reasons that wrote nothing', () => {
    expect(retainWaitsForTurnSettle('dispatch-rejected')).toBe(false)
    expect(retainWaitsForTurnSettle('session-not-attached')).toBe(false)
    expect(retainWaitsForTurnSettle('owner-not-settled-native')).toBe(false)
  })
})
