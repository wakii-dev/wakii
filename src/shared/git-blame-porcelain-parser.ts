import type { GitBlameLine, GitBlameOptions, GitBlameResult } from './git-blame-types'

export type { GitBlameLine, GitBlameOptions, GitBlameResult } from './git-blame-types'

/** Display form of the all-zero sha `git blame --porcelain` emits for uncommitted lines. */
export const GIT_BLAME_UNCOMMITTED_HASH = '0000000'

export function isGitBlameUncommittedHash(hash: string): boolean {
  return /^0+$/.test(hash)
}

type PorcelainCommitMeta = {
  author: string
  authorTime: number
  summary: string
  previousHash?: string
}

// `^` marks a boundary commit (history cut by a revision limit or rename follow).
const COMMIT_HEADER = /^(\^?)([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: (\d+))?$/

export function parseGitBlamePorcelain(stdout: string, filePath: string): GitBlameResult {
  const lines: GitBlameLine[] = []
  const commitsBySha = new Map<string, PorcelainCommitMeta>()
  const rawLines = stdout.split('\n')

  let index = 0
  while (index < rawLines.length) {
    const raw = rawLines[index]
    if (!raw || raw.startsWith('\t')) {
      index += 1
      continue
    }

    const header = COMMIT_HEADER.exec(raw)
    if (!header) {
      // Unknown line shapes are skipped rather than thrown: a foreign git
      // version must degrade to "no annotation", never to a renderer crash.
      index += 1
      continue
    }
    const [, , sha, , finalLineGroup, groupSize] = header
    index += 1

    let meta = commitsBySha.get(sha)
    if (!meta) {
      const parsed: PorcelainCommitMeta = { author: '', authorTime: 0, summary: '' }
      while (index < rawLines.length) {
        const metaLine = rawLines[index]
        if (!metaLine || metaLine.startsWith('\t') || COMMIT_HEADER.test(metaLine)) {
          break
        }
        index += 1
        if (metaLine.startsWith('author ')) {
          parsed.author = metaLine.slice('author '.length)
        } else if (metaLine.startsWith('author-time ')) {
          parsed.authorTime = Number.parseInt(metaLine.slice('author-time '.length), 10) * 1000
        } else if (metaLine.startsWith('summary ')) {
          parsed.summary = metaLine.slice('summary '.length)
        } else if (metaLine.startsWith('previous ')) {
          parsed.previousHash = metaLine.slice('previous '.length).split(' ')[0]
        }
        // Other metadata keys (committer*, filename, boundary) are not displayed.
      }
      meta = parsed
      commitsBySha.set(sha, meta)
    }

    const startLine = Number.parseInt(finalLineGroup, 10)
    const lineCount = groupSize ? Number.parseInt(groupSize, 10) : 1
    const committed = !isGitBlameUncommittedHash(sha)
    for (let offset = 0; offset < lineCount; offset += 1) {
      lines.push({
        lineNumber: startLine + offset,
        hash: sha,
        abbreviatedHash: committed ? sha.slice(0, GIT_BLAME_UNCOMMITTED_HASH.length) : GIT_BLAME_UNCOMMITTED_HASH,
        author: meta.author,
        authorTime: meta.authorTime,
        summary: meta.summary,
        committed,
        ...(meta.previousHash ? { previousHash: meta.previousHash } : {})
      })
    }
  }

  return { filePath, lines }
}

export type GitBlameExecutor = (
  args: string[],
  cwd: string
) => Promise<{ stdout: string; stderr?: string }>

/**
 * Run `git blame --porcelain` through an injected executor and parse the log.
 * Executor failures (empty repo has no HEAD, permission, buffer cap) propagate
 * to the caller — the hook layer decides silent-skip vs feature-disable.
 */
export async function loadGitBlameFromExecutor(
  git: GitBlameExecutor,
  cwd: string,
  options: GitBlameOptions
): Promise<GitBlameResult> {
  // Why `--end-of-options` + `--`: a hostile path must never parse as a git flag.
  const { stdout } = await git(
    ['blame', '--porcelain', '--end-of-options', '--', options.filePath],
    cwd
  )
  return parseGitBlamePorcelain(stdout, options.filePath)
}
