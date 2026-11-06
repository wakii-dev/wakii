import {
  resolveLocalWorktreePath,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client-context'

const GIT_BLAME_MESSAGE_CACHE_MAX_ENTRIES = 200

/**
 * Bounded per-sha full-message cache for the blame hover card. A sha is
 * immutable content, so entries never invalidate; fetch happens only when a
 * card opens without a body and succeeds at most once per sha.
 */
const messageBySha = new Map<string, string>()

function remember(sha: string, message: string): void {
  messageBySha.delete(sha)
  messageBySha.set(sha, message)
  if (messageBySha.size > GIT_BLAME_MESSAGE_CACHE_MAX_ENTRIES) {
    const oldest = messageBySha.keys().next().value
    if (oldest !== undefined) {
      messageBySha.delete(oldest)
    }
  }
}

export function clearGitBlameCommitMessageCache(): void {
  messageBySha.clear()
}

/**
 * Lazily fetch the full commit message for a hovered sha — at most one git
 * read per sha, ever. Remote runtime environments have no git-read IPC
 * surface (desktop-only per the epic's wire rules), so they degrade to
 * headline-only cards by returning null; ordinary git failures also degrade
 * instead of erroring — the headline is always enough.
 */
export async function fetchGitBlameCommitMessage(
  context: RuntimeGitContext,
  sha: string
): Promise<string | null> {
  const cached = messageBySha.get(sha)
  if (cached !== undefined) {
    return cached
  }
  if (context.target.kind !== 'local' || !context.worktreeId) {
    return null
  }
  const commitMessageBody = window.api.git.commitMessageBody
  if (typeof commitMessageBody !== 'function') {
    return null
  }
  try {
    const message = await commitMessageBody({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      sha
    })
    const trimmed = message.trim()
    if (!trimmed) {
      return null
    }
    remember(sha, trimmed)
    return trimmed
  } catch {
    return null
  }
}
