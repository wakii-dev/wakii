// Normalizes a raw notifications stream event (plan T5/D1/D5) into the typed
// transition the reducer consumes. Wire reality: the desktop dispatch conditionally
// spreads storyId/worktreeId — when a gate maps to no bracket worktree BOTH keys
// are LITERALLY ABSENT (both-or-neither,
// src/main/runtime/runtime-gate-transition-notifications.ts:92-100); present-as-null
// is the forward-compat shape. Extra envelope fields (body/notificationId/
// notificationSeq/notificationEpoch — the controller dispatch spread) are tolerated
// and never read. Malformed input parses to null: a dropped event, never a crash.

import { coerceUndefinedToNull } from './gate-conformance-fixtures'

export type ParsedGateTransition = {
  kind: 'open' | 'closed'
  gateId: string
  storyId: string | null
  worktreeId: string | null
  title: string
}

// D5 kernel: absent key → undefined → null; present-as-null → null; a present
// non-empty string passes. Empty/garbage values also null — a bad value must never
// misroute a gate between a story group and 'khác'.
function routingField(value: unknown): string | null {
  if (value === undefined || value === null) {
    return coerceUndefinedToNull(value)
  }
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function parseGateTransitionPayload(raw: unknown): ParsedGateTransition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const event = raw as Record<string, unknown>
  if (event.type !== 'notification') {
    return null
  }
  const kind =
    event.source === 'gate-open' ? 'open' : event.source === 'gate-closed' ? 'closed' : null
  if (kind === null) {
    return null
  }
  if (typeof event.gateId !== 'string' || event.gateId.length === 0) {
    return null
  }
  if (typeof event.title !== 'string') {
    return null
  }
  return {
    kind,
    gateId: event.gateId,
    storyId: routingField(event.storyId),
    worktreeId: routingField(event.worktreeId),
    title: event.title
  }
}
