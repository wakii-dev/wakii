import { getRuntimeGitCommitDiff } from '@/runtime/runtime-git-diff-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { buildGitBlameFileDiff } from './git-blame-commit-diff-hunks'

export type GitBlameCommitDiffStat = { added: number; removed: number }

const GIT_BLAME_DIFF_STAT_CACHE_MAX_ENTRIES = 200

/**
 * Bounded per-sha+file +/− stat cache for the blame hover card. A sha's diff
 * against its parent is immutable content, so entries never invalidate; the
 * fetch happens only while a card is open and at most once per sha+file.
 */
const statByShaAndPath = new Map<string, GitBlameCommitDiffStat>()

function cacheKey(sha: string, filePath: string): string {
  return `${sha}\u0000${filePath}`
}

function remember(key: string, stat: GitBlameCommitDiffStat): void {
  statByShaAndPath.delete(key)
  statByShaAndPath.set(key, stat)
  if (statByShaAndPath.size > GIT_BLAME_DIFF_STAT_CACHE_MAX_ENTRIES) {
    const oldest = statByShaAndPath.keys().next().value
    if (oldest !== undefined) {
      statByShaAndPath.delete(oldest)
    }
  }
}

export function clearGitBlameCommitDiffStatCache(): void {
  statByShaAndPath.clear()
}

/**
 * Lazily fetch the +/− stat of `sha` for the blamed file — the same
 * `git.commitDiff` source the commit-detail dialog renders, so the card stat
 * and the dialog diff agree by construction. Returns null (no stat shown)
 * while unavailable: binary/truncated diffs and ordinary git failures.
 */
export async function fetchGitBlameCommitDiffStat(
  context: RuntimeGitContext,
  sha: string,
  filePath: string,
  previousHash?: string
): Promise<GitBlameCommitDiffStat | null> {
  const key = cacheKey(sha, filePath)
  const cached = statByShaAndPath.get(key)
  if (cached !== undefined) {
    return cached
  }
  try {
    const diff = await getRuntimeGitCommitDiff(context, {
      commitOid: sha,
      parentOid: previousHash ?? null,
      filePath
    })
    const fileDiff = buildGitBlameFileDiff(diff)
    // A truncated diff never computed the counts — show nothing rather than a
    // wrong "+0 −0".
    if (!fileDiff.isText || fileDiff.truncated) {
      return null
    }
    const stat = { added: fileDiff.added, removed: fileDiff.removed }
    remember(key, stat)
    return stat
  } catch {
    return null
  }
}
