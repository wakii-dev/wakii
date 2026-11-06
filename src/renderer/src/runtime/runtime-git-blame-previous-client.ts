import type { GitBlameResult } from '../../../shared/git-blame-types'
import { getRuntimeGitBlame } from './runtime-git-blame-client'
import type { RuntimeGitContext } from './runtime-git-client-context'

/**
 * Blame-previous (GitLens-parity SF-1): blame a file at a parent revision via
 * the additive `revision` option. Older hosts (SSH relays, remote runtimes)
 * silently drop the unknown param and answer with HEAD blame — the `revision`
 * echo contract catches that: a missing or mismatched echo marks the host
 * revision-unsupported (in-memory, never persisted) and fails the call, so a
 * HEAD result can never be rendered as if it were the old revision.
 */
export class GitBlameRevisionUnsupportedError extends Error {
  constructor() {
    super('Blame at a past revision is unavailable on this host')
    this.name = 'GitBlameRevisionUnsupportedError'
  }
}

// Why in-memory only: a host upgrade restarts the session anyway; persisted
// state would only ever go stale.
const revisionDisabledHostKeys = new Set<string>()

export function resetGitBlameRevisionDisabledHosts(): void {
  revisionDisabledHostKeys.clear()
}

function hostKeyFor(context: RuntimeGitContext): string {
  if (context.target.kind === 'environment') {
    return `runtime:${context.target.environmentId}`
  }
  return context.connectionId ? `ssh:${context.connectionId}` : 'local'
}

export function isGitBlamePreviousSupportedForHost(context: RuntimeGitContext): boolean {
  return !revisionDisabledHostKeys.has(hostKeyFor(context))
}

export async function getRuntimeGitBlameAtRevision(
  context: RuntimeGitContext,
  filePath: string,
  revision: string
): Promise<GitBlameResult> {
  const hostKey = hostKeyFor(context)
  if (revisionDisabledHostKeys.has(hostKey)) {
    throw new GitBlameRevisionUnsupportedError()
  }
  const result = await getRuntimeGitBlame({ ...context, blameRevision: revision }, filePath)
  if (result.revision !== revision) {
    // Echo absent or mismatched: the host ignored the requested revision and
    // any lines it returned are HEAD lines, not the revision we asked for.
    revisionDisabledHostKeys.add(hostKey)
    throw new GitBlameRevisionUnsupportedError()
  }
  return result
}
