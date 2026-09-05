import type { OrchestrationDb } from '../../orchestration/db'
import {
  archiveSummary,
  retainedReason,
  summarizeStoredArchive,
  type WorkerReleaseReceipt
} from './orchestration-worker-release-receipts'
export {
  archiveSummary,
  exposeWorkerTerminalResource,
  type WorkerReleaseReceipt
} from './orchestration-worker-release-receipts'
import type {
  WorkerTerminalArchiveKind,
  WorkerTerminalArchiveStatus,
  WorkerTerminalResourceRow
} from '../../orchestration/worker-terminal-ownership'
import { captureWorkerOutputArchive } from '../../orchestration/worker-output-archive'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { describeUnconfirmedAgentStop } from '../../../../shared/pty-liveness-verdict'
import { inspectWorkerTerminal } from './orchestration-worker-observation'
import {
  resolveStructuredWorkerForDispatch,
  stopStructuredWorker
} from './orchestration-structured-worker-lifecycle'
import { isStructuredWorkerHandle } from '../../structured-worker-identity'
import { structuredWorkerTerminalLeaseIsCurrent } from './orchestration-worker-release-receipts'
import { orchestrationTimestampToMs } from './orchestration-worker-output'

type WorkerTerminalReleaseArgs = {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  dispatchId: string
  resource: WorkerTerminalResourceRow
  mode?: 'interactive' | 'recovery'
}

const activeReleaseByRuntime = new WeakMap<
  OrcaRuntimeService,
  Map<string, Promise<WorkerReleaseReceipt>>
>()

// Completes a durably requested release: re-prove exact identity, freeze output, close only the
// exact agent terminal, settle. Shared between the RPC method and the startup reconciler.
export function completeWorkerTerminalRelease(
  args: WorkerTerminalReleaseArgs
): Promise<WorkerReleaseReceipt> {
  let activeByResource = activeReleaseByRuntime.get(args.runtime)
  if (!activeByResource) {
    activeByResource = new Map()
    activeReleaseByRuntime.set(args.runtime, activeByResource)
  }
  const active = activeByResource.get(args.resource.id)
  if (active) {
    return active
  }
  const release = completeWorkerTerminalReleaseOnce(args).finally(() => {
    if (activeByResource?.get(args.resource.id) === release) {
      activeByResource.delete(args.resource.id)
    }
  })
  activeByResource.set(args.resource.id, release)
  return release
}

async function completeWorkerTerminalReleaseOnce(
  args: WorkerTerminalReleaseArgs
): Promise<WorkerReleaseReceipt> {
  const { runtime, db, dispatchId, resource } = args
  if (isStructuredWorkerHandle(resource.terminal_handle)) {
    // Observation and archive capture both read the structured host, and after a restart nothing
    // has installed it yet — the startup recovery reconciler runs exactly this path. Installing it
    // here is what lets the release see the session instead of reporting it unreadable.
    //
    // NOT yet handled, and deliberately follow-up: rebinding a restarted runtime to a structured
    // worker's hold and redrive subscription. Until that exists, a worker that survives a restart
    // keeps no hold, so its child is evictable and its parked mail waits for the next arrival
    // rather than a settle edge.
    await runtime.ensureStructuredAgentSessionHost().catch((error: unknown) => {
      console.warn(
        '[orchestration] structured host install failed before release',
        dispatchId,
        error
      )
    })
  }
  const worker = db.getWorkerDispatch(dispatchId)
  if (!worker || worker.agent_terminal_handle !== resource.terminal_handle) {
    const retained = db.revertWorkerTerminalReleaseToRetained(resource.id, 'identity_unproven')
    return {
      dispatchId,
      state: 'retained',
      reason: 'identity_unproven',
      processAction: 'none',
      archive: archiveSummary(retained)
    }
  }
  const observation = await inspectWorkerTerminal(runtime, db, dispatchId)
  if (observation.status === 'identity_changed') {
    const retained = db.revertWorkerTerminalReleaseToRetained(resource.id, 'identity_unproven')
    return {
      dispatchId,
      state: 'retained',
      reason: 'identity_unproven',
      processAction: 'none',
      archive: archiveSummary(retained)
    }
  }
  if (!workerTerminalLeaseIsCurrent(runtime, db, dispatchId, resource)) {
    const retained = db.revertWorkerTerminalReleaseToRetained(resource.id, 'identity_unproven')
    return {
      dispatchId,
      state: 'retained',
      reason: 'identity_unproven',
      processAction: 'none',
      archive: archiveSummary(retained)
    }
  }
  if (observation.status === 'missing' || observation.status === 'unattached') {
    if (args.mode === 'recovery') {
      // Inventory may still be incomplete during startup/reconnect discovery; defer.
      return {
        dispatchId,
        state: 'release_pending',
        processAction: 'none',
        archive: archiveSummary(resource),
        recovery:
          'The recorded terminal has not been rediscovered yet; recovery will retry after the next terminal inventory.'
      }
    }
    // Why: the handle resolves nowhere, but the PTY could have been re-homed after a restart —
    // claiming released would hide a live process; only an exact observation may settle it.
    const unknown = db.markWorkerTerminalReleaseUnknown(
      resource.id,
      'The recorded terminal no longer resolves; whether its process is gone cannot be proven.'
    )
    return {
      dispatchId,
      state: 'release_unknown',
      processAction: 'none',
      archive: archiveSummary(unknown),
      lastError: unknown.release_error ?? undefined,
      recovery: `Inspect with: orca orchestration worker-show --dispatch ${dispatchId} --json — then repeat worker-release with the same --retry-request. Never substitute a broad terminal close.`
    }
  }

  const archive = db.getWorkerTerminalArchive(dispatchId)
  let archiveSource = resource.archive_source as 'transcript' | 'terminal' | null
  let archiveStatus: WorkerTerminalArchiveStatus | null = resource.archive_status
  let capturedArchive: { kind: WorkerTerminalArchiveKind; content: string } | undefined
  const structured = resolveStructuredWorkerForDispatch(db, dispatchId)
  if (!archive) {
    const captured = await captureWorkerOutputArchive({
      runtime,
      dispatchId,
      terminalHandle: resource.terminal_handle,
      attachedAtMs: orchestrationTimestampToMs(worker.created_at),
      structuredWorker: structured
    })
    capturedArchive = { kind: captured.kind, content: JSON.stringify(captured.content) }
    archiveSource = captured.kind === 'terminal_tail' ? 'terminal' : 'transcript'
    archiveStatus = captured.status
  } else {
    const stored = summarizeStoredArchive(archive)
    archiveSource ??= stored.source
    archiveStatus ??= stored.status
  }
  const releasing = db.commitWorkerTerminalArchiveForRelease({
    dispatchId,
    resourceId: resource.id,
    ...capturedArchive,
    archiveSource,
    archiveStatus: archiveStatus === 'empty' ? 'empty' : 'captured'
  })
  if (releasing.ownership_state !== 'owned' || releasing.release_state !== 'releasing') {
    return {
      dispatchId,
      state: 'retained',
      reason: retainedReason(releasing),
      processAction: 'none',
      archive: archiveSummary(releasing)
    }
  }
  if (!workerTerminalLeaseIsCurrent(runtime, db, dispatchId, releasing)) {
    const retained = db.revertWorkerTerminalReleaseToRetained(resource.id, 'identity_unproven')
    return {
      dispatchId,
      state: 'retained',
      reason: 'identity_unproven',
      processAction: 'none',
      archive: archiveSummary(retained)
    }
  }

  try {
    if (structured) {
      const stop = await stopStructuredWorker(structured, dispatchId, runtime)
      if (!stop.stopped) {
        const unknown = db.markWorkerTerminalReleaseUnknown(
          resource.id,
          stop.reason ?? 'The structured session close was not proven.'
        )
        return {
          dispatchId,
          state: 'release_unknown',
          processAction: 'closed_agent_terminal',
          archive: { source: archiveSource, status: archiveStatus },
          lastError: unknown.release_error ?? stop.reason,
          recovery: `Inspect with: orca orchestration worker-show --dispatch ${dispatchId} --json — then repeat worker-release with the same --retry-request.`
        }
      }
      const settled = db.settleWorkerTerminalRelease(resource.id)
      runtime.notifyMessageArrived(`dispatch:${dispatchId}`, 'status')
      return {
        dispatchId,
        state: 'released',
        processAction: 'closed_agent_terminal',
        archive: archiveSummary(settled)
      }
    }
    const close = await runtime.closeTerminal(resource.terminal_handle)
    if (!close.ptyKilled) {
      const reason = describeUnconfirmedAgentStop(close)
      const unknown = db.markWorkerTerminalReleaseUnknown(resource.id, reason)
      return {
        dispatchId,
        state: 'release_unknown',
        processAction: 'closed_agent_terminal',
        archive: { source: archiveSource, status: archiveStatus },
        lastError: unknown.release_error ?? reason,
        recovery: `Inspect with: orca orchestration worker-show --dispatch ${dispatchId} --json — then repeat worker-release with the same --retry-request. Never substitute a broad terminal close.`
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (/disposed|not connected|unavailable/i.test(reason)) {
      // Durable intent exists; the owning endpoint is temporarily unreachable. Recovery retries.
      return {
        dispatchId,
        state: 'release_pending',
        processAction: 'none',
        archive: { source: archiveSource, status: archiveStatus },
        lastError: reason,
        recovery:
          'The owning endpoint is temporarily unavailable; recovery will retry this release after reconnect without another coordinator decision.'
      }
    }
    const unknown = db.markWorkerTerminalReleaseUnknown(resource.id, reason)
    return {
      dispatchId,
      state: 'release_unknown',
      processAction: 'none',
      archive: { source: archiveSource, status: archiveStatus },
      lastError: unknown.release_error ?? reason,
      recovery: `Inspect with: orca orchestration worker-show --dispatch ${dispatchId} --json — then repeat worker-release with the same --retry-request. Never substitute a broad terminal close.`
    }
  }
  const released = db.settleWorkerTerminalRelease(resource.id)
  runtime.notifyMessageArrived(`dispatch:${dispatchId}`, 'status')
  return {
    dispatchId,
    state: 'released',
    processAction:
      observation.status === 'exited' ? 'closed_exited_terminal' : 'closed_agent_terminal',
    archive: archiveSummary(released)
  }
}

function workerTerminalLeaseIsCurrent(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  dispatchId: string,
  resource: WorkerTerminalResourceRow
): boolean {
  const worker = db.getWorkerDispatch(dispatchId)
  if (isStructuredWorkerHandle(resource.terminal_handle)) {
    return structuredWorkerTerminalLeaseIsCurrent(db, dispatchId, worker, resource)
  }
  const authority = runtime.getOrchestrationDispatchAuthority(resource.terminal_handle)
  return Boolean(
    worker?.agent_terminal_handle === resource.terminal_handle &&
    authority &&
    resource.host_scope === JSON.stringify(authority.hostScope) &&
    db.isDispatchProcessCurrent({
      dispatchId,
      paneKey: runtime.getTerminalPaneKey(resource.terminal_handle),
      processIncarnation: runtime.getTerminalProcessIncarnation(resource.terminal_handle)
    }) &&
    !db.workerTerminalResourceHasIdentityConflict(resource.id)
  )
}
