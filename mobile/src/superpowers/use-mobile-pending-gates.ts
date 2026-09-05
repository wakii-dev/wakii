import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { SWEEP_DEBOUNCE_MS, startGateTransitionEvents } from './gate-transition-events'
import { runPendingGatesSweep } from './pending-gates-sweep'
import {
  getPendingGatesSnapshot,
  subscribePendingGates,
  type PendingGateRow,
  type PendingGatesHostSnapshot
} from './pending-gates-store'

// Fixed label for the non-story-linked group ('khác' gates: worktreeId null —
// derivation is point-in-time, never cached as a permanent membership).
export const KHAC_SECTION_KEY = 'khac'
export const KHAC_SECTION_TITLE = 'Khác'

export type PendingGateSection = {
  key: string
  title: string
  rows: readonly PendingGateRow[]
}

// Story groups keyed by storyId (header = sweep-carried title, fallback raw id),
// fixed 'Khác' section last. Empty groups are omitted.
export function buildPendingGateSections(snapshot: PendingGatesHostSnapshot): PendingGateSection[] {
  const byStory = new Map<string, PendingGateRow[]>()
  const khac: PendingGateRow[] = []
  for (const row of snapshot.gates) {
    if (row.storyId === null) {
      khac.push(row)
      continue
    }
    const rows = byStory.get(row.storyId)
    if (rows) {
      rows.push(row)
    } else {
      byStory.set(row.storyId, [row])
    }
  }
  const sections = [...byStory.entries()].map(([storyId, rows]) => ({
    key: storyId,
    title: snapshot.storyTitles.get(storyId) ?? storyId,
    rows
  }))
  sections.sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
  if (khac.length > 0) {
    sections.push({ key: KHAC_SECTION_KEY, title: KHAC_SECTION_TITLE, rows: khac })
  }
  return sections
}

export function useMobilePendingGates(params: {
  hostId: string
  client: RpcClient | null
  connected: boolean
}): {
  sections: PendingGateSection[]
  unavailable: boolean
  lastSweepAt: number | null
  refreshing: boolean
  refresh: () => void
} {
  const { hostId, client, connected } = params
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => subscribePendingGates(hostId, listener), [hostId]),
    useCallback(() => getPendingGatesSnapshot(hostId), [hostId])
  )
  const [refreshing, setRefreshing] = useState(false)
  const sweepingRef = useRef(false)
  const clientRef = useRef(client)
  clientRef.current = client

  const refresh = useCallback(() => {
    const current = clientRef.current
    if (!current || sweepingRef.current) {
      return
    }
    sweepingRef.current = true
    setRefreshing(true)
    void runPendingGatesSweep({ client: current, hostId })
      .catch(() => {})
      .finally(() => {
        sweepingRef.current = false
        setRefreshing(false)
      })
  }, [hostId])

  // The sweep is the reconcile authority — run it whenever the host (re)connects or
  // the client instance is replaced. First connect for a client sweeps immediately;
  // later transitions into 'connected' are reconnects, debounced (same budget as the
  // T5 event sweep) so a reconnect storm coalesces to one — the transport already
  // replays the stream subscription on reconnect (rpc-client-stream-registry.ts
  // replayAfterAuthentication), this sweep only repairs the replay-window gaps.
  const connectedClientRef = useRef<RpcClient | null>(null)
  useEffect(() => {
    if (!client || !connected) {
      return
    }
    if (connectedClientRef.current !== client) {
      connectedClientRef.current = client
      refresh()
      return
    }
    const timer = setTimeout(refresh, SWEEP_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [client, connected, refresh])

  // Event liveness (plan T5/D10): a passive second notifications stream mutates the
  // store between sweeps; its debounced re-sweep reuses refresh. The transport
  // queues the subscribe until connected and replays it after a reconnect.
  useEffect(() => {
    if (!client) {
      return
    }
    return startGateTransitionEvents({ client, hostId, sweep: refresh })
  }, [client, hostId, refresh])

  return {
    sections: buildPendingGateSections(snapshot),
    unavailable: snapshot.unavailable,
    lastSweepAt: snapshot.lastSweepAt,
    refreshing,
    refresh
  }
}
