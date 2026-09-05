// Sweep-flow tests: storyList → storyDetail fan-out, probe rule, dedup across
// responses, zero-stories edge, unavailable marking. Uses an injected sender so
// tests script exact responses per request kind; the store is the real singleton.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import {
  storyDetailResultNormal,
  storyListItemNormal,
  storyListItemParseError
} from './gate-conformance-fixtures'
import {
  getPendingGatesSnapshot,
  resetPendingGatesStoreForTests,
  upsertPendingGate,
  type PendingGateRow
} from './pending-gates-store'
import { runPendingGatesSweep } from './pending-gates-sweep'

const FAKE_CLIENT = { sendRequest: () => {} } as unknown as RpcClient

const STORY_LIST_OK: RpcResponse = {
  id: '1',
  ok: true,
  result: { stories: [storyListItemNormal, storyListItemParseError] },
  _meta: { runtimeId: 'runtime-1' }
}

const STORY_DETAIL_OK: RpcResponse = {
  id: '2',
  ok: true,
  result: storyDetailResultNormal,
  _meta: { runtimeId: 'runtime-1' }
}

const METHOD_NOT_FOUND: RpcResponse = {
  id: '3',
  ok: false,
  error: { code: 'method_not_found', message: 'Unknown method: superpowers.storyList' },
  _meta: { runtimeId: 'runtime-1' }
}

type Call = { hostId: string; kind: string; params: unknown }

// Scripts responses per kind prefix; unlisted kinds fail the test loudly.
function makeHarness(respond: (call: Call) => RpcResponse) {
  const calls: Call[] = []
  const send = vi.fn(async (_client: RpcClient, hostId: string, kind: string, params?: unknown) => {
    const call = { hostId, kind, params }
    calls.push(call)
    return respond(call)
  })
  return {
    calls,
    send: send as unknown as (
      client: RpcClient,
      hostId: string,
      kind: string
    ) => Promise<RpcResponse>
  }
}

function gateIds(hostId: string): string[] {
  return getPendingGatesSnapshot(hostId).gates.map((row) => row.gateId)
}

describe('runPendingGatesSweep', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('details every story with pendingGates>0 and dedups the khác gate repeated in each detail', () => {
    const storyB = { ...storyListItemNormal, storyId: 'brackets/fi306.md', title: 'FI-306' }
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        return { ...STORY_LIST_OK, result: { stories: [storyListItemNormal, storyB] } }
      }
      // 'khác' gate repeats in EVERY storyDetail response (membership rule).
      return STORY_DETAIL_OK
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        const detailCalls = harness.calls.filter((call) =>
          call.kind.startsWith('superpowers.storyDetail')
        )
        expect(detailCalls.map((call) => call.params)).toEqual([
          { storyId: storyListItemNormal.storyId },
          { storyId: 'brackets/fi306.md' }
        ])
        const snapshot = getPendingGatesSnapshot('host-a')
        expect(snapshot.unavailable).toBe(false)
        expect(snapshot.lastSweepAt).not.toBeNull()
        expect(snapshot.storyTitles.get(storyListItemNormal.storyId)).toBe(
          storyListItemNormal.title
        )
        const khacRows = snapshot.gates.filter((row) => row.storyId === null)
        expect(khacRows).toHaveLength(1)
        expect(khacRows[0]?.gateId).toBe('gate-fi305-khac-freetext')
        expect(snapshot.gates.some((row) => row.gateId === 'gate-fi305-approve-sf1')).toBe(true)
      }
    )
  })

  it('probe rule: no pendingGates>0 but non-empty list → details the newest story exactly once', () => {
    const older = {
      ...storyListItemNormal,
      storyId: 'brackets/old.md',
      updatedAt: 100,
      pendingGates: 0
    }
    const newer = {
      ...storyListItemNormal,
      storyId: 'brackets/new.md',
      updatedAt: 200,
      pendingGates: 0
    }
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        return { ...STORY_LIST_OK, result: { stories: [older, newer] } }
      }
      return STORY_DETAIL_OK
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        const detailCalls = harness.calls.filter((call) =>
          call.kind.startsWith('superpowers.storyDetail')
        )
        expect(detailCalls).toHaveLength(1)
        expect(detailCalls[0]?.params).toEqual({ storyId: 'brackets/new.md' })
        // 'khác' recovered from the probe story's detail.
        expect(gateIds('host-a')).toContain('gate-fi305-khac-freetext')
        expect(getPendingGatesSnapshot('host-a').unavailable).toBe(false)
      }
    )
  })

  it('host with zero stories is an empty sweep: no detail calls, overlay row survives, not unavailable', () => {
    const overlay: PendingGateRow = {
      gateId: 'gate-overlay',
      title: 'Overlay gate',
      status: 'pending',
      resolution: null,
      options: [],
      worktreeId: null,
      createdAt: 0,
      storyLinked: false,
      storyId: null,
      source: 'event',
      optionsKnown: false
    }
    upsertPendingGate('host-a', overlay)
    const harness = makeHarness(() => ({ ...STORY_LIST_OK, result: { stories: [] } }))

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        expect(harness.calls).toHaveLength(1)
        expect(gateIds('host-a')).toEqual(['gate-overlay'])
        const snapshot = getPendingGatesSnapshot('host-a')
        expect(snapshot.unavailable).toBe(false)
        expect(snapshot.lastSweepAt).not.toBeNull()
      }
    )
  })

  it('parseError story entry does not crash and is only fetched when it reports pendingGates', () => {
    // parseError fixture reports pendingGates 0 → never fetched; normal story is.
    const corruptPending = { ...storyListItemParseError, pendingGates: 3 }
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        return { ...STORY_LIST_OK, result: { stories: [storyListItemParseError, corruptPending] } }
      }
      expect(call.params).toEqual({ storyId: corruptPending.storyId })
      return {
        ...STORY_DETAIL_OK,
        result: {
          ...storyDetailResultNormal,
          story: {
            ...storyDetailResultNormal.story,
            storyId: corruptPending.storyId,
            parseError: true
          },
          gates: []
        }
      }
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        const detailCalls = harness.calls.filter((call) =>
          call.kind.startsWith('superpowers.storyDetail')
        )
        expect(detailCalls).toHaveLength(1)
        expect(getPendingGatesSnapshot('host-a').unavailable).toBe(false)
      }
    )
  })

  it('marks unavailable (no throw) on the pre-SF-1 method_not_found failure envelope', () => {
    // Old-host probe: dispatcher answers a RESOLVED { ok:false, code:'method_not_found' }
    // envelope, not a transport throw — unavailable must key off response.ok.
    const harness = makeHarness(() => METHOD_NOT_FOUND)
    return expect(
      runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send })
    )
      .resolves.toBeUndefined()
      .then(() => {
        expect(getPendingGatesSnapshot('host-a').unavailable).toBe(true)
      })
  })

  it('marks unavailable (no throw) when the transport rejects mid-sweep and skips reconcile', () => {
    upsertPendingGate('host-a', {
      gateId: 'gate-overlay',
      title: 'Overlay gate',
      status: 'pending',
      resolution: null,
      options: [],
      worktreeId: null,
      createdAt: 0,
      storyLinked: false,
      storyId: null,
      source: 'event',
      optionsKnown: false
    })
    let storyListCalls = 0
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        storyListCalls += 1
        return STORY_LIST_OK
      }
      throw new Error('socket died mid-request')
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        expect(storyListCalls).toBe(1)
        const snapshot = getPendingGatesSnapshot('host-a')
        expect(snapshot.unavailable).toBe(true)
        // All-or-nothing: the failed sweep reconciled nothing — overlay untouched.
        expect(gateIds('host-a')).toEqual(['gate-overlay'])
        expect(snapshot.lastSweepAt).toBeNull()
      }
    )
  })

  it('skips a story that answers story_not_found and still reconciles the rest', () => {
    const vanished = { ...storyListItemNormal, storyId: 'brackets/vanished.md' }
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        return { ...STORY_LIST_OK, result: { stories: [storyListItemNormal, vanished] } }
      }
      if (
        call.params === undefined ||
        (call.params as { storyId: string }).storyId === vanished.storyId
      ) {
        return { ...STORY_DETAIL_OK, result: { error: 'story_not_found' } }
      }
      return STORY_DETAIL_OK
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send }).then(
      () => {
        const snapshot = getPendingGatesSnapshot('host-a')
        expect(snapshot.unavailable).toBe(false)
        expect(snapshot.storyTitles.has(vanished.storyId)).toBe(false)
        expect(snapshot.gates).toHaveLength(
          storyDetailResultNormal.gates.filter((gate) => gate.status === 'pending').length
        )
      }
    )
  })

  it('two hosts swept with different data never cross-contaminate', () => {
    const otherStory = { ...storyListItemNormal, storyId: 'brackets/fi999.md', title: 'FI-999' }
    const harness = makeHarness((call) => {
      if (call.kind === 'superpowers.storyList') {
        if (call.hostId === 'host-b') {
          return { ...STORY_LIST_OK, result: { stories: [otherStory] } }
        }
        return STORY_LIST_OK
      }
      if (call.hostId === 'host-b') {
        return {
          ...STORY_DETAIL_OK,
          result: { ...storyDetailResultNormal, gates: [] }
        }
      }
      return STORY_DETAIL_OK
    })

    return runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-a', send: harness.send })
      .then(() =>
        runPendingGatesSweep({ client: FAKE_CLIENT, hostId: 'host-b', send: harness.send })
      )
      .then(() => {
        expect(gateIds('host-a')).toContain('gate-fi305-approve-sf1')
        expect(gateIds('host-b')).toEqual([])
        expect(getPendingGatesSnapshot('host-a').storyTitles.has('brackets/fi999.md')).toBe(false)
      })
  })
})
