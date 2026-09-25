import type { GitBlameLine, GitBlameResult } from '../../../../shared/git-blame-types'
import type { GitBlameStrings } from './git-blame-strings'

export const GIT_BLAME_MAX_BYTES = 2 * 1024 * 1024
export const GIT_BLAME_MAX_LINES = 200_000

export type BlameSkipReason = 'file-too-large' | 'too-many-lines'

/**
 * Minimal surface of Monaco's MarkdownString the hover builder relies on.
 * appendText/appendCodeblock render content literally — the injection-safe
 * subset. appendMarkdown is deliberately absent from this type.
 */
export type HoverTextSink = {
  appendText(value: string): unknown
  appendCodeblock(value: string, language?: string): unknown
}

const RELATIVE_DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' }
] as const

const RELATIVE_PLAIN_DATE_WINDOW_DAYS = 60

export function formatRelativeBlameDate(authorTime: number, now: number): string {
  const totalSeconds = Math.max(0, (now - authorTime) / 1000)
  if (totalSeconds < 60) {
    return 'just now'
  }
  // English buckets only — the i18n layer owns localized labels elsewhere.
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const totalDays = totalSeconds / (24 * 60 * 60)
  if (totalDays > RELATIVE_PLAIN_DATE_WINDOW_DAYS) {
    return new Date(authorTime).toLocaleDateString()
  }
  let duration = totalSeconds
  for (const division of RELATIVE_DIVISIONS) {
    if (duration < division.amount) {
      return formatter.format(-Math.round(duration), division.unit)
    }
    duration /= division.amount
  }
  return new Date(authorTime).toLocaleDateString()
}

export function getBlameSkipReason(content: string): BlameSkipReason | null {
  if (content.length > GIT_BLAME_MAX_BYTES) {
    return 'file-too-large'
  }
  // Count without materializing a 200k-element array.
  let lines = 1
  let index = content.indexOf('\n')
  while (index !== -1) {
    lines += 1
    if (lines > GIT_BLAME_MAX_LINES) {
      return 'too-many-lines'
    }
    index = content.indexOf('\n', index + 1)
  }
  return null
}

const GIT_BLAME_CACHE_MAX_ENTRIES = 40

const KEY_SEPARATOR = String.fromCharCode(0)

/**
 * Bounded per-(worktree, file, HEAD, cleanRevision) blame cache. Retains the
 * previous HEAD entry so a revert back to an already-blamed commit is a cache
 * hit, and evicts oldest-first beyond the cap. A save invalidates: an entry
 * only serves the clean buffer revision it was fetched for.
 */
type GitBlameCacheEntry = { result: GitBlameResult; revision: string }

export class GitBlameCache {
  private readonly entries = new Map<string, GitBlameCacheEntry>()

  private static keyFor(worktreeId: string, filePath: string, headSha: string): string {
    // NUL separators: worktree paths and file paths can contain any printable
    // character, so printable separators would collide.
    return `${worktreeId}${KEY_SEPARATOR}${filePath}${KEY_SEPARATOR}${headSha}`
  }

  get(
    worktreeId: string,
    filePath: string,
    headSha: string,
    revision: string
  ): GitBlameResult | null {
    const entry = this.entries.get(GitBlameCache.keyFor(worktreeId, filePath, headSha))
    return entry && entry.revision === revision ? entry.result : null
  }

  set(
    worktreeId: string,
    filePath: string,
    headSha: string,
    result: GitBlameResult,
    revision: string
  ): void {
    const key = GitBlameCache.keyFor(worktreeId, filePath, headSha)
    this.entries.delete(key)
    this.entries.set(key, { result, revision })
    if (this.entries.size > GIT_BLAME_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) {
        this.entries.delete(oldest)
      }
    }
  }

  clearWorktree(worktreeId: string): void {
    const prefix = `${worktreeId}${KEY_SEPARATOR}`
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key)
      }
    }
  }

  clearFile(worktreeId: string, filePath: string): void {
    const filePrefix = `${worktreeId}${KEY_SEPARATOR}${filePath}${KEY_SEPARATOR}`
    for (const key of this.entries.keys()) {
      if (key.startsWith(filePrefix)) {
        this.entries.delete(key)
      }
    }
  }

  size(): number {
    return this.entries.size
  }
}

export function formatInlineBlameAnnotation(
  line: GitBlameLine,
  options: { isDirty: boolean; strings: GitBlameStrings; now?: number }
): string {
  const authorLabel = line.committed ? line.author : options.strings.you
  const base = line.committed
    ? `${authorLabel} · ${formatRelativeBlameDate(line.authorTime, options.now ?? Date.now())} · ${line.summary}`
    : authorLabel
  return options.isDirty ? `${base} · ${options.strings.stale}` : base
}

/**
 * Builds hover content through appendText/appendCodeblock only. All blame
 * metadata is attacker-controlled repo content; both sinks render literally,
 * so markdown/script injection is impossible by construction.
 */
export function appendGitBlameHover(
  sink: HoverTextSink,
  line: GitBlameLine,
  strings: GitBlameStrings,
  now?: number
): void {
  const authorLabel = line.committed ? line.author : strings.you
  sink.appendText(`${strings.hashLabel}: ${line.abbreviatedHash}\n\n`)
  sink.appendText(`${strings.authorLabel}: ${authorLabel}\n`)
  sink.appendText(
    `${strings.dateLabel}: ${formatRelativeBlameDate(line.authorTime, now ?? Date.now())}\n\n`
  )
  if (line.committed && line.summary) {
    sink.appendText(line.summary)
  }
}
