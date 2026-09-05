/**
 * Resolves a structured worker handle to the same authority facts a live PTY supplies.
 *
 * The registry holds the handle→session mapping for this process; the durable worker-terminal
 * resource row is what survives a restart, so a miss falls back to rehydrating from it. The
 * durable agent-session record is the liveness half: a session handed to a TUI owner, released, or
 * pinned to another execution host is no longer this runtime's structured worker.
 */

import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrchestrationDb } from './orchestration/db'
import {
  isStructuredWorkerHandle,
  structuredWorkerIdentities,
  structuredWorkerRecordIsCurrent,
  type StructuredWorkerIdentity
} from './structured-worker-identity'

export type StructuredWorkerAuthority = {
  identity: StructuredWorkerIdentity
  record: AgentSessionRecord
}

export function readStructuredAgentSessionRecord(sessionId: string): AgentSessionRecord | null {
  try {
    return getStructuredAgentSessionHost()?.deps.store.getRecord(sessionId) ?? null
  } catch {
    return null
  }
}

/** Registry entry for a handle, rehydrated from the durable row when this process restarted. */
export function resolveStructuredWorkerIdentity(
  handle: string,
  db: OrchestrationDb | null | undefined
): StructuredWorkerIdentity | null {
  if (!isStructuredWorkerHandle(handle)) {
    return null
  }
  const known = structuredWorkerIdentities.get(handle)
  if (known) {
    return known
  }
  const row = db?.getWorkerTerminalResourceByHandle?.(handle)
  return row ? structuredWorkerIdentities.rehydrate(row) : null
}

/** Identity plus a record that still proves this runtime owns the session. */
export function resolveStructuredWorkerAuthority(
  handle: string,
  db: OrchestrationDb | null | undefined
): StructuredWorkerAuthority | null {
  const identity = resolveStructuredWorkerIdentity(handle, db)
  if (!identity) {
    return null
  }
  const record = readStructuredAgentSessionRecord(identity.sessionId)
  return record && structuredWorkerRecordIsCurrent(record) ? { identity, record } : null
}

export type StructuredWorkerObservation = {
  status: 'live' | 'unverifiable' | 'exited'
  reason?: string
}

export function observeStructuredWorker(
  identity: StructuredWorkerIdentity
): StructuredWorkerObservation {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    // Reading the persisted record store here would force-install the host, which is itself a side
    // effect; not being able to look is not evidence the child is gone.
    return {
      status: 'unverifiable',
      reason: 'The structured agent-session host is not installed in this runtime generation.'
    }
  }
  const record = host.deps.store.getRecord(identity.sessionId)
  if (!record) {
    return { status: 'unverifiable', reason: 'No durable record backs this structured session.' }
  }
  if (record.lease.claimStatus === 'released' && record.lease.deathEvidence) {
    return { status: 'exited' }
  }
  if (record.lease.runtimeKind !== 'native') {
    return {
      status: 'unverifiable',
      reason: 'The session lease is held by a terminal owner, not this structured host.'
    }
  }
  if (host.hasSession(identity.sessionId) && record.lease.claimStatus === 'live') {
    return { status: 'live' }
  }
  return {
    status: 'unverifiable',
    reason: 'The session has no attached provider child in this runtime generation.'
  }
}
