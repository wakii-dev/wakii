// T6 reconnect-catchup pins: the debounced reconnect sweep (storm coalescing),
// replay-order over the real store, and the sweep as the authority for events the
// reconnect replay window missed (offline resolve / offline create / a resolve
// request that died mid-disconnect).
//
// Not duplicated here: both-absent overlay rows surviving an empty sweep on a
// zero-story host are pinned in T2 (pending-gates-store.test.ts 'zero-stories sweep
// (empty reconcile) keeps the both-fields-absent overlay row' + pending-gates-sweep.test.ts
// 'host with zero stories is an empty sweep: no detail calls, overlay row survives').
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { storyListItemNormal } from './gate-conformance-fixtures'
import { submitGateResolveRequest } from './gate-resolve-request'
import { SWEEP_DEBOUNCE_MS, startGateTransitionEvents } from './gate-transition-events'
import {
  getPendingGatesSnapshot,
  reconcileSweepResult,
  resetPendingGatesStoreForTests,
  upsertPendingGate,
  type ContractSweepGate,
  type PendingGateRow
} from './pending-gates-store'
import { runPendingGatesSweep } from './pending-gates-sweep'
import { useMobilePendingGates } from './use-mobile-pending-gates'

const HOST = 'host-reconnect'

const OK_ENVELOPE = (result: unknown): RpcResponse => ({
  id: 'r1',
  ok: true,
  result,
  _meta: { runtimeId: 'runtime-1' }
})

function eventRow(gateId: string, overrides: Partial<PendingGateRow> = {}): PendingGateRow {
  return {
    gateId,
    title: `Gate ${gateId}`,
    status: 'pending',
    resolution: null,
    options: [],
    worktreeId: null,
    createdAt: 0,
    storyLinked: false,
    storyId: null,
    source: 'event',
    optionsKnown: false,
    ...overrides
  }
}

function sweepGate(overrides: Partial<ContractSweepGate> & { gateId: string }): ContractSweepGate {
  return {
    title: `Gate ${overrides.gateId}`,
    status: 'pending',
    resolution: null,
    options: [],
    worktreeId: null,
    createdAt: 1,
    storyLinked: false,
    ...overrides
  }
}

function gateIds(): string[] {
  return getPendingGatesSnapshot(HOST).gates.map((row) => row.gateId)
}

// storyList always reports the fixture story (pendingGates: 1) so the sweep fetches
// its detail; the detail returns the given gates.
function sweepSend(gates: ContractSweepGate[]) {
  return (_client: RpcClient, _hostId: string, method: string): Promise<RpcResponse> => {
    if (method === 'superpowers.storyList') {
      return Promise.resolve(OK_ENVELOPE({ stories: [storyListItemNormal] }))
    }
    return Promise.resolve(
      OK_ENVELOPE({
        story: { storyId: storyListItemNormal.storyId, title: storyListItemNormal.title },
        gates
      })
    )
  }
}

async function drain(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe('debounced reconnect sweep', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function scriptedClient(): { client: RpcClient; storyListCalls: () => number } {
    let calls = 0
    const client = {
      sendRequest: (method: string) => {
        if (method === 'superpowers.storyList') {
          calls += 1
          return Promise.resolve(OK_ENVELOPE({ stories: [storyListItemNormal] }))
        }
        return Promise.resolve(
          OK_ENVELOPE({
            story: { storyId: storyListItemNormal.storyId, title: storyListItemNormal.title },
            gates: []
          })
        )
      },
      subscribe: () => () => {}
    } as unknown as RpcClient
    return { client, storyListCalls: () => calls }
  }

  it('a reconnect storm (rapid connect/disconnect/connect) coalesces to exactly one sweep', async () => {
    const { client, storyListCalls } = scriptedClient()
    let connected = true
    function Probe() {
      useMobilePendingGates({ hostId: HOST, client, connected })
      return null
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await drain()
    // First connect for this client sweeps immediately (mount path).
    const mountSweeps = storyListCalls()
    expect(mountSweeps).toBe(1)

    const flip = (next: boolean) => {
      connected = next
      act(() => {
        renderer.update(createElement(Probe))
      })
    }
    // Storm: two reconnects inside one debounce window.
    flip(false)
    flip(true)
    flip(false)
    flip(true)
    expect(storyListCalls()).toBe(mountSweeps)

    await act(async () => {
      vi.advanceTimersByTime(SWEEP_DEBOUNCE_MS - 1)
    })
    expect(storyListCalls()).toBe(mountSweeps)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    await drain()
    expect(storyListCalls()).toBe(mountSweeps + 1)
    act(() => {
      renderer.unmount()
    })
  })
})

describe('replay-order over the real store', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  function makeHarness() {
    let listener: ((data: unknown) => void) | null = null
    const client = {
      sendRequest: () => Promise.resolve(OK_ENVELOPE({ unsubscribed: true })),
      subscribe: (_method: string, _params: unknown, onData: (data: unknown) => void) => {
        listener = onData
        return () => {
          listener = null
        }
      }
    } as unknown as RpcClient
    return { client, emit: (data: unknown) => listener?.(data) }
  }

  const gateEvent = (source: 'gate-open' | 'gate-closed', gateId: string): unknown => ({
    type: 'notification',
    source,
    gateId,
    title: `Gate ${gateId}`
  })

  it('a seq-ordered replay batch [gate-open, gate-closed] leaves the resolved gate absent', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    // Chronology while the phone was away: opened (seq n), resolved (seq n+1) —
    // the replay preserves that order, and sequential handling must not resurrect.
    harness.emit(gateEvent('gate-open', 'gate-x'))
    harness.emit(gateEvent('gate-closed', 'gate-x'))
    expect(gateIds()).toEqual([])
    stop()
  })

  it('an out-of-order stale gate-open after a gate-closed is repaired by its hydrating sweep', () => {
    vi.useFakeTimers()
    let sweepImpl: () => void = () => {}
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => sweepImpl()
    })

    // Delivery order flipped vs. real chronology: handlers are sequential, so the
    // stale open re-adds the row…
    harness.emit(gateEvent('gate-closed', 'gate-x'))
    harness.emit(gateEvent('gate-open', 'gate-x'))
    expect(gateIds()).toEqual(['gate-x'])

    // …and the gate-open-scheduled sweep carries the server truth: resolved → removed.
    sweepImpl = () =>
      reconcileSweepResult(HOST, [
        {
          storyId: storyListItemNormal.storyId,
          storyTitle: storyListItemNormal.title,
          gates: [sweepGate({ gateId: 'gate-x', status: 'resolved' })]
        }
      ])
    vi.advanceTimersByTime(SWEEP_DEBOUNCE_MS)
    expect(gateIds()).toEqual([])
    stop()
    vi.useRealTimers()
  })
})

describe('missed-event window — the reconnect sweep repairs what replay missed', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('removes a gate resolved while offline (positive evidence) and adds one created offline', async () => {
    // Pre-disconnect: the phone saw gate-x open as a live event.
    upsertPendingGate(HOST, eventRow('gate-x'))
    // While offline the desktop resolved gate-x and created story-linked gate-y.
    await act(async () => {
      await runPendingGatesSweep({
        client: {} as unknown as RpcClient,
        hostId: HOST,
        send: sweepSend([
          sweepGate({ gateId: 'gate-x', status: 'resolved', resolution: 'approve' }),
          sweepGate({
            gateId: 'gate-y',
            options: ['approve', 'reject'],
            storyLinked: true,
            storyId: storyListItemNormal.storyId,
            worktreeId: storyListItemNormal.worktreeId
          })
        ])
      })
    })

    // Positive evidence is contract-backed: desktop storyDetail pushes EVERY
    // db.listGates() gate with its status verbatim (superpowers-story-detail.ts:115-137)
    // and the contract status union is 'pending' | 'resolved' | 'timeout'
    // (story-rpc-contract.ts:46) — a sweep response showing status !== 'pending' is
    // authoritative closure, not an accidental omission.
    const rows = getPendingGatesSnapshot(HOST).gates
    expect(rows.map((row) => row.gateId)).toEqual(['gate-y'])
    expect(rows[0]).toMatchObject({
      status: 'pending',
      options: ['approve', 'reject'],
      optionsKnown: true,
      source: 'sweep',
      storyId: storyListItemNormal.storyId
    })
  })

  it('a resolve request rejected mid-disconnect stays stale until the reconnect sweep lands', async () => {
    upsertPendingGate(HOST, eventRow('gate-x'))
    const deadSocket = {
      sendRequest: () => Promise.reject(new Error('socket dropped mid-resolve'))
    } as unknown as RpcClient

    const outcome = await submitGateResolveRequest(deadSocket, 'gate-x', 'approve')
    expect(outcome).toEqual({ kind: 'request-failed' })
    // No auto-retry, no removal — the row goes stale under the T4 notice (D7).
    expect(gateIds()).toEqual(['gate-x'])

    // Reconnect sweep reconciles the list: gate-x resolved elsewhere → removed;
    // a gate still pending on the desktop stays.
    await act(async () => {
      await runPendingGatesSweep({
        client: deadSocket,
        hostId: HOST,
        send: sweepSend([
          sweepGate({ gateId: 'gate-x', status: 'resolved' }),
          sweepGate({ gateId: 'gate-still-open' })
        ])
      })
    })
    expect(gateIds()).toEqual(['gate-still-open'])
  })
})
