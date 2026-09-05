// Hook tests for the resolve flow: submittingRef per-gate double-tap guard,
// success removes the gate from the per-host store, taxonomy/request failures
// return raw outcomes and leave the store untouched.
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { gateResolveErrorGateNotPending, gateResolveSuccess } from './gate-conformance-fixtures'
import { useMobileGateResolve } from './use-mobile-gate-resolve'
import {
  getPendingGatesSnapshot,
  reconcileSweepResult,
  resetPendingGatesStoreForTests,
  upsertPendingGate,
  type PendingGateRow
} from './pending-gates-store'

const HOST = 'host-a'

const GATE_RESOLVE_OK: RpcResponse = {
  id: '1',
  ok: true,
  result: gateResolveSuccess,
  _meta: { runtimeId: 'runtime-1' }
}
const GATE_NOT_PENDING: RpcResponse = {
  id: '2',
  ok: true,
  result: gateResolveErrorGateNotPending,
  _meta: { runtimeId: 'runtime-1' }
}

function seedGate(gateId: string): PendingGateRow {
  const row: PendingGateRow = {
    gateId,
    title: 'Approve SF-1 contract snapshot',
    status: 'pending',
    resolution: null,
    options: ['approve', 'reject'],
    worktreeId: 'wt-1',
    createdAt: 0,
    storyLinked: true,
    storyId: 'brackets/fi305-superpowers-android.md',
    source: 'sweep',
    optionsKnown: true
  }
  upsertPendingGate(HOST, row)
  return row
}

describe('useMobileGateResolve', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
    reconcileSweepResult(HOST, [])
  })

  function mountProbe(client: RpcClient | null) {
    let latest!: ReturnType<typeof useMobileGateResolve>
    function Probe() {
      latest = useMobileGateResolve({ hostId: HOST, client })
      return null
    }
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(Probe))
    })
    return {
      get model() {
        return latest
      },
      async flush() {
        for (let round = 0; round < 6; round += 1) {
          await act(async () => {
            await Promise.resolve()
          })
        }
      },
      unmount() {
        act(() => {
          renderer.unmount()
        })
      }
    }
  }

  it('submits via plain sendRequest and removes a resolved gate from the store', async () => {
    seedGate('gate-1')
    const sendRequest = vi.fn(() => Promise.resolve(GATE_RESOLVE_OK))
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })
    await probe.flush()

    expect(outcome).toEqual({
      kind: 'success',
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
    expect(sendRequest).toHaveBeenCalledWith(
      'superpowers.gateResolve',
      { gateId: 'gate-1', resolution: 'approve' },
      { timeoutMs: 15_000 }
    )
    expect(
      getPendingGatesSnapshot(HOST)
        .gates.map((gate) => gate.gateId)
        .includes('gate-1')
    ).toBe(false)
    probe.unmount()
  })

  it('blocks a double-tap while the same gate is in flight — one request only', async () => {
    seedGate('gate-1')
    const settlers: Array<(response: RpcResponse) => void> = []
    const sendRequest = vi.fn(
      () =>
        new Promise<RpcResponse>((resolve) => {
          settlers.push(resolve)
        })
    )
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    await act(async () => {
      const firstPromise = probe.model.submitGateResolution('gate-1', 'approve')
      // The suppressed tap resolves immediately without another request.
      const secondPromise = probe.model.submitGateResolution('gate-1', 'approve')
      await expect(secondPromise).resolves.toBeNull()
      expect(sendRequest).toHaveBeenCalledTimes(1)

      await act(async () => {
        settlers[0]?.(GATE_RESOLVE_OK)
      })
      await expect(firstPromise).resolves.toEqual({
        kind: 'success',
        gateId: 'gate-fi305-approve-sf1',
        resolution: 'approve'
      })
    })
    probe.unmount()
  })

  it('returns the raw taxonomy outcome and keeps the gate on gate_not_pending', async () => {
    seedGate('gate-1')
    const sendRequest = vi.fn(() => Promise.resolve(GATE_NOT_PENDING))
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })

    expect(outcome).toEqual({ kind: 'taxonomy', code: 'gate_not_pending' })
    expect(
      getPendingGatesSnapshot(HOST)
        .gates.map((gate) => gate.gateId)
        .includes('gate-1')
    ).toBe(true)
    probe.unmount()
  })

  it('guards gates independently — a second gate can submit while the first is in flight', async () => {
    seedGate('gate-1')
    seedGate('gate-2')
    const settlers: Array<(response: RpcResponse) => void> = []
    const sendRequest = vi.fn(
      () =>
        new Promise<RpcResponse>((resolve) => {
          settlers.push(resolve)
        })
    )
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    await act(async () => {
      void probe.model.submitGateResolution('gate-1', 'approve')
      void probe.model.submitGateResolution('gate-2', 'approve')
      await Promise.resolve()
    })
    expect(sendRequest).toHaveBeenCalledTimes(2)

    await act(async () => {
      settlers[0]?.(GATE_RESOLVE_OK)
      settlers[1]?.(GATE_RESOLVE_OK)
      await Promise.resolve()
    })
    probe.unmount()
  })

  it('returns null without sending when there is no client', async () => {
    seedGate('gate-1')
    const probe = mountProbe(null)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })

    expect(outcome).toBeNull()
    probe.unmount()
  })
})
