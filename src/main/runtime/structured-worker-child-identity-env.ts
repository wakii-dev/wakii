/**
 * The orchestration identity a structured worker's own child needs to speak for itself.
 *
 * Without `ORCA_TERMINAL_HANDLE` the worker's Bash tool has nothing to pass as `--from`, and
 * `resolveOrchestrationTerminalHandle` falls back to a cwd lookup that returns whichever leaf in
 * the worktree comes first. Two attacks follow from that: a bare `check` reads and consumes a
 * SIBLING's dispatch mailbox, and a bare `send --type worker_done` can settle a sibling's
 * context-only dispatch, a tier that has no capability token to reject on.
 *
 * Deliberately NOT `ORCA_PANE_KEY`. Claude structured sessions run hooks, and a pane key in their
 * environment starts flowing into hook-emitted agent-status payloads and the hook-attestation,
 * agent-row and mobile-projection pipelines, every one of which assumes a pane key names a live
 * PTY leaf. It would also open `selectExactWorkerProviderSession`, which is fail-closed today
 * precisely because a structured session emits no hook agent status. The CLI needs none of it once
 * the handle is present.
 *
 * Empty for any session that is not a dispatched worker, so an ordinary chat session's child is
 * unchanged. The handle is read from the registry at spawn time, so an in-host recovery respawn
 * re-bakes the SAME handle rather than a stale or fresh one.
 */

import { structuredWorkerIdentities } from './structured-worker-identity'

export function structuredWorkerChildIdentityEnv(sessionId: string): Record<string, string> {
  const identity = structuredWorkerIdentities.getBySessionId(sessionId)
  if (!identity) {
    return {}
  }
  return {
    ORCA_TERMINAL_HANDLE: identity.handle,
    // Structured sessions only exist local and outside WSL, so the scoped `orca-ide` launcher
    // never applies to one.
    ORCA_CLI_COMMAND: 'orca'
  }
}
