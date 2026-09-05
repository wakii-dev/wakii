// Receipt shapes for worker terminal release, and the small readers that build them.
//
// Split from the release runner so the runner stays about the ordering of proofs.

import type {
  WorkerTerminalArchiveRow,
  WorkerTerminalArchiveStatus,
  WorkerTerminalResourceRow,
  WorkerTerminalRetainedReason
} from '../../orchestration/worker-terminal-ownership'
import type { WorkerTerminalTailArchive } from '../../orchestration/worker-output-archive'
import type { OrchestrationDb } from '../../orchestration/db'
import type { WorkerDispatchRow } from '../../orchestration/types'
import { resolveStructuredWorkerIdentity } from '../../structured-worker-authority'

export type WorkerReleaseReceipt = {
  dispatchId: string
  state: 'released' | 'already_released' | 'retained' | 'release_pending' | 'release_unknown'
  reason?: WorkerTerminalRetainedReason
  processAction: 'closed_agent_terminal' | 'closed_exited_terminal' | 'none'
  archive: { source: string | null; status: string | null } | null
  recovery?: string
  lastError?: string
}

export function exposeWorkerTerminalResource(resource: WorkerTerminalResourceRow): {
  id: string
  ownershipState: string
  releaseState: string
  retainedReason: string | null
  terminalHandle: string
  worktreeId: string | null
  originDispatchId: string
  ownerDispatchId: string
  releaseRequestedAt: string | null
  releaseCompletedAt: string | null
  releaseError: string | null
  archive: { source: string | null; status: string | null }
} {
  return {
    id: resource.id,
    ownershipState: resource.ownership_state,
    releaseState: resource.release_state,
    retainedReason: resource.retained_reason,
    terminalHandle: resource.terminal_handle,
    worktreeId: resource.worktree_id,
    originDispatchId: resource.origin_dispatch_id,
    ownerDispatchId: resource.owner_dispatch_id,
    releaseRequestedAt: resource.release_requested_at,
    releaseCompletedAt: resource.release_completed_at,
    releaseError: resource.release_error,
    archive: { source: resource.archive_source, status: resource.archive_status }
  }
}

export function archiveSummary(
  resource: WorkerTerminalResourceRow | null
): { source: string | null; status: string | null } | null {
  if (!resource) {
    return null
  }
  if (!resource.archive_source && !resource.archive_status) {
    return null
  }
  return { source: resource.archive_source, status: resource.archive_status }
}

export function summarizeStoredArchive(archive: WorkerTerminalArchiveRow): {
  source: 'transcript' | 'terminal'
  status: Extract<WorkerTerminalArchiveStatus, 'captured' | 'empty'>
} {
  if (archive.kind === 'transcript_pin') {
    return { source: 'transcript', status: 'captured' }
  }
  if (archive.kind === 'structured_journal') {
    const journal = JSON.parse(archive.content) as { messages: unknown[] }
    return { source: 'transcript', status: journal.messages.length > 0 ? 'captured' : 'empty' }
  }
  const content = JSON.parse(archive.content) as WorkerTerminalTailArchive
  const empty = content.lines.every((line) => line.trim() === '')
  return { source: 'terminal', status: empty ? 'empty' : 'captured' }
}

export function retainedReason(resource: WorkerTerminalResourceRow): WorkerTerminalRetainedReason {
  if (resource.retained_reason) {
    return resource.retained_reason as WorkerTerminalRetainedReason
  }
  if (resource.ownership_state === 'user_owned') {
    return 'user_takeover'
  }
  return 'identity_unproven'
}

export function structuredWorkerTerminalLeaseIsCurrent(
  db: OrchestrationDb,
  dispatchId: string,
  worker: WorkerDispatchRow | undefined,
  resource: WorkerTerminalResourceRow
): boolean {
  // IDENTITY, not liveness. The durable row plus the session-lineage incarnation say whether
  // this is still the same worker; whether its child is alive is what the observation reports,
  // honestly, as live / unverifiable / exited. Asking the record for identity would make a
  // restart — where the host may not be installed yet — read as a different worker and turn a
  // durably requested release into a permanent `retained/identity_unproven`.
  const identity = resolveStructuredWorkerIdentity(resource.terminal_handle, db)
  return Boolean(
    worker?.agent_terminal_handle === resource.terminal_handle &&
    identity &&
    resource.host_scope === JSON.stringify(identity.hostScope) &&
    db.isDispatchProcessCurrent({
      dispatchId,
      paneKey: identity.paneKey,
      processIncarnation: identity.processIncarnation
    }) &&
    !db.workerTerminalResourceHasIdentityConflict(resource.id)
  )
}
