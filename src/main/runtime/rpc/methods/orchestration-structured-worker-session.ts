/**
 * Starting, holding and retiring a worker that IS a structured agent session.
 *
 * Three things make this different from the PTY worker path, and all three live here:
 *
 * - The session is created directly as structured, so readiness is the attach returning ok. There
 *   is no boot-to-idle gap to wait on and no `tui-idle` edge to read.
 * - A structured session's provider child is evicted 15s after its last HOLDER leaves, and holds
 *   come only from bound surfaces. A dispatched worker parked on mail is exactly that state, so
 *   the dispatch takes its own resume-capable hold and keeps it until the worker settles.
 * - The dispatch preamble is a turn, not keystrokes.
 */

import { randomUUID } from 'node:crypto'
import type { AgentJournalMessageItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-host'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import {
  mintAgentSessionOperationId,
  structuredPointerPayloadFingerprint
} from '../../orchestration/structured-pointer-operation-id'
import { structuredPointerCallerKey } from '../../orchestration/structured-mailbox-pointer-host'
import {
  mintStructuredWorkerHandle,
  structuredWorkerHostScope,
  structuredWorkerIdentities,
  mintStructuredWorkerPaneKey,
  structuredWorkerProcessIncarnation,
  type StructuredWorkerIdentity
} from '../../structured-worker-identity'
import { createStructuredAgentSessionForWorktree } from './structured-agent-session-create'

type StructuredWorkerBinding = {
  sessionId: string
  handle: string
  holderId: string
  disposeSubscription: () => void
}

const bindingsByDispatchId = new Map<string, StructuredWorkerBinding>()

export function structuredWorkerHoldId(dispatchId: string): string {
  return `orchestration:dispatch:${dispatchId}`
}

/**
 * Drops the dispatch's hold, its redrive subscription and its parked mail; the release clock takes
 * it from here.
 *
 * EVERY settlement has to reach this — stop, release AND abandon. A surviving hold does not just
 * leak: it keeps the provider child un-evictable for the life of the app, and makes host crash
 * recovery respawn a child for a worker that was settled long ago.
 */
export function releaseStructuredWorkerSession(
  dispatchId: string,
  runtime?: Pick<OrcaRuntimeService, 'forgetStructuredSessionMail'>
): void {
  const binding = bindingsByDispatchId.get(dispatchId)
  if (!binding) {
    return
  }
  bindingsByDispatchId.delete(dispatchId)
  binding.disposeSubscription()
  structuredWorkerIdentities.forget(binding.handle)
  runtime?.forgetStructuredSessionMail?.(binding.sessionId)
  try {
    getStructuredAgentSessionHost()?.release(binding.sessionId, binding.holderId)
  } catch (error) {
    console.warn('[orchestration] structured worker hold release failed', dispatchId, error)
  }
}

export async function createStructuredWorkerSession(args: {
  runtime: OrcaRuntimeService
  worktreeId: string
  agent: 'claude' | 'codex'
  dispatchId: string
  /** Retried whenever the session's journal moves, which is the structured idle edge. */
  onJournalActivity: (sessionId: string) => void
}): Promise<{ identity: StructuredWorkerIdentity; host: StructuredAgentSessionHost }> {
  const sessionId = randomUUID()
  // Registered BEFORE the session is created, because `attach` is what spawns the provider child
  // and the child's environment is read from this registry at spawn time. Registering afterwards
  // ships a worker with no ORCA_TERMINAL_HANDLE, whose bare `orca orchestration check` then
  // resolves to whatever single leaf sits in the worktree — by default the COORDINATOR's pane.
  //
  // The scope is provisionally local; the record's own location is asserted local below, and a
  // session that resolves anywhere else never reaches a hold.
  const identity = structuredWorkerIdentities.register({
    handle: mintStructuredWorkerHandle(),
    sessionId,
    agent: args.agent,
    paneKey: mintStructuredWorkerPaneKey(sessionId),
    processIncarnation: structuredWorkerProcessIncarnation(sessionId),
    worktreeId: args.worktreeId,
    hostScope: { kind: 'local', hostId: 'local' }
  })
  let created: Awaited<ReturnType<typeof createStructuredAgentSessionForWorktree>> | undefined
  try {
    created = await createStructuredAgentSessionForWorktree({
      runtime: args.runtime,
      ensureHost: async () => {
        await args.runtime.ensureStructuredAgentSessionHost()
        return requireInstalledHost()
      },
      caller: { callerKey: structuredPointerCallerKey(args.dispatchId) },
      envelope: {
        sessionId,
        clientOperationId: mintAgentSessionOperationId(Date.now()),
        expectedRuntimeFence: null,
        payloadFingerprint: ''
      },
      worktree: `id:${args.worktreeId}`,
      agent: args.agent,
      // Dispatching a worker is background work; it must not pull the surface away from the user.
      activate: false
    })
    if (!created.ok) {
      throw new OrchestrationError(
        'agent_unconfigured',
        `The structured ${args.agent} session for this worker was refused: ${created.refusal.message}`
      )
    }
    const host = requireInstalledHost()
    const record = host.deps.store.getRecord(sessionId)
    if (!record || !structuredWorkerHostScope(record.location)) {
      throw new OrchestrationError(
        'agent_unconfigured',
        'A structured worker must run on the local execution host outside WSL.'
      )
    }
    const holderId = structuredWorkerHoldId(args.dispatchId)
    await host.hold(sessionId, holderId)
    const disposeSubscription = subscribeForRedrive(host, sessionId, args.onJournalActivity)
    bindingsByDispatchId.set(args.dispatchId, {
      sessionId,
      handle: identity.handle,
      holderId,
      disposeSubscription
    })
    return { identity, host }
  } catch (error) {
    // A start that fails after the session exists would otherwise strand a live provider child and
    // a published background tab that no dispatch owns.
    structuredWorkerIdentities.forget(identity.handle)
    if (created?.ok) {
      await discardCreatedSession(sessionId)
    }
    throw error
  }
}

/** Best-effort teardown of a session created by a worker start that then failed. */
async function discardCreatedSession(sessionId: string): Promise<void> {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return
  }
  try {
    await host.setSessionTabVisibility?.(sessionId, false)
    await host.close(sessionId)
  } catch (error) {
    console.warn(
      '[orchestration] failed to discard a half-started structured worker',
      sessionId,
      error
    )
  }
}

/** Delivers the dispatch preamble as the worker's first turn. */
export async function sendStructuredWorkerPreamble(args: {
  host: StructuredAgentSessionHost
  sessionId: string
  dispatchId: string
  preamble: string
}): Promise<void> {
  const body: AgentJournalMessageItem = {
    kind: 'message',
    role: 'user',
    blocks: [{ type: 'text', text: args.preamble }]
  }
  const fence = args.host.deps.store.getRecord(args.sessionId)?.lease.runtimeFence
  if (fence === undefined) {
    throw new Error('The structured worker session has no durable record to dispatch into.')
  }
  const result = await args.host.send(
    { callerKey: structuredPointerCallerKey(args.dispatchId) },
    {
      envelope: {
        sessionId: args.sessionId,
        clientOperationId: mintAgentSessionOperationId(Date.now()),
        expectedRuntimeFence: fence,
        payloadFingerprint: structuredPointerPayloadFingerprint(args.sessionId, body)
      },
      body,
      retryUnknown: true
    }
  )
  if (!result.ok) {
    throw new Error(`The dispatch preamble was refused: ${result.refusal.message}`)
  }
  if (result.value.submission.dispatchState === 'rejected') {
    throw new Error(
      `The dispatch preamble was rejected: ${result.value.submission.reason ?? 'no reason given'}`
    )
  }
}

function requireInstalledHost(): StructuredAgentSessionHost {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    throw new OrchestrationError(
      'agent_unconfigured',
      'Structured agent sessions are unavailable on this runtime.'
    )
  }
  return host
}

/**
 * Any journal movement is the redrive edge.
 *
 * A settled turn is TOMBSTONED rather than rewritten, so watching for a completed lifecycle row
 * would miss the common case. Re-running the gate on every batch is cheap because it only does
 * work when a pointer is actually parked on this session.
 */
function subscribeForRedrive(
  host: StructuredAgentSessionHost,
  sessionId: string,
  onJournalActivity: (sessionId: string) => void
): () => void {
  try {
    return host.subscribe({
      id: `orchestration:redrive:${sessionId}`,
      sessionId,
      emit: (event) => {
        if (event.type === 'batch' || event.type === 'reset') {
          onJournalActivity(sessionId)
        }
      }
    })
  } catch (error) {
    console.warn('[orchestration] structured worker redrive subscription failed', sessionId, error)
    return () => {}
  }
}
