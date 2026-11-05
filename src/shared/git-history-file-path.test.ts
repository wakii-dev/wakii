// Acceptance contract — GitLens-parity SF-3 (mindmap: file history của file).
// Intentionally RED until GitHistoryOptions gains filePath + follow and the
// loader honours them: `git log --follow -- <file>` scoped parsing, and an
// echo-verify field so a client can tell an old SSH/relay host (which ignores
// the param and silently returns repo-wide history) from a file-scoped one.
import { describe, expect, it, vi } from 'vitest'
import type { GitHistoryExecutor, GitHistoryResult } from './git-history'
import { fileHistoryEchoMatches, loadGitHistoryFromExecutor } from './git-history'

const HEAD_OID = 'a'.repeat(40)

function logRecord(hash: string, subject: string): string {
  // VS Code-compatible record shape: NUL-terminated, \n-separated fields.
  return `${[hash, 'Ada Lovelace', 'ada@example.com', '1700000000', '1700000000', HEAD_OID, '', '', subject].join('\n')}\0`
}

function createHistoryExecutor(logStdout: string): {
  executor: GitHistoryExecutor
  logCalls: string[][]
} {
  const logCalls: string[][] = []
  const executor = vi.fn(async (args: string[]) => {
    if (args[0] === 'rev-parse' && args.includes('HEAD^{commit}')) {
      return { stdout: `${HEAD_OID}\n` }
    }
    if (args[0] === 'symbolic-ref') {
      return { stdout: 'refs/heads/main\n' }
    }
    if (args[0] === 'for-each-ref') {
      return { stdout: '' }
    }
    if (args[0] === 'log') {
      logCalls.push(args)
      return { stdout: logStdout }
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`)
  })
  return { executor: executor as GitHistoryExecutor, logCalls }
}

const FILE_COMMITS = logRecord(HEAD_OID, 'fix: only this file\n\nbody line').concat(
  logRecord('d'.repeat(40), 'feat: earlier file change')
)

describe('git history scoped to a file (SF-3)', () => {
  it('scopes the log to the requested file and follows renames', async () => {
    const { executor, logCalls } = createHistoryExecutor(FILE_COMMITS)
    await loadGitHistoryFromExecutor(executor, '/repo', { filePath: 'src/app.ts' })

    expect(logCalls).toHaveLength(1)
    const args = logCalls[0]
    expect(args).toContain('--follow')
    const separatorIndex = args.indexOf('--')
    expect(separatorIndex).toBeGreaterThan(-1)
    expect(args.slice(separatorIndex + 1)).toEqual(['src/app.ts'])
  })

  it('keeps the file scope but drops --follow when follow is explicitly false', async () => {
    const { executor, logCalls } = createHistoryExecutor(FILE_COMMITS)
    await loadGitHistoryFromExecutor(executor, '/repo', {
      filePath: 'src/app.ts',
      follow: false
    })

    const args = logCalls[0]
    expect(args).not.toContain('--follow')
    const separatorIndex = args.indexOf('--')
    expect(args.slice(separatorIndex + 1)).toEqual(['src/app.ts'])
  })

  it('returns only the file history and echoes the requested filePath', async () => {
    const { executor } = createHistoryExecutor(FILE_COMMITS)
    const result = await loadGitHistoryFromExecutor(executor, '/repo', {
      filePath: 'src/app.ts'
    })

    expect(result.items.map((item) => item.subject)).toEqual([
      'fix: only this file',
      'feat: earlier file change'
    ])
    // Echo contract (mirrors the skip echo): a host that understood filePath
    // echoes it back. Old SSH/relay hosts omit it — the client detects
    // repo-wide leakage through fileHistoryEchoMatches below.
    expect(result.filePath).toBe('src/app.ts')
  })

  it('omits the filePath echo when no file was requested (repo-wide history)', async () => {
    const { executor } = createHistoryExecutor(FILE_COMMITS)
    const result = await loadGitHistoryFromExecutor(executor, '/repo')
    expect(result.filePath).toBeUndefined()
  })

  it('fileHistoryEchoMatches flags an old host that silently returned repo-wide history', () => {
    const scoped: GitHistoryResult = {
      items: [],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit: 50,
      filePath: 'src/app.ts'
    }
    const repoWideFromOldHost: GitHistoryResult = {
      items: [],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit: 50
    }
    expect(fileHistoryEchoMatches(scoped, 'src/app.ts')).toBe(true)
    expect(fileHistoryEchoMatches(repoWideFromOldHost, 'src/app.ts')).toBe(false)
    expect(fileHistoryEchoMatches(scoped, 'src/other.ts')).toBe(false)
  })
})
