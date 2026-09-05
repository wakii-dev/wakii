/**
 * Delivery decisions for an orchestration mail pointer aimed at a host-owned
 * structured ("native") agent session.
 *
 * A structured session has no PTY the pointer can be typed into, so the nudge
 * travels as a session turn instead of as bytes. Everything here is pure: the
 * caller supplies the refusal, the attachment fact and the journal, and gets
 * back a decision it can act on. Orchestration's database stays the source of
 * truth — no decision here ever consumes mail, it only says whether the nudge
 * may be attempted now.
 */

import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import type { AgentSessionPtyWriteRefusal } from '../../../shared/agent-session-pty-write-admission'
import {
  activeStructuredAgentSessionTurnId,
  projectStructuredAgentSessionStatus
} from '../../../shared/structured-agent-session-projection'

/** Every reason retains the pointer; none of them consume mail. */
export type StructuredPointerRetainReason =
  | 'owner-not-settled-native'
  | 'session-not-attached'
  | 'turn-unsettled'
  | 'awaiting-human'
  | 'dispatch-rejected'
  | 'dispatch-unknown'

export type StructuredPointerDecision =
  | { deliver: true }
  | { deliver: false; retain: StructuredPointerRetainReason }

/** The dispatch states both provider adapters converge on. */
export type StructuredDispatchState = 'accepted' | 'rejected' | 'unknown'

/**
 * A refusal names an owner this pointer may be redirected to only when that
 * owner is native AND settled. A recovering or mid-handoff lease also reports
 * `native`, but it may become a TUI again, so redirecting there races the
 * takeover.
 */
export function isSettledNativeOwner(refusal: AgentSessionPtyWriteRefusal): boolean {
  return (
    refusal.ownerRuntimeKind === 'native' &&
    refusal.code === 'agent_session_conflict' &&
    refusal.handoffStage === null
  )
}

function containsTurnLifecycle(items: readonly AgentJournalRenderItem[]): boolean {
  return items.some((item) => item.body?.kind === 'status' && Boolean(item.body.turnLifecycle))
}

/**
 * Whether the session is between turns.
 *
 * Reuses the projection the chat view already reads, so the delivery gate and
 * the visible "working" state can never disagree. A settled turn is tombstoned
 * rather than rewritten to `completed`, so a healthy finished turn leaves
 * nothing for the backward scan to find.
 *
 * `pageMayHaveMore` guards the one way a tail page lies: a running turn's
 * lifecycle item can be pushed off the end by a burst of tool-call items, and a
 * page carrying no lifecycle item at all is then indistinguishable from an idle
 * session. That reads as busy, because delivering mid-turn is the failure this
 * gate exists to prevent.
 */
export function structuredSessionIsBetweenTurns(
  items: readonly AgentJournalRenderItem[],
  pageMayHaveMore = false
): boolean {
  if (activeStructuredAgentSessionTurnId(items) !== null) {
    return false
  }
  return !pageMayHaveMore || containsTurnLifecycle(items)
}

/**
 * Decide whether the nudge may be sent right now.
 *
 * Mid-turn delivery is refused for both providers rather than delegated to
 * them: Codex answers a mid-turn `turn/start` with `turn already running`, and
 * Claude accepts the frame but cannot acknowledge it inside the dispatch ack
 * window, settling `unknown` while the message is really queued. Waiting for
 * the turn to settle is the one contract that holds for both, and it preserves
 * orchestration's existing idle-edge-only delivery policy.
 */
export function decideStructuredPointerDelivery(input: {
  refusal: AgentSessionPtyWriteRefusal
  sessionAttached: boolean
  journalItems: readonly AgentJournalRenderItem[]
  /** True when the history page was filled, so older items may be unread. */
  journalPageMayHaveMore?: boolean
}): StructuredPointerDecision {
  if (!isSettledNativeOwner(input.refusal)) {
    return { deliver: false, retain: 'owner-not-settled-native' }
  }
  return decideStructuredSessionPointerDelivery(input)
}

/**
 * The same decision for a session that was BORN structured.
 *
 * There is no PTY write to be refused, so there is no refusal to read an owner off — the caller
 * already knows the session is host-owned because it created it. Everything after that gate is
 * identical, which is why the adopted-TUI path above delegates here rather than duplicating it.
 */
export function decideStructuredSessionPointerDelivery(input: {
  sessionAttached: boolean
  journalItems: readonly AgentJournalRenderItem[]
  journalPageMayHaveMore?: boolean
}): StructuredPointerDecision {
  if (!input.sessionAttached) {
    return { deliver: false, retain: 'session-not-attached' }
  }
  // A pending approval or question has no running turn, so the between-turns test alone reads it
  // as idle. Sending there queues a nudge behind a prompt only a human can clear.
  if (projectStructuredAgentSessionStatus(input.journalItems) === 'attention') {
    return { deliver: false, retain: 'awaiting-human' }
  }
  if (!structuredSessionIsBetweenTurns(input.journalItems, input.journalPageMayHaveMore)) {
    return { deliver: false, retain: 'turn-unsettled' }
  }
  return { deliver: true }
}

/**
 * Only an accepted dispatch may mark mail delivered.
 *
 * `unknown` covers a dead provider child and a slow acknowledgement alike — the
 * adapters cannot tell them apart — so it must retain. Treating it as delivered
 * would drop mail whenever a child died mid-send.
 */
export function structuredDispatchDelivered(state: StructuredDispatchState): boolean {
  return state === 'accepted'
}

export function retainReasonForDispatch(
  state: Exclude<StructuredDispatchState, 'accepted'>
): StructuredPointerRetainReason {
  return state === 'rejected' ? 'dispatch-rejected' : 'dispatch-unknown'
}

/**
 * Whether a retained pointer should be retried on its own, or only when the
 * session's next turn settles.
 *
 * `unknown` may mean the nudge is already sitting in the provider's input
 * queue, so an immediate retry can stack duplicate nudges that each become a
 * turn later. Those wait for a settle edge; the rest are cheap to re-attempt.
 */
export function retainWaitsForTurnSettle(reason: StructuredPointerRetainReason): boolean {
  return reason === 'turn-unsettled' || reason === 'dispatch-unknown' || reason === 'awaiting-human'
}
