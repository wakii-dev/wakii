import type { CodexStructuredLaunch } from './codex-structured-session-state'
import { CODEX_SPAWN_TOKEN_ENV } from './codex-structured-owner-identity'
import { structuredWorkerChildIdentityEnv } from '../runtime/structured-worker-child-identity-env'

export function buildCodexStructuredChildEnvironment(
  launch: CodexStructuredLaunch,
  spawnToken: string,
  sessionId: string
): Record<string, string> {
  return {
    ...launch.env,
    ...(launch.codexHome ? { CODEX_HOME: launch.codexHome } : {}),
    // Only a dispatched structured worker gets these; an ordinary chat session gets none.
    ...structuredWorkerChildIdentityEnv(sessionId),
    [CODEX_SPAWN_TOKEN_ENV]: spawnToken
  }
}
