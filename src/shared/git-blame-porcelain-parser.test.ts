import { describe, expect, it } from 'vitest'
import {
  isGitBlameUncommittedHash,
  loadGitBlameFromExecutor,
  parseGitBlamePorcelain
} from './git-blame-porcelain-parser'
import type { GitBlameResult } from './git-blame-types'

const FULL_SHA = 'b1c2f3a4d5e6f7089a0b1c2d3e4f5061728394a5'
const PREV_SHA = '0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d'

function porcelainBlock(overrides: {
  sha?: string
  finalLine?: number
  numLines?: number
  author?: string
  summary?: string
  previous?: string
  content?: string[]
  boundary?: boolean
} = {}): string {
  const {
    sha = FULL_SHA,
    finalLine = 1,
    numLines = 1,
    author = 'A U Thor',
    summary = 'Fix the parsing bug',
    previous,
    content = ['const value = 1'],
    boundary = false
  } = overrides
  const header = `${boundary ? '^' : ''}${sha} ${finalLine} ${finalLine} ${numLines}`
  const lines = [
    header,
    `author ${author}`,
    'author-mail <author@example.com>',
    'author-time 1700000000',
    'author-tz +0700',
    'committer C O Mitter',
    'committer-mail <committer@example.com>',
    'committer-time 1700000000',
    'committer-tz +0700',
    `summary ${summary}`
  ]
  if (boundary) {
    lines.push('boundary')
  }
  if (previous) {
    lines.push(`previous ${previous} src/file.ts`)
  }
  lines.push(`filename src/file.ts`)
  for (const contentLine of content) {
    lines.push(`\t${contentLine}`)
  }
  return lines.join('\n')
}

describe('parseGitBlamePorcelain', () => {
  it('parses a regular committed line', () => {
    const result = parseGitBlamePorcelain(porcelainBlock(), 'src/file.ts')
    expect(result.filePath).toBe('src/file.ts')
    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]
    expect(line.hash).toBe(FULL_SHA)
    expect(line.abbreviatedHash).toBe(FULL_SHA.slice(0, 7))
    expect(line.author).toBe('A U Thor')
    expect(line.authorTime).toBe(1_700_000_000_000)
    expect(line.summary).toBe('Fix the parsing bug')
    expect(line.committed).toBe(true)
    expect(line.lineNumber).toBe(1)
    expect(line.previousHash).toBeUndefined()
  })

  it('marks the all-zero hash as uncommitted', () => {
    const result = parseGitBlamePorcelain(
      porcelainBlock({ sha: `${'0'.repeat(40)}`, summary: 'Uncommitted changes' }),
      'src/file.ts'
    )
    expect(result.lines[0].hash).toBe('0'.repeat(40))
    expect(result.lines[0].committed).toBe(false)
    expect(isGitBlameUncommittedHash(result.lines[0].hash)).toBe(true)
  })

  it('keeps the boundary previous hash and strips the boundary marker from the sha', () => {
    const result = parseGitBlamePorcelain(
      porcelainBlock({ boundary: true, previous: PREV_SHA }),
      'src/file.ts'
    )
    const line = result.lines[0]
    expect(line.hash).toBe(FULL_SHA)
    expect(line.hash.startsWith('^')).toBe(false)
    expect(line.previousHash).toBe(PREV_SHA)
  })

  it('keeps a paragraph-joined subject verbatim, including embedded separators', () => {
    const joinedSubject = 'First line of subject Second line of body paragraph'
    const result = parseGitBlamePorcelain(
      porcelainBlock({ summary: joinedSubject }),
      'src/file.ts'
    )
    expect(result.lines[0].summary).toBe(joinedSubject)
  })

  it('expands a group header across all covered final lines', () => {
    const result = parseGitBlamePorcelain(
      [
        porcelainBlock({ finalLine: 2, numLines: 3, content: ['a', 'b', 'c'] }),
        porcelainBlock({
          sha: PREV_SHA,
          finalLine: 5,
          numLines: 1,
          content: ['d'],
          summary: 'Later commit'
        })
      ].join('\n'),
      'src/file.ts'
    )
    expect(result.lines.map((line) => line.lineNumber)).toEqual([2, 3, 4, 5])
    expect(result.lines.slice(0, 3).map((line) => line.hash)).toEqual([FULL_SHA, FULL_SHA, FULL_SHA])
    expect(result.lines[3].summary).toBe('Later commit')
  })

  it('reuses commit metadata when a commit appears in later blocks without repeating it', () => {
    // Git blames repeated commits compactly: a later block for an already-seen
    // sha lists only the header line, no metadata lines.
    const stdout = [
      porcelainBlock({ finalLine: 1, numLines: 1, content: ['a'] }),
      `${FULL_SHA} 1 2 1`,
      '\t' + 'b'
    ].join('\n')
    const result = parseGitBlamePorcelain(stdout, 'src/file.ts')
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1].author).toBe('A U Thor')
    expect(result.lines[1].summary).toBe('Fix the parsing bug')
  })

  it('returns an empty line list for empty porcelain output', () => {
    const result = parseGitBlamePorcelain('', 'src/file.ts')
    expect(result.lines).toEqual([])
  })
})

describe('loadGitBlameFromExecutor', () => {
  it('runs git blame --porcelain through the executor and parses the log', async () => {
    const calls: { args: string[]; cwd: string }[] = []
    const result: GitBlameResult = await loadGitBlameFromExecutor(
      async (args, cwd) => {
        calls.push({ args, cwd })
        return { stdout: porcelainBlock() }
      },
      'C:/repo',
      { filePath: 'src/file.ts' }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].cwd).toBe('C:/repo')
    // Why: the path must be option-injection safe — fenced with -- and never parsed as a flag.
    expect(calls[0].args).toEqual(['blame', '--porcelain', '--end-of-options', '--', 'src/file.ts'])
    expect(result.lines).toHaveLength(1)
  })

  it('propagates the executor failure for an empty repository (exit != 0)', async () => {
    await expect(
      loadGitBlameFromExecutor(
        async () => {
          throw new Error('fatal: no such ref HEAD')
        },
        'C:/repo',
        { filePath: 'src/file.ts' }
      )
    ).rejects.toThrow('fatal: no such ref HEAD')
  })
})
