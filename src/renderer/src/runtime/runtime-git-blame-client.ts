import type { GitBlameResult } from '../../../shared/git-blame-types'
import { GIT_BLAME_UNSUPPORTED_HOST_MARKER } from '../../../shared/git-blame-types'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

/**
 * Silent signal for "this host cannot serve blame" — the hook renders no
 * annotation and never surfaces an error. Distinct from git failures, which
 * propagate so the hook can skip per-file while the feature stays alive.
 */
export class GitBlameHostUnsupportedError extends Error {
  constructor() {
    super('Inline blame is unavailable on this host')
    this.name = 'GitBlameHostUnsupportedError'
  }
}

// Why in-memory only: a host upgrade restarts the session anyway, so persisted
// disable state would only ever go stale.
const disabledHostKeys = new Set<string>()

export function resetGitBlameDisabledHosts(): void {
  disabledHostKeys.clear()
}

function hostKeyFor(context: RuntimeGitContext): string | null {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'environment') {
    return `runtime:${target.environmentId}`
  }
  // Local main process always has git.blame; only a remote SSH relay can predate it.
  return context.connectionId ? `ssh:${context.connectionId}` : null
}

export function isGitBlameSupportedForHost(context: RuntimeGitContext): boolean {
  const key = hostKeyFor(context)
  return key === null || !disabledHostKeys.has(key)
}

function isHostUnsupportedError(error: unknown): boolean {
  if (error instanceof RuntimeRpcCallError) {
    // String code from the runtime dispatcher — NOT the relay path's -32601.
    return error.code === 'method_not_found'
  }
  return (
    error instanceof Error &&
    error.message.includes(GIT_BLAME_UNSUPPORTED_HOST_MARKER)
  )
}

export async function getRuntimeGitBlame(
  context: RuntimeGitContext,
  filePath: string
): Promise<GitBlameResult> {
  const hostKey = hostKeyFor(context)
  if (hostKey !== null && disabledHostKeys.has(hostKey)) {
    throw new GitBlameHostUnsupportedError()
  }
  const target = getActiveRuntimeTarget(context.settings)
  try {
    if (target.kind === 'local' || !context.worktreeId) {
      const blame = window.api.git.blame
      if (typeof blame !== 'function') {
        throw new GitBlameHostUnsupportedError()
      }
      return await blame({
        worktreePath: resolveLocalWorktreePath(context),
        connectionId: context.connectionId,
        filePath
      })
    }
    return await callRuntimeRpc<GitBlameResult>(
      target,
      'git.blame',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), filePath },
      { timeoutMs: 15_000 }
    )
  } catch (error) {
    if (error instanceof GitBlameHostUnsupportedError) {
      throw error
    }
    if (isHostUnsupportedError(error)) {
      if (hostKey !== null) {
        disabledHostKeys.add(hostKey)
      }
      throw new GitBlameHostUnsupportedError()
    }
    throw error
  }
}
