// Hook tests: section grouping (story titles, fallback raw storyId, fixed 'Khác'
// last) + store subscription / sweep triggering through a mounted probe.
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { storyDetailResultNormal, storyListItemNormal } from './gate-conformance-fixtures'
import {
  getPendingGatesSnapshot,
  reconcileSweepResult,
  resetPendingGatesStoreForTests,
  upsertPendingGate,
  type PendingGateRow
} from './pending-gates-store'
import { runPendingGatesSweep } from './pending-gates-sweep'
import {
  KHAC_SECTION_KEY,
  KHAC_SECTION_TITLE,
  buildPendingGateSections,
  useMobilePendingGates
} from './use-mobile-pending-gates'

const HOST = 'host-a'

const STORY_LIST_OK: RpcResponse = {
  id: '1',
  ok: true,
  result: { stories: [storyListItemNormal] },
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
  error: { code: 'method_not_found', message: 'Unknown method' },
  _meta: { runtimeId: 'runtime-1' }
}

function overlayRow(overrides: Partial<PendingGateRow>): PendingGateRow {
  return {
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
    optionsKnown: false,
    ...overrides
  }
}

describe('buildPendingGateSections', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('groups per story with sweep-carried titles and falls back to the raw storyId', () => {
    reconcileSweepResult(HOST, [
      {
        storyId: storyListItemNormal.storyId,
        storyTitle: storyListItemNormal.title,
        gates: storyDetailResultNormal.gates
      }
    ])
    upsertPendingGate(
      HOST,
      overlayRow({
        gateId: 'gate-unknown-story',
        storyId: 'brackets/unknown.md',
        storyLinked: true
      })
    )

    const sections = buildPendingGateSections(getPendingGatesSnapshot(HOST))
    const titles = sections.map((section) => section.title)
    // Sweep-carried title wins for the known story; raw id for the unknown one; 'Khác' fixed last.
    expect(titles).toContain(storyListItemNormal.title)
    expect(titles).toContain('brackets/unknown.md')
    expect(sections[sections.length - 1]?.key).toBe(KHAC_SECTION_KEY)
    expect(sections[sections.length - 1]?.title).toBe(KHAC_SECTION_TITLE)

    const khacRows = sections[sections.length - 1]?.rows ?? []
    expect(khacRows.map((row) => row.gateId)).toEqual(['gate-fi305-khac-freetext'])
    const storySection = sections.find((section) => section.key === storyListItemNormal.storyId)
    // Only the pending gate lands in the store — the timeout row is closure evidence.
    expect(storySection?.rows.map((row) => row.gateId)).toEqual(['gate-fi305-approve-sf1'])
  })

  it('omits empty groups — no gates means no sections at all', () => {
    expect(buildPendingGateSections(getPendingGatesSnapshot(HOST))).toEqual([])
  })
})

describe('useMobilePendingGates', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  function mountProbe(client: RpcClient | null, connected: boolean) {
    let latest!: ReturnType<typeof useMobilePendingGates>
    function Probe() {
      latest = useMobilePendingGates({ hostId: HOST, client, connected })
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
        // Drain enough microtask rounds for the full sweep chain to settle.
        for (let round = 0; round < 8; round += 1) {
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

  function scriptedClient(respond: (method: string) => RpcResponse) {
    const calls: string[] = []
    const client = {
      sendRequest: (method: string) => {
        calls.push(method)
        return Promise.resolve(respond(method))
      },
      // The hook also starts the passive gate-events consumer (plan T5).
      subscribe: () => () => {}
    } as unknown as RpcClient
    return { client, calls }
  }

  it('sweeps automatically when a connected client appears and exposes sections', async () => {
    const { client, calls } = scriptedClient((method) =>
      method === 'superpowers.storyList' ? STORY_LIST_OK : STORY_DETAIL_OK
    )
    const probe = mountProbe(client, true)
    await probe.flush()

    expect(calls).toContain('superpowers.storyList')
    expect(probe.model.sections.map((section) => section.title)).toEqual([
      storyListItemNormal.title,
      KHAC_SECTION_TITLE
    ])
    expect(probe.model.unavailable).toBe(false)
    expect(probe.model.refreshing).toBe(false)
    probe.unmount()
  })

  it('does not sweep without a client or while disconnected', async () => {
    const { calls } = scriptedClient(() => STORY_LIST_OK)
    const probe = mountProbe(null, false)
    await probe.flush()
    expect(calls).toHaveLength(0)
    expect(probe.model.sections).toEqual([])

    probe.model.refresh()
    await probe.flush()
    expect(calls).toHaveLength(0)
    probe.unmount()
  })

  it('refresh runs the sweep and surfaces the unavailable flag from a failed one', async () => {
    let failStoryList = true
    const { client, calls } = scriptedClient((method) =>
      method === 'superpowers.storyList'
        ? failStoryList
          ? METHOD_NOT_FOUND
          : STORY_LIST_OK
        : STORY_DETAIL_OK
    )
    const probe = mountProbe(client, true)
    await probe.flush()
    expect(probe.model.unavailable).toBe(true)
    expect(probe.model.sections).toEqual([])

    failStoryList = false
    act(() => {
      probe.model.refresh()
    })
    expect(probe.model.refreshing).toBe(true)
    await probe.flush()
    expect(probe.model.refreshing).toBe(false)
    expect(probe.model.unavailable).toBe(false)
    expect(calls.filter((method) => method === 'superpowers.storyList')).toHaveLength(2)
    probe.unmount()
  })

  it('ignores refresh while a sweep is already in flight', async () => {
    const storyListSettlers: Array<(response: RpcResponse) => void> = []
    const calls: string[] = []
    const client = {
      sendRequest: (method: string) => {
        calls.push(method)
        if (method === 'superpowers.storyList') {
          return new Promise<RpcResponse>((resolve) => {
            storyListSettlers.push(resolve)
          })
        }
        return Promise.resolve(STORY_DETAIL_OK)
      },
      subscribe: () => () => {}
    } as unknown as RpcClient

    const probe = mountProbe(client, true)
    await act(async () => {
      await Promise.resolve()
    })
    expect(probe.model.refreshing).toBe(true)
    expect(storyListSettlers).toHaveLength(1)

    act(() => {
      probe.model.refresh()
      probe.model.refresh()
    })
    expect(calls).toHaveLength(1)
    expect(storyListSettlers).toHaveLength(1)

    await act(async () => {
      storyListSettlers[0]?.(STORY_LIST_OK)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(probe.model.refreshing).toBe(false)
    probe.unmount()
  })

  it('reflects a direct sweep writing to the same per-host store', async () => {
    const probe = mountProbe(null, false)
    await act(async () => {
      await runPendingGatesSweep({
        client: { sendRequest: () => Promise.resolve(STORY_LIST_OK) } as unknown as RpcClient,
        hostId: HOST,
        send: (_client, hostId, kind) =>
          hostId === HOST && kind === 'superpowers.storyList'
            ? Promise.resolve(STORY_LIST_OK)
            : Promise.resolve(STORY_DETAIL_OK)
      })
    })
    expect(probe.model.sections.map((section) => section.title)).toEqual([
      storyListItemNormal.title,
      KHAC_SECTION_TITLE
    ])
    probe.unmount()
  })

  it('starts the passive gate-events consumer per client and tears it down on unmount', async () => {
    const calls: { method: string; params: unknown }[] = []
    let disposes = 0
    let emit: ((data: unknown) => void) | null = null
    const client = {
      sendRequest: (method: string, params?: unknown) => {
        calls.push({ method, params })
        return Promise.resolve(STORY_LIST_OK)
      },
      subscribe: (_method: string, _params: unknown, onData: (data: unknown) => void) => {
        emit = onData
        return () => {
          disposes += 1
          emit = null
        }
      }
    } as unknown as RpcClient

    const probe = mountProbe(client, true)
    expect(calls.filter((call) => call.method === 'superpowers.storyList')).toHaveLength(1)

    act(() => {
      emit?.({ type: 'ready', subscriptionId: 'sub-hook-1' })
      emit?.({
        type: 'notification',
        source: 'gate-open',
        gateId: 'gate-hook-event',
        title: 'Event-sourced row'
      })
    })
    expect(getPendingGatesSnapshot(HOST).gates.map((row) => row.gateId)).toContain(
      'gate-hook-event'
    )

    probe.unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(disposes).toBe(1)
    expect(calls).toContainEqual({
      method: 'notifications.unsubscribe',
      params: { subscriptionId: 'sub-hook-1' }
    })
  })
})
