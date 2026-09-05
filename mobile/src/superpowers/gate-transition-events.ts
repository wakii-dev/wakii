// Passive second notifications stream consumer (plan D10 — HARD LINE): this module
// opens its OWN client.subscribe('notifications.subscribe') with its own listener and
// NEVER touches the shared banner-delivery session — no getHostNotificationSession,
// no seen-guard, no watermark writes, no getMissedSince. Safe at both layers: the
// server registers one listener per subscribe with a per-connection subscriptionId
// ("concurrent subscribes never collide",
// src/main/runtime/rpc/methods/notifications.ts:37-65), and the transport keys
// streams by request id (rpc-client-stream-registry.ts:49-80). The sweep stays the
// reconcile authority — this consumer only keeps the list live between sweeps.
//
// Teardown is two-step (leak guard): transport dispose does NOT tell the server for
// notifications.subscribe (buildStreamUnsubscribe returns null for it,
// rpc-client-terminal-subscription.ts:39-65), so the ready frame's subscriptionId is
// captured and notifications.unsubscribe is sent on stop before the local dispose —
// own code mirroring mobile-notifications.ts:210-214, not its internals. A reconnect
// replay yields a SECOND ready frame — the new subscriptionId is adopted, the old
// one discarded.

import type { RpcClient } from '../transport/rpc-client'
import {
  parseGateTransitionPayload,
  type ParsedGateTransition
} from './parse-gate-transition-payload'
import { removePendingGate, upsertPendingGate, type PendingGateRow } from './pending-gates-store'

// A burst of gate events must coalesce to one hydrating sweep, not N.
export const SWEEP_DEBOUNCE_MS = 500

export type GateTransitionEventsDeps = {
  client: RpcClient
  hostId: string
  /** Fired (debounced) after gate-open so event rows hydrate options via a sweep. */
  sweep: () => void
}

// Events carry no server createdAt (0 hides the screen's meta line) and no options
// yet — the debounced sweep hydrates them for story-linked gates.
function eventRow(transition: ParsedGateTransition): PendingGateRow {
  return {
    gateId: transition.gateId,
    title: transition.title,
    status: 'pending',
    resolution: null,
    options: [],
    worktreeId: transition.worktreeId,
    createdAt: 0,
    storyLinked: transition.storyId !== null,
    storyId: transition.storyId,
    source: 'event',
    optionsKnown: false
  }
}

export function startGateTransitionEvents(deps: GateTransitionEventsDeps): () => void {
  const { client, hostId, sweep } = deps
  let subscriptionId: string | null = null
  let disposed = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleSweep = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      sweep()
    }, SWEEP_DEBOUNCE_MS)
  }

  const unsubscribeStream = client.subscribe('notifications.subscribe', {}, (data) => {
    if (disposed) {
      return
    }
    const frame = data as { type?: unknown; subscriptionId?: unknown } | null
    if (frame?.type === 'ready') {
      if (typeof frame.subscriptionId === 'string' && frame.subscriptionId.length > 0) {
        // A (re)connect replay issues a NEW id — adopt it, discard the old.
        subscriptionId = frame.subscriptionId
      }
      return
    }
    const transition = parseGateTransitionPayload(data)
    if (!transition) {
      return
    }
    if (transition.kind === 'open') {
      // Duplicate gate-open converges: idempotent upsert by gateId per host.
      upsertPendingGate(hostId, eventRow(transition))
      scheduleSweep()
      return
    }
    // gate-closed for a gate this host never saw is a safe no-op (store primitive).
    removePendingGate(hostId, transition.gateId)
  })

  return () => {
    disposed = true
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (subscriptionId !== null) {
      // Best-effort: a dead socket rejects (caught) and the per-connection cleanup
      // reaps the listener server-side anyway.
      void client.sendRequest('notifications.unsubscribe', { subscriptionId }).catch(() => {})
    }
    unsubscribeStream()
  }
}
