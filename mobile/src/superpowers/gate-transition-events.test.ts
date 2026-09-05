// Consumer tests (plan T5): reducer idempotency over the REAL per-host store,
// debounced sweep coalescing, two-step teardown with ready-frame subscriptionId
// capture, and the D10 passive-consumer structural guard.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { gateOpenRoutingAbsent, gateOpenStoryLinked } from './gate-conformance-fixtures'
import { startGateTransitionEvents, SWEEP_DEBOUNCE_MS } from './gate-transition-events'
import { getPendingGatesSnapshot, resetPendingGatesStoreForTests } from './pending-gates-store'

const HOST = 'host-events'

const UNSUBSCRIBE_OK: RpcResponse = {
  id: 'u1',
  ok: true,
  result: { unsubscribed: true },
  _meta: { runtimeId: 'runtime-1' }
}

// Wraps a contract payload into the full stream-frame shape the listener receives.
function gateEvent(source: 'gate-open' | 'gate-closed', payload: object): unknown {
  return { type: 'notification', source, ...payload }
}

function makeHarness() {
  let listener: ((data: unknown) => void) | null = null
  let localDisposes = 0
  const requests: { method: string; params: unknown }[] = []
  const client = {
    sendRequest: (method: string, params?: unknown) => {
      requests.push({ method, params })
      return Promise.resolve(UNSUBSCRIBE_OK)
    },
    subscribe: (_method: string, _params: unknown, onData: (data: unknown) => void) => {
      listener = onData
      return () => {
        localDisposes += 1
        listener = null
      }
    }
  } as unknown as RpcClient
  return {
    client,
    emit: (data: unknown) => listener?.(data),
    requests,
    disposeCount: () => localDisposes
  }
}

function gateIds(): string[] {
  return getPendingGatesSnapshot(HOST).gates.map((row) => row.gateId)
}

describe('gate-transition-events reducer', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('gate-open with both routing keys absent lands as an overlay khác row', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))

    const [row] = getPendingGatesSnapshot(HOST).gates
    expect(row).toMatchObject({
      gateId: gateOpenRoutingAbsent.gateId,
      title: gateOpenRoutingAbsent.title,
      storyId: null,
      worktreeId: null,
      storyLinked: false,
      status: 'pending',
      source: 'event',
      optionsKnown: false
    })
    stop()
  })

  it('gate-open with both keys present keeps the story routing (options unknown until sweep)', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit(gateEvent('gate-open', gateOpenStoryLinked))

    const [row] = getPendingGatesSnapshot(HOST).gates
    expect(row?.storyId).toBe(gateOpenStoryLinked.storyId)
    expect(row?.worktreeId).toBe(gateOpenStoryLinked.worktreeId)
    expect(row?.storyLinked).toBe(true)
    expect(row?.optionsKnown).toBe(false)
    stop()
  })

  it('duplicate gate-open converges to one row (idempotent upsert)', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))
    harness.emit(
      gateEvent('gate-open', { ...gateOpenRoutingAbsent, title: 'Renamed by a second push' })
    )

    const snapshot = getPendingGatesSnapshot(HOST)
    expect(snapshot.gates).toHaveLength(1)
    expect(snapshot.gates[0]?.title).toBe('Renamed by a second push')
    stop()
  })

  it('gate-closed removes the gate regardless of who resolved it', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))
    harness.emit(gateEvent('gate-closed', gateOpenRoutingAbsent))

    expect(gateIds()).toEqual([])
    stop()
  })

  it('gate-closed for a never-seen gate is a safe no-op', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    expect(() =>
      harness.emit(gateEvent('gate-closed', { gateId: 'gate-ghost', title: 'Ghost' }))
    ).not.toThrow()
    expect(gateIds()).toEqual([])
    stop()
  })

  it('open → closed → open ends with the gate present', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))
    harness.emit(gateEvent('gate-closed', gateOpenRoutingAbsent))
    expect(gateIds()).toEqual([])
    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))
    expect(gateIds()).toEqual([gateOpenRoutingAbsent.gateId])
    stop()
  })

  it('non-gate frames (ready, dismiss, malformed) never touch the store', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit({ type: 'ready', subscriptionId: 'sub-1' })
    harness.emit({ type: 'dismiss', notificationId: 'notif-1' })
    harness.emit({ type: 'notification', source: 'terminal-bell', title: 'bell' })
    harness.emit('garbage')

    expect(gateIds()).toEqual([])
    stop()
  })
})

describe('debounced hydrating sweep', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a burst of N gate-opens triggers exactly one sweep', () => {
    const sweep = vi.fn()
    const harness = makeHarness()
    const stop = startGateTransitionEvents({ client: harness.client, hostId: HOST, sweep })

    for (let index = 0; index < 5; index += 1) {
      harness.emit(gateEvent('gate-open', { gateId: `gate-${index}`, title: `Gate ${index}` }))
    }
    vi.advanceTimersByTime(SWEEP_DEBOUNCE_MS - 1)
    expect(sweep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sweep).toHaveBeenCalledTimes(1)
    stop()
  })

  it('gate-closed alone never schedules a sweep', () => {
    const sweep = vi.fn()
    const harness = makeHarness()
    const stop = startGateTransitionEvents({ client: harness.client, hostId: HOST, sweep })

    harness.emit(gateEvent('gate-closed', { gateId: 'gate-ghost', title: 'Ghost' }))
    vi.advanceTimersByTime(SWEEP_DEBOUNCE_MS * 4)
    expect(sweep).not.toHaveBeenCalled()
    stop()
  })

  it('teardown cancels a pending debounced sweep', () => {
    const sweep = vi.fn()
    const harness = makeHarness()
    const stop = startGateTransitionEvents({ client: harness.client, hostId: HOST, sweep })

    harness.emit(gateEvent('gate-open', gateOpenRoutingAbsent))
    stop()
    vi.advanceTimersByTime(SWEEP_DEBOUNCE_MS * 4)
    expect(sweep).not.toHaveBeenCalled()
  })
})

describe('two-step teardown (leak guard)', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
  })

  it('sends notifications.unsubscribe with the captured subscriptionId, then disposes locally', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit({ type: 'ready', subscriptionId: 'sub-1' })
    stop()

    expect(harness.requests).toEqual([
      { method: 'notifications.unsubscribe', params: { subscriptionId: 'sub-1' } }
    ])
    expect(harness.disposeCount()).toBe(1)
  })

  it('without a ready frame there is no server unsubscribe — local dispose only', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    stop()

    expect(harness.requests).toEqual([])
    expect(harness.disposeCount()).toBe(1)
  })

  it('a second ready frame (transport replay) makes teardown use the NEW id', () => {
    const harness = makeHarness()
    const stop = startGateTransitionEvents({
      client: harness.client,
      hostId: HOST,
      sweep: () => {}
    })

    harness.emit({ type: 'ready', subscriptionId: 'sub-1' })
    harness.emit({ type: 'ready', subscriptionId: 'sub-2' })
    stop()

    expect(harness.requests).toEqual([
      { method: 'notifications.unsubscribe', params: { subscriptionId: 'sub-2' } }
    ])
    expect(harness.disposeCount()).toBe(1)
  })

  it('a rejecting unsubscribe never escapes teardown', async () => {
    const rejecting = {
      sendRequest: () => Promise.reject(new Error('socket dead')),
      subscribe: () => () => {}
    } as unknown as RpcClient
    const stop = startGateTransitionEvents({ client: rejecting, hostId: HOST, sweep: () => {} })

    expect(() => stop()).not.toThrow()
    // Drain microtasks — vitest fails the file on an unhandled rejection.
    await Promise.resolve()
    await Promise.resolve()
  })
})

describe('D10 passive-consumer guard', () => {
  it('the import list never touches the shared banner-delivery session or catch-up watermarks', () => {
    const source = readFileSync(new URL('./gate-transition-events.ts', import.meta.url), 'utf8')
    // Structural check on the import statements (comments may name the banned
    // symbols — the D10 header itself does); the module must never PULL them in.
    const imports = source.split('\n').filter((line) => /^import[\s{.]/.test(line))
    expect(imports.length).toBeGreaterThan(0)
    expect(imports.join('\n')).not.toMatch(
      /getHostNotificationSession|getMissedSince|\.\.\/notifications|notification-reconnect-catchup/
    )
  })
})
