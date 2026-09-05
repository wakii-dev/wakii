/**
 * The structured-session half of the structured pointer lane.
 *
 * Keeps every `getStructuredAgentSessionHost()` call in one place so the delivery policy above it
 * stays pure and testable. Nothing here decides whether to deliver; it only performs the read and
 * the send and reports what the host said.
 */

import { AGENT_SESSION_NOT_ATTACHED } from '../../native-chat/agent-session-wire/structured-agent-session-mutation-admission'
import { getStructuredAgentSessionHost } from '../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { StructuredMailboxPointerHost } from './structured-mailbox-pointer-delivery'

/** Per-dispatch so one worker's nudges cannot exhaust the shared runtime operation-ledger budget. */
export function structuredPointerCallerKey(dispatchId: string): string {
  return `trusted-local:orchestration:${dispatchId}`
}

export function createStructuredMailboxPointerHost(): StructuredMailboxPointerHost {
  return {
    readJournalTail(sessionId, limit) {
      const host = getStructuredAgentSessionHost()
      if (!host) {
        return null
      }
      try {
        const result = host.history({ sessionId, direction: 'tail', limit })
        return { items: result.page.items, hasOlder: result.page.hasOlder }
      } catch (error) {
        // Not attached is a retain reason, not a failure; anything else is still unreadable.
        if ((error as Error)?.message !== AGENT_SESSION_NOT_ATTACHED.code) {
          console.warn('[orchestration] structured journal tail unreadable', sessionId, error)
        }
        return null
      }
    },

    currentFence(sessionId) {
      return (
        getStructuredAgentSessionHost()?.deps.store.getRecord(sessionId)?.lease.runtimeFence ?? null
      )
    },

    async send(input) {
      const host = getStructuredAgentSessionHost()
      if (!host) {
        return { kind: 'unattached' }
      }
      const result = await host.send(
        { callerKey: structuredPointerCallerKey(input.dispatchId) },
        {
          envelope: {
            sessionId: input.sessionId,
            clientOperationId: input.operationId,
            expectedRuntimeFence: input.expectedRuntimeFence,
            payloadFingerprint: input.payloadFingerprint
          },
          body: input.body,
          // The recorded unknown is the only thing that unlocks a redispatch of the same id.
          retryUnknown: true
        }
      )
      if (!result.ok) {
        return result.refusal.code === AGENT_SESSION_NOT_ATTACHED.code
          ? { kind: 'unattached' }
          : { kind: 'sent', state: 'rejected' }
      }
      // `pending` is not yet an acknowledgement; only `accepted` may consume mail.
      const state = result.value.submission.dispatchState
      return {
        kind: 'sent',
        state: state === 'accepted' ? 'accepted' : state === 'rejected' ? 'rejected' : 'unknown'
      }
    }
  }
}
