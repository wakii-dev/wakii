/**
 * The lifecycle verbs for a worker that IS a structured agent session.
 *
 * Observation follows the SSH execution-boundary vocabulary — `live` / `unverifiable` / `exited` —
 * because losing contact with a host generation is not a death certificate. In particular a
 * runtime that has not installed the structured host cannot see a session's child at all, and that
 * is `unverifiable`, never `exited`.
 */

import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { AgentType, NativeChatMessage } from '../../../../shared/native-chat-types'
import type { OrchestrationWorkerReadTranscriptResult } from '../../../../shared/orchestration-worker-output'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { OrchestrationDb } from '../../orchestration/db'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import {
  buildStructuredJournalArchive,
  type WorkerStructuredJournalArchive
} from '../../orchestration/structured-worker-journal-archive'
import {
  createWorkerOutputSourceIdentity,
  decodeWorkerOutputCursor,
  encodeWorkerOutputCursor
} from '../../orchestration/worker-output-cursor'
import {
  boundWorkerTranscriptMessages,
  clampWorkerTranscriptLimit
} from '../../orchestration/worker-transcript-payload'
import { projectStructuredItemsToNativeChat } from '../../../../shared/structured-agent-session-projection'
import {
  observeStructuredWorker,
  resolveStructuredWorkerIdentity,
  type StructuredWorkerObservation
} from '../../structured-worker-authority'
import type { StructuredWorkerIdentity } from '../../structured-worker-identity'
import { releaseStructuredWorkerSession } from './orchestration-structured-worker-session'

export { observeStructuredWorker, type StructuredWorkerObservation }

const JOURNAL_PAGE_LIMIT = 200

/** The structured worker behind a dispatch, or null when a PTY worker owns it. */
export function resolveStructuredWorkerForDispatch(
  db: OrchestrationDb,
  dispatchId: string
): StructuredWorkerIdentity | null {
  const handle =
    db.getWorkerDispatch(dispatchId)?.agent_terminal_handle ??
    db.getDispatchContextById(dispatchId)?.assignee_handle
  return handle ? resolveStructuredWorkerIdentity(handle, db) : null
}

/**
 * Stopping a structured worker.
 *
 * `host.close` returns void and keeps a failed close indexed for retry, so the only settlement
 * evidence is the observation AFTER it: a session the host no longer holds and whose lease is no
 * longer live is proven gone. Anything else is retained rather than settled.
 */
export async function stopStructuredWorker(
  identity: StructuredWorkerIdentity,
  dispatchId: string,
  runtime?: Pick<OrcaRuntimeService, 'forgetStructuredSessionMail'>
): Promise<{ stopped: boolean; reason?: string }> {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return {
      stopped: false,
      reason: 'The structured agent-session host is not installed; no session was closed.'
    }
  }
  try {
    await host.setSessionTabVisibility?.(identity.sessionId, false)
    await host.close(identity.sessionId)
  } catch (error) {
    return { stopped: false, reason: error instanceof Error ? error.message : String(error) }
  }
  releaseStructuredWorkerSession(dispatchId, runtime)
  const after = observeStructuredWorker(identity)
  return after.status === 'live'
    ? { stopped: false, reason: 'The structured session is still attached after close.' }
    : { stopped: true }
}

/** The structured half of `worker-read`, or null when a PTY worker owns the dispatch. */
export function readStructuredWorkerOutput(args: {
  db: OrchestrationDb
  dispatchId: string
  workerState: string
  source?: 'auto' | 'transcript' | 'terminal'
  cursor?: string | number
  limit?: number
}): OrchestrationWorkerReadTranscriptResult | null {
  const identity = resolveStructuredWorkerForDispatch(args.db, args.dispatchId)
  if (!identity) {
    return null
  }
  if (args.source === 'terminal') {
    throw new OrchestrationError(
      'archive_unavailable',
      `Worker Dispatch ${args.dispatchId} is a structured chat session; it has no terminal output.`
    )
  }
  return readStructuredWorkerJournal({
    identity,
    dispatchId: args.dispatchId,
    workerState: args.workerState,
    agent: identity.agent ?? 'claude',
    ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    ...(args.limit === undefined ? {} : { limit: args.limit })
  })
}

/** Journal page in the shape `worker-read --source transcript` already serves. */
export function readStructuredWorkerJournal(args: {
  identity: StructuredWorkerIdentity
  dispatchId: string
  workerState: string
  agent: AgentType
  cursor?: string | number
  limit?: number
}): OrchestrationWorkerReadTranscriptResult {
  const host = getStructuredAgentSessionHost()
  const page = host ? tryReadJournalPage(host, args.identity.sessionId) : null
  if (!page) {
    throw new OrchestrationError(
      'transcript_required',
      `The structured session for Dispatch ${args.dispatchId} is not attached; its journal cannot be read.`
    )
  }
  const sourceIdentity = createWorkerOutputSourceIdentity([
    'structured-journal',
    args.identity.processIncarnation,
    args.identity.paneKey
  ])
  const cursor = decodeWorkerOutputCursor(args.cursor, args.dispatchId)
  if (cursor && (cursor.source !== 'transcript' || cursor.sourceIdentity !== sourceIdentity)) {
    throw new OrchestrationError(
      'source_changed',
      'The worker output source changed. Start a fresh worker-read without the old cursor.'
    )
  }
  const bounded = boundWorkerTranscriptMessages(projectStructuredItemsToNativeChat(page.items))
  return pageMessages({
    messages: bounded.messages,
    warnings: [
      ...bounded.warnings,
      ...(page.hasOlder ? ['Older journal items were omitted from this page.'] : [])
    ],
    limited: bounded.limited || page.hasOlder,
    dispatchId: args.dispatchId,
    workerState: args.workerState,
    agent: args.agent,
    sourceIdentity,
    start: cursor?.position ?? 0,
    limit: args.limit,
    archived: false
  })
}

/** Freezes the journal before the session is closed, so a released worker is still readable. */
export function captureStructuredWorkerArchive(
  identity: StructuredWorkerIdentity,
  agent: AgentType
): WorkerStructuredJournalArchive {
  const host = getStructuredAgentSessionHost()
  const page = host ? tryReadJournalPage(host, identity.sessionId) : null
  if (!page) {
    throw new OrchestrationError(
      'archive_failed',
      'Output could not be preserved for this structured worker; the session was retained.'
    )
  }
  return buildStructuredJournalArchive({
    agent,
    processIncarnation: identity.processIncarnation,
    items: page.items,
    hasOlder: page.hasOlder
  })
}

export function readArchivedStructuredJournal(args: {
  dispatchId: string
  workerState: string
  resourceId: string
  createdAt: string
  archive: WorkerStructuredJournalArchive
  cursor?: string | number
  limit?: number
}): OrchestrationWorkerReadTranscriptResult {
  const sourceIdentity = createWorkerOutputSourceIdentity([
    'released-structured-journal',
    args.resourceId,
    args.archive.processIncarnation,
    args.createdAt
  ])
  const cursor = decodeWorkerOutputCursor(args.cursor, args.dispatchId)
  if (cursor && (cursor.source !== 'transcript' || cursor.sourceIdentity !== sourceIdentity)) {
    throw new OrchestrationError(
      'source_changed',
      'The worker output source changed. Start a fresh worker-read without the old cursor.'
    )
  }
  return pageMessages({
    messages: args.archive.messages,
    warnings: args.archive.warnings,
    limited: args.archive.limited,
    dispatchId: args.dispatchId,
    workerState: args.workerState,
    agent: args.archive.agent,
    sourceIdentity,
    start: cursor?.position ?? 0,
    limit: args.limit,
    archived: true
  })
}

function pageMessages(input: {
  messages: readonly NativeChatMessage[]
  warnings: string[]
  limited: boolean
  dispatchId: string
  workerState: string
  agent: AgentType
  sourceIdentity: string
  start: number
  limit: number | undefined
  archived: boolean
}): OrchestrationWorkerReadTranscriptResult {
  const start = Math.min(input.start, input.messages.length)
  const end = Math.min(start + clampWorkerTranscriptLimit(input.limit), input.messages.length)
  const nextCursor = encodeWorkerOutputCursor(
    input.dispatchId,
    'transcript',
    input.sourceIdentity,
    end
  )
  return {
    dispatchId: input.dispatchId,
    source: 'transcript',
    sourceIdentity: input.sourceIdentity,
    provider: input.agent,
    transcript: {
      messages: input.messages.slice(start, end),
      nextCursor,
      limited: input.limited || end < input.messages.length,
      returnedMessageCount: end - start
    },
    cursor: nextCursor,
    status: {
      worker: input.workerState,
      terminal: input.archived ? 'exited' : 'running'
    },
    fallbackReason: null,
    warnings: input.warnings,
    ...(input.archived ? { archived: true } : {})
  }
}

function tryReadJournalPage(
  host: NonNullable<ReturnType<typeof getStructuredAgentSessionHost>>,
  sessionId: string
): { items: readonly AgentJournalRenderItem[]; hasOlder: boolean } | null {
  try {
    const result = host.history({ sessionId, direction: 'tail', limit: JOURNAL_PAGE_LIMIT })
    return { items: result.page.items, hasOlder: result.page.hasOlder }
  } catch {
    return null
  }
}
