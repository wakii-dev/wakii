// Store-level tests for the per-host pending-gates state (plan T2 exit list).
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  coerceUndefinedToNull,
  gateOpenRoutingAbsent,
  storyDetailResultNormal
} from './gate-conformance-fixtures'
import {
  getPendingGatesSnapshot,
  markPendingGatesUnavailable,
  reconcileSweepResult,
  removePendingGate,
  resetPendingGatesStoreForTests,
  subscribePendingGates,
  upsertPendingGate,
  type ContractSweepGate,
  type PendingGateRow,
  type PendingGatesSweepResponse
} from './pending-gates-store'

const [storyGate, khacGate] = storyDetailResultNormal.gates

function sweepResponse(
  storyId: string,
  gates: ContractSweepGate[],
  storyTitle = `Title ${storyId}`
): PendingGatesSweepResponse {
  return { storyId, storyTitle, gates }
}

// Builds the row T5's gate-open reducer will produce for a wire payload — the
// both-fields-absent fixture (plan D5) coerces to the overlay 'khác' shape.
function eventRowFromWire(payload: {
  gateId: string
  title: string
  storyId?: string | null
  worktreeId?: string | null
}): PendingGateRow {
  const storyId = coerceUndefinedToNull(payload.storyId)
  return {
    gateId: payload.gateId,
    title: payload.title,
    status: 'pending',
    resolution: null,
    options: [],
    worktreeId: coerceUndefinedToNull(payload.worktreeId),
    createdAt: 0,
    storyLinked: storyId !== null,
    storyId,
    source: 'event',
    optionsKnown: false
  }
}

function gateIds(hostId: string): string[] {
  return getPendingGatesSnapshot(hostId).gates.map((row) => row.gateId)
}

describe('pending-gates-store', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('dedups the same worktreeId-null gate repeated across two storyDetail responses', () => {
    // 'khác' gates are returned by EVERY storyDetail (membership rule) — the gateId
    // map must converge them to one row.
    reconcileSweepResult('host-a', [
      sweepResponse('brackets/fi305.md', [khacGate]),
      sweepResponse('brackets/fi306.md', [khacGate])
    ])
    const snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.gates).toHaveLength(1)
    expect(snapshot.gates[0]?.gateId).toBe(khacGate.gateId)
    expect(snapshot.gates[0]?.storyId).toBeNull()
    expect(snapshot.gates[0]?.source).toBe('sweep')
    expect(snapshot.gates[0]?.optionsKnown).toBe(true)
  })

  it('keeps two hosts isolated — mutations on one never leak into the other', () => {
    upsertPendingGate('host-a', eventRowFromWire(gateOpenRoutingAbsent))
    reconcileSweepResult('host-b', [sweepResponse('brackets/fi305.md', [storyGate])])

    expect(gateIds('host-a')).toEqual([gateOpenRoutingAbsent.gateId])
    expect(gateIds('host-b')).toEqual([storyGate.gateId])
    expect(getPendingGatesSnapshot('host-a').unavailable).toBe(false)

    removePendingGate('host-b', storyGate.gateId)
    expect(gateIds('host-a')).toEqual([gateOpenRoutingAbsent.gateId])
    expect(gateIds('host-b')).toEqual([])
  })

  it('zero-stories sweep (empty reconcile) keeps the both-fields-absent overlay row', () => {
    const overlay = eventRowFromWire(gateOpenRoutingAbsent)
    expect(overlay.storyId).toBeNull()
    expect(overlay.worktreeId).toBeNull()
    upsertPendingGate('host-a', overlay)

    // Host with 0 stories → empty sweep: reconcile with no responses, overlay survives.
    reconcileSweepResult('host-a', [])
    const snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.gates).toHaveLength(1)
    expect(snapshot.gates[0]?.source).toBe('event')
    expect(snapshot.gates[0]?.optionsKnown).toBe(false)
    expect(snapshot.lastSweepAt).not.toBeNull()
    expect(snapshot.unavailable).toBe(false)
  })

  it('reconcile does NOT remove an overlay entry that lacks server evidence', () => {
    upsertPendingGate('host-a', eventRowFromWire(gateOpenRoutingAbsent))
    // Sweep only saw an unrelated story's gate — absence is never removal evidence.
    reconcileSweepResult('host-a', [sweepResponse('brackets/fi305.md', [storyGate])])

    const snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.gates.map((row) => row.gateId).sort()).toEqual(
      [gateOpenRoutingAbsent.gateId, storyGate.gateId].sort()
    )
    const overlay = snapshot.gates.find((row) => row.source === 'event')
    expect(overlay?.storyId).toBeNull()
    expect(overlay?.optionsKnown).toBe(false)
  })

  it('reconcile DOES remove on positive closure evidence (resolved and timeout)', () => {
    upsertPendingGate('host-a', eventRowFromWire(gateOpenRoutingAbsent))
    upsertPendingGate('host-a', eventRowFromWire({ ...gateOpenRoutingAbsent, gateId: 'gate-two' }))

    reconcileSweepResult('host-a', [
      sweepResponse('brackets/fi305.md', [
        { ...khacGate, gateId: gateOpenRoutingAbsent.gateId, status: 'resolved' },
        { ...khacGate, gateId: 'gate-two', status: 'timeout' }
      ])
    ])
    expect(gateIds('host-a')).toEqual([])
  })

  it('reconcile re-classifies khác-drift: an event overlay adopted by a sweep becomes sweep-sourced', () => {
    upsertPendingGate('host-a', eventRowFromWire(gateOpenRoutingAbsent))
    // Later the gate maps to a bracketed worktree — the sweep response carries it
    // story-linked, so grouping and options knowledge must follow the server.
    reconcileSweepResult('host-a', [
      sweepResponse('brackets/fi305.md', [
        { ...khacGate, storyLinked: true, worktreeId: storyGate.worktreeId }
      ])
    ])
    const row = getPendingGatesSnapshot('host-a').gates[0]
    expect(row?.storyId).toBe('brackets/fi305.md')
    expect(row?.source).toBe('sweep')
    expect(row?.optionsKnown).toBe(true)
  })

  it('duplicate event upserts converge to one row (T5 idempotent gate-open seed)', () => {
    upsertPendingGate('host-a', eventRowFromWire(gateOpenRoutingAbsent))
    upsertPendingGate('host-a', {
      ...eventRowFromWire(gateOpenRoutingAbsent),
      title: 'Updated title'
    })
    const snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.gates).toHaveLength(1)
    expect(snapshot.gates[0]?.title).toBe('Updated title')
  })

  it('removing an unknown gate is a safe no-op that does not notify', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingGates('host-a', listener)
    removePendingGate('host-a', 'never-seen')
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('returns a referentially stable snapshot until a mutation, then notifies', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingGates('host-a', listener)
    expect(getPendingGatesSnapshot('host-a')).toBe(getPendingGatesSnapshot('host-a'))
    expect(getPendingGatesSnapshot('ghost-host')).toBe(getPendingGatesSnapshot('ghost-host'))

    reconcileSweepResult('host-a', [sweepResponse('brackets/fi305.md', [storyGate])])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('marks unavailable without clearing gates, and recovers on the next successful reconcile', () => {
    reconcileSweepResult('host-a', [sweepResponse('brackets/fi305.md', [storyGate])])
    markPendingGatesUnavailable('host-a', true)
    let snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.unavailable).toBe(true)
    expect(snapshot.gates.map((row) => row.gateId)).toEqual([storyGate.gateId])

    reconcileSweepResult('host-a', [])
    snapshot = getPendingGatesSnapshot('host-a')
    expect(snapshot.unavailable).toBe(false)
    expect(snapshot.lastSweepAt).not.toBeNull()
  })

  it('a timeout row in server data is positive closure for that gate only', () => {
    reconcileSweepResult('host-a', [sweepResponse('brackets/fi305.md', [storyGate, khacGate])])
    reconcileSweepResult('host-a', [
      sweepResponse('brackets/fi305.md', [{ ...storyGate, status: 'timeout' }, khacGate])
    ])
    expect(gateIds('host-a')).toEqual([khacGate.gateId])
  })

  it('carries story titles from sweep responses, last one wins', () => {
    reconcileSweepResult('host-a', [
      sweepResponse('brackets/fi305.md', [storyGate], 'FI-305 superpowers android'),
      sweepResponse('brackets/fi305.md', [], 'FI-305 renamed')
    ])
    expect(getPendingGatesSnapshot('host-a').storyTitles.get('brackets/fi305.md')).toBe(
      'FI-305 renamed'
    )
  })
})
