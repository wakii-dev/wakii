/**
 * Freezing and re-reading a structured worker's journal.
 *
 * The terminal path archives a redacted PTY tail; there is no PTY here, so the durable evidence is
 * the journal projected into the same message shape `worker-read --source transcript` already
 * serves. It gets its own archive kind because its identity is a session, not a transcript file on
 * disk, and because the read side must be able to say which of the three it is holding.
 */

import type { AgentType, NativeChatMessage } from '../../../shared/native-chat-types'
import { projectStructuredItemsToNativeChat } from '../../../shared/structured-agent-session-projection'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { boundWorkerTranscriptMessages } from './worker-transcript-payload'

// Same durable bound the terminal archive uses; a session journal can grow without limit.
const STRUCTURED_ARCHIVE_MAX_CHARS = 262_144

export type WorkerStructuredJournalArchive = {
  version: 1
  agent: AgentType
  processIncarnation: string
  messages: NativeChatMessage[]
  limited: boolean
  warnings: string[]
}

export function buildStructuredJournalArchive(input: {
  agent: AgentType
  processIncarnation: string
  items: readonly AgentJournalRenderItem[]
  hasOlder: boolean
}): WorkerStructuredJournalArchive {
  const projected = projectStructuredItemsToNativeChat(input.items)
  // Redacts dispatch capabilities and clips oversized blocks, exactly as the transcript path does.
  const bounded = boundWorkerTranscriptMessages(projected)
  const capped = capArchiveMessages(bounded.messages)
  const warnings = [...bounded.warnings]
  if (input.hasOlder) {
    warnings.push('Older journal items were omitted from the bounded archive.')
  }
  if (capped.truncated) {
    warnings.push('The oldest archived journal messages were dropped to fit the size bound.')
  }
  return {
    version: 1,
    agent: input.agent,
    processIncarnation: input.processIncarnation,
    messages: capped.messages,
    limited: bounded.limited || input.hasOlder || capped.truncated,
    warnings
  }
}

/** Newest-first accumulation, reversed once: the tail is the evidence that matters. */
export function capArchiveMessages(messages: readonly NativeChatMessage[]): {
  messages: NativeChatMessage[]
  truncated: boolean
} {
  const keptReversed: NativeChatMessage[] = []
  let budget = STRUCTURED_ARCHIVE_MAX_CHARS
  let truncated = false
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const cost = JSON.stringify(messages[index]).length
    if (cost > budget) {
      truncated = true
      break
    }
    keptReversed.push(messages[index]!)
    budget -= cost
  }
  keptReversed.reverse()
  return { messages: keptReversed, truncated }
}
