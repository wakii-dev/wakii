// Hook tests for the resolve flow: submittingRef per-gate double-tap guard,
// T4 store side effects (success + settled-elsewhere races remove the gate),
// the A4 parallel-resolve server-guard race, and transport-failure safety
// (no auto-retry; a re-tap sends a fresh request).
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import {
  gateResolveErrorGateNotFound,
  gateResolveErrorGateNotPending,
  gateResolveSuccess
} from './gate-conformance-fixtures'
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
const GATE_NOT_FOUND: RpcResponse = {
  id: '3',
  ok: true,
  result: gateResolveErrorGateNotFound,
  _meta: { runtimeId: 'runtime-1' }
}

const gateIds = () => getPendingGatesSnapshot(HOST).gates.map((gate) => gate.gateId)

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

  it('removes the gate on gate_not_pending — benign race, raw outcome still returned', async () => {
    seedGate('gate-1')
    const sendRequest = vi.fn(() => Promise.resolve(GATE_NOT_PENDING))
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })

    expect(outcome).toEqual({ kind: 'taxonomy', code: 'gate_not_pending' })
    expect(gateIds().includes('gate-1')).toBe(false)
    probe.unmount()
  })

  it('removes the gate on gate_not_found', async () => {
    seedGate('gate-1')
    const sendRequest = vi.fn(() => Promise.resolve(GATE_NOT_FOUND))
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })

    expect(outcome).toEqual({ kind: 'taxonomy', code: 'gate_not_found' })
    expect(gateIds().includes('gate-1')).toBe(false)
    probe.unmount()
  })

  it('keeps the gate on invalid_resolution and unknown taxonomy codes', async () => {
    seedGate('gate-invalid')
    seedGate('gate-unknown')
    const responses: RpcResponse[] = [
      {
        id: '4',
        ok: true,
        result: { error: 'invalid_resolution' },
        _meta: { runtimeId: 'runtime-1' }
      },
      {
        id: '5',
        ok: true,
        result: { error: 'gate_reborn_v9' },
        _meta: { runtimeId: 'runtime-1' }
      }
    ]
    let call = 0
    const sendRequest = vi.fn(() => Promise.resolve(responses[call++] as RpcResponse))
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    await act(async () => {
      await probe.model.submitGateResolution('gate-invalid', 'approve')
      await probe.model.submitGateResolution('gate-unknown', 'approve')
    })

    expect(gateIds()).toContain('gate-invalid')
    expect(gateIds()).toContain('gate-unknown')
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

  it('A4: two parallel resolves race a server guard — exactly one lands, the loser gets gate_not_pending', async () => {
    seedGate('gate-1')
    // Server-guard mock: the conditional UPDATE only lands while the gate is still
    // pending; a lost race returns gate_not_pending with no side effect (mirrors
    // decision-gate-store.resolveGateIfPending). Two independent hook instances =
    // two resolve paths (e.g. two devices) through plain sendRequest — no
    // single-flight, the real wire race.
    const pendingOnServer = new Set(['gate-1'])
    const sendRequest = vi.fn(async (_method: string, params?: unknown) => {
      const gateId = (params as { gateId: string }).gateId
      if (pendingOnServer.has(gateId)) {
        pendingOnServer.delete(gateId)
        return GATE_RESOLVE_OK
      }
      return GATE_NOT_PENDING
    })
    let modelA!: ReturnType<typeof useMobileGateResolve>
    let modelB!: ReturnType<typeof useMobileGateResolve>
    const client = { sendRequest } as unknown as RpcClient
    function TwoResolvers() {
      modelA = useMobileGateResolve({ hostId: HOST, client })
      modelB = useMobileGateResolve({ hostId: HOST, client })
      return null
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(TwoResolvers))
    })

    let outcomes: Awaited<ReturnType<typeof modelA.submitGateResolution>>[] = []
    await act(async () => {
      outcomes = await Promise.all([
        modelA.submitGateResolution('gate-1', 'approve'),
        modelB.submitGateResolution('gate-1', 'approve')
      ])
    })

    const succeeded = outcomes.filter((outcome) => outcome?.kind === 'success')
    const lost = outcomes.filter(
      (outcome) => outcome?.kind === 'taxonomy' && outcome.code === 'gate_not_pending'
    )
    expect(succeeded).toHaveLength(1)
    expect(lost).toHaveLength(1)
    // Exactly two sends — the loser is treated as a race outcome, not retried.
    expect(sendRequest).toHaveBeenCalledTimes(2)
    expect(gateIds().includes('gate-1')).toBe(false)
    act(() => {
      renderer.unmount()
    })
  })

  it('transport reject clears the in-flight guard with no auto-retry; a re-tap sends a fresh request', async () => {
    seedGate('gate-1')
    const sendRequest = vi
      .fn<RpcClient['sendRequest']>()
      .mockRejectedValueOnce(new Error('ws drop'))
      .mockResolvedValueOnce(GATE_RESOLVE_OK)
    const probe = mountProbe({ sendRequest } as unknown as RpcClient)

    let outcome: Awaited<ReturnType<typeof probe.model.submitGateResolution>> = null
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })
    expect(outcome).toEqual({ kind: 'request-failed' })
    expect(sendRequest).toHaveBeenCalledTimes(1)

    // Re-tap is the retry model (server's pending guard makes it safe).
    await act(async () => {
      outcome = await probe.model.submitGateResolution('gate-1', 'approve')
      await Promise.resolve()
    })
    expect(outcome).toEqual({
      kind: 'success',
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
    expect(sendRequest).toHaveBeenCalledTimes(2)
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
