// Per-host pending-gates store (plan D6): state keyed by hostId so two hosts never
// cross-contaminate. Holds ONLY pending gates — sweep reconcile removes a row on
// positive closure evidence (server status !== 'pending'); event-sourced overlay
// rows survive sweeps that lack them (absence is never removal evidence — plan D1).
// T5's parser/subscriber/reducer builds on the upsert/remove/reconcile primitives.
import type { SuperpowersStoryDetailResult } from '../../../src/shared/superpowers/story-rpc-contract'

export type ContractSweepGate = SuperpowersStoryDetailResult['gates'][number]

export type PendingGateSource = 'sweep' | 'event'

export type PendingGateRow = Omit<ContractSweepGate, 'status'> & {
  status: 'pending'
  storyId: string | null
  source: PendingGateSource
  optionsKnown: boolean
}

// One storyDetail projection handed to reconcile — built by pending-gates-sweep.
export type PendingGatesSweepResponse = {
  storyId: string
  storyTitle: string
  gates: ContractSweepGate[]
}

export type PendingGatesHostSnapshot = {
  gates: readonly PendingGateRow[]
  storyTitles: ReadonlyMap<string, string>
  lastSweepAt: number | null
  unavailable: boolean
}

type HostState = {
  gates: Map<string, PendingGateRow>
  storyTitles: Map<string, string>
  lastSweepAt: number | null
  unavailable: boolean
}

const stateByHost = new Map<string, HostState>()
const listenersByHost = new Map<string, Set<() => void>>()
// Why: useSyncExternalStore compares snapshots by reference — cache per host,
// invalidate on mutation (connection-log-buffer precedent).
const snapshotByHost = new Map<string, PendingGatesHostSnapshot>()

const EMPTY_HOST: PendingGatesHostSnapshot = Object.freeze({
  gates: Object.freeze([]),
  storyTitles: Object.freeze(new Map<string, string>()),
  lastSweepAt: null,
  unavailable: false
})

function hostState(hostId: string): HostState {
  let state = stateByHost.get(hostId)
  if (!state) {
    state = { gates: new Map(), storyTitles: new Map(), lastSweepAt: null, unavailable: false }
    stateByHost.set(hostId, state)
  }
  return state
}

function notify(hostId: string): void {
  snapshotByHost.delete(hostId)
  const listeners = listenersByHost.get(hostId)
  if (!listeners) {
    return
  }
  for (const listener of listeners) {
    listener()
  }
}

// Event-mutation primitive (T5's gate-open reducer lands here): upsert by gateId so a
// duplicate gate-open converges instead of duplicating rows.
export function upsertPendingGate(hostId: string, row: PendingGateRow): void {
  hostState(hostId).gates.set(row.gateId, row)
  notify(hostId)
}

// Event-mutation primitive (T5's gate-closed reducer): a gate-closed for a gate this
// host never saw is a safe no-op.
export function removePendingGate(hostId: string, gateId: string): void {
  const state = stateByHost.get(hostId)
  if (!state || !state.gates.delete(gateId)) {
    return
  }
  notify(hostId)
}

export function markPendingGatesUnavailable(hostId: string, unavailable: boolean): void {
  const state = hostState(hostId)
  if (state.unavailable === unavailable) {
    return
  }
  state.unavailable = unavailable
  notify(hostId)
}

// Sweep reconcile (plan D1): every server gate updates/adds (re-classifying
// 'khác'-drift via storyLinked), closure removes ONLY on positive evidence
// (status !== 'pending'); gateId dedup means the 'khác' gates repeated across
// every storyDetail response converge to one row.
export function reconcileSweepResult(
  hostId: string,
  responses: readonly PendingGatesSweepResponse[]
): void {
  const state = hostState(hostId)
  for (const response of responses) {
    if (response.storyTitle) {
      state.storyTitles.set(response.storyId, response.storyTitle)
    }
    for (const gate of response.gates) {
      if (gate.status !== 'pending') {
        state.gates.delete(gate.gateId)
        continue
      }
      state.gates.set(gate.gateId, {
        ...gate,
        status: 'pending',
        storyId: gate.storyLinked ? response.storyId : null,
        source: 'sweep',
        optionsKnown: true
      })
    }
  }
  state.lastSweepAt = Date.now()
  state.unavailable = false
  notify(hostId)
}

export function getPendingGatesSnapshot(hostId: string): PendingGatesHostSnapshot {
  const cached = snapshotByHost.get(hostId)
  if (cached) {
    return cached
  }
  const state = stateByHost.get(hostId)
  if (!state) {
    return EMPTY_HOST
  }
  const gates = [...state.gates.values()].sort(
    (a, b) => a.createdAt - b.createdAt || (a.gateId < b.gateId ? -1 : 1)
  )
  const snapshot: PendingGatesHostSnapshot = {
    gates: Object.freeze(gates),
    storyTitles: new Map(state.storyTitles),
    lastSweepAt: state.lastSweepAt,
    unavailable: state.unavailable
  }
  snapshotByHost.set(hostId, snapshot)
  return snapshot
}

export function subscribePendingGates(hostId: string, listener: () => void): () => void {
  let listeners = listenersByHost.get(hostId)
  if (!listeners) {
    listeners = new Set()
    listenersByHost.set(hostId, listeners)
  }
  listeners.add(listener)
  return () => {
    const set = listenersByHost.get(hostId)
    if (!set) {
      return
    }
    set.delete(listener)
    if (set.size === 0) {
      listenersByHost.delete(hostId)
    }
  }
}

export function resetPendingGatesStoreForTests(): void {
  stateByHost.clear()
  listenersByHost.clear()
  snapshotByHost.clear()
}
