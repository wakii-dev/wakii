import {
  isTerminalInputTooLargeWithYield,
  TERMINAL_INPUT_TOO_LARGE_ERROR
} from '../../shared/terminal-input'
import {
  buildAgentPromptPasteBytes,
  sanitizeAgentPromptText
} from '../../shared/agent-prompt-injection'
import { isTuiAgent } from '../../shared/tui-agent-config'

export function buildTerminalSendPayload(action: {
  text?: string
  enter?: boolean
  interrupt?: boolean
}): string | null {
  let payload = ''
  if (typeof action.text === 'string' && action.text.length > 0) {
    payload += action.text
  }
  if (action.enter) {
    payload += '\r'
  }
  if (action.interrupt) {
    payload += '\x03'
  }
  return payload.length > 0 ? payload : null
}

export function maybeWrapTerminalSendTextForTuiAgent(
  action: { text?: string; enter?: boolean; interrupt?: boolean },
  agent: unknown
): { text?: string; enter?: boolean; interrupt?: boolean } {
  if (!action.text || !isTuiAgent(agent)) {
    return action
  }
  // Why: strip ONE trailing terminator before the multiline probe so a
  // submit-terminated single line stays raw (mirror buildStartupCommandSubmission);
  // the terminator itself is preserved verbatim in the output.
  const probe = action.text.replace(/(\r\n|\r|\n)$/, '')
  if (!/[\n\r]/.test(probe)) {
    // Why: raw fast path still keeps the agent-pane invariant — inert ESC, no markers.
    return { ...action, text: sanitizeAgentPromptText(action.text) }
  }
  // Why: a TUI agent submits on every newline, so a raw multi-line send reaches
  // it as fragmented prompts. Bracketed paste keeps the text atomic until the
  // caller's own Enter suffix — same contract as the agent-prompt path.
  return { ...action, text: buildAgentPromptPasteBytes(action.text) }
}

export async function assertTerminalInputWithinLimitWithYield(
  text: string | undefined
): Promise<void> {
  if (text && (await isTerminalInputTooLargeWithYield(text))) {
    throw new Error(TERMINAL_INPUT_TOO_LARGE_ERROR)
  }
}
