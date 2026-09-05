/**
 * Creating a structured session for a worktree: resolve the create intent, attach it under the
 * host-computed fingerprint, then publish its tab.
 *
 * Extracted from `agentSession.create` so orchestration can start a native-born structured worker
 * on exactly the same path. `activate` is the only knob the two callers differ on: a chat the user
 * asked for takes the surface, a background dispatch must not steal it (the terminal worker path's
 * `surfaceOwner: false`).
 */

import { computeAgentSessionPayloadFingerprint } from '../../../../shared/agent-session-mutation-envelope'
import type {
  AgentSessionAttachResult,
  AgentSessionMutationEnvelope,
  AgentSessionMutationResult
} from '../../../../shared/agent-session-wire'
import type { AgentSessionAttachParams } from '../../../native-chat/agent-session-wire/structured-agent-session-attach'
import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredAgentSessionCaller } from '../../../native-chat/agent-session-wire/structured-agent-session-host-types'
import type { OrcaRuntimeService } from '../../orca-runtime'

export async function createStructuredAgentSessionForWorktree(args: {
  runtime: OrcaRuntimeService
  /** Installs the host lazily; called at the same point the RPC handler always installed it. */
  ensureHost: () => Promise<StructuredAgentSessionHost>
  caller: StructuredAgentSessionCaller
  envelope: AgentSessionMutationEnvelope
  worktree: string
  agent: 'claude' | 'codex'
  activate: boolean
}): Promise<AgentSessionMutationResult<AgentSessionAttachResult>> {
  const resolved = await args.runtime.resolveStructuredAgentSessionCreateIntent({
    envelope: args.envelope,
    worktree: args.worktree,
    agent: args.agent
  })
  const hostFingerprint = computeAgentSessionPayloadFingerprint({
    method: 'agentSession.attach',
    sessionId: args.envelope.sessionId,
    fields: {
      location: resolved.location,
      provider: resolved.provider,
      agent: resolved.agent,
      accountHome: resolved.accountHome,
      runtimeKind: resolved.runtimeKind,
      expectedRuntimeFence: null
    }
  })
  const host = await args.ensureHost()
  const { agent: _resolvedAgent, provider: _resolvedProvider, ...resolvedAttach } = resolved
  const attachParams: AgentSessionAttachParams = {
    ...resolvedAttach,
    provider: resolved.provider as 'claude' | 'codex',
    agent: resolved.agent as 'claude' | 'codex',
    envelope: { ...args.envelope, payloadFingerprint: hostFingerprint }
  }
  const result = await host.attach(args.caller, attachParams)
  if (!result.ok) {
    return result
  }
  try {
    await args.runtime.publishStructuredAgentSessionTab({
      workspaceId: resolved.location.workspaceId,
      sessionId: result.value.sessionId,
      agent: resolved.agent as 'claude' | 'codex',
      activate: args.activate
    })
  } catch (error) {
    console.warn('[agent-session] create committed before tab publication failed', error)
    return {
      ok: false,
      refusal: {
        code: 'agent_session_operation_unknown',
        message: 'The chat may have been created, but its tab could not be confirmed.'
      }
    }
  }
  return result
}
