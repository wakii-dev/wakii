/**
 * The agent-session operation id one structured worker mailbox's pointer send runs under.
 *
 * Orchestration's own `msg_<hex>` ids do not match the host's `^\d{13}-[0-9a-f]{32}$` shape and are
 * refused before the first send, so the id is minted here instead. It is durable and reused across
 * retries, because the id IS the send's idempotency key: a fresh id for the same nudge would land
 * as a second turn. It is re-minted only when the send is genuinely a different call — the batch
 * grew, the session changed — or when the host would reject it as too old to admit.
 */

import { randomBytes } from 'node:crypto'
import type { AgentJournalMessageItem } from '../../../shared/agent-session-journal-types'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session-mutation-envelope'
import { AGENT_SESSION_MAX_NEW_OPERATION_AGE_MS } from '../../../shared/agent-session-host-authority'
import type { OrchestrationDb } from './db'

export function mintAgentSessionOperationId(now: number): string {
  return `${String(now).padStart(13, '0')}-${randomBytes(16).toString('hex')}`
}

export function structuredPointerPayloadFingerprint(
  sessionId: string,
  body: AgentJournalMessageItem
): string {
  return computeAgentSessionPayloadFingerprint({
    method: 'agentSession.send',
    sessionId,
    fields: { body }
  })
}

export function resolveStructuredPointerOperation(args: {
  db: OrchestrationDb
  mailboxHandle: string
  sessionId: string
  body: AgentJournalMessageItem
  now?: number
}): { operationId: string; payloadFingerprint: string } {
  const now = args.now ?? Date.now()
  const payloadFingerprint = structuredPointerPayloadFingerprint(args.sessionId, args.body)
  const stored = args.db.getStructuredPointerOperation(args.mailboxHandle)
  if (
    stored &&
    stored.session_id === args.sessionId &&
    stored.body_fingerprint === payloadFingerprint &&
    now - stored.minted_at_ms < AGENT_SESSION_MAX_NEW_OPERATION_AGE_MS
  ) {
    return { operationId: stored.operation_id, payloadFingerprint }
  }
  const operationId = mintAgentSessionOperationId(now)
  args.db.putStructuredPointerOperation({
    mailbox_handle: args.mailboxHandle,
    session_id: args.sessionId,
    operation_id: operationId,
    body_fingerprint: payloadFingerprint,
    minted_at_ms: now
  })
  return { operationId, payloadFingerprint }
}
