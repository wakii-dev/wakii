import type { GitBlameLine } from '../../../../shared/git-blame-types'
import { formatRelativeBlameDate } from './git-blame-annotation-model'
import type { GitBlameStrings } from './git-blame-strings'
import type { GitBlameCommitDiffStat } from './git-blame-commit-diff-stat-client'

export type GitBlameHoverCardModel = {
  hash: string
  abbreviatedHash: string
  author: string
  relativeDate: string
  summary: string
  /** Full commit message when a body was fetched, otherwise the summary. */
  fullMessage: string
  committed: boolean
  previousHash?: string
  /** Top-right +/− stat once the commit diff was fetched; absent until then. */
  stat?: GitBlameCommitDiffStat
}

/**
 * The blame-previous walk target for a line: the porcelain `previous` parent
 * of a committed line, null for root commits and uncommitted lines. This is
 * the first consumer of GitBlameLine.previousHash, which parsed unused until
 * GitLens-parity SF-1.
 */
export function getBlamePreviousTarget(
  line: Pick<GitBlameLine, 'committed' | 'previousHash'>
): string | null {
  return line.committed && line.previousHash ? line.previousHash : null
}

export function buildBlameHoverCard(
  line: GitBlameLine,
  options: {
    strings: GitBlameStrings
    messageBody?: string
    stat?: GitBlameCommitDiffStat
    now?: number
  }
): GitBlameHoverCardModel {
  const messageBody = options.messageBody?.trim()
  return {
    hash: line.hash,
    abbreviatedHash: line.abbreviatedHash,
    author: line.committed ? line.author : options.strings.you,
    relativeDate: formatRelativeBlameDate(line.authorTime, options.now ?? Date.now()),
    summary: line.summary,
    fullMessage: messageBody || line.summary,
    committed: line.committed,
    ...(line.previousHash !== undefined ? { previousHash: line.previousHash } : {}),
    ...(options.stat ? { stat: options.stat } : {})
  }
}

/**
 * Body text under the headline: the full message minus the subject already
 * shown as the headline. Null when there is nothing beyond the summary —
 * the card still renders, the body section just stays hidden.
 */
export function gitBlameCardBodyText(fullMessage: string, summary: string): string | null {
  const withoutSubject = fullMessage.startsWith(summary)
    ? fullMessage.slice(summary.length).replace(/^\s+/, '')
    : fullMessage
  const trimmed = withoutSubject.trim()
  return trimmed ? withoutSubject : null
}
