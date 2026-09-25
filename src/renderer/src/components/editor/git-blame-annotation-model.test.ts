import { describe, expect, it } from 'vitest'
import type { GitBlameLine } from '../../../../shared/git-blame-types'
import {
  GIT_BLAME_MAX_BYTES,
  GIT_BLAME_MAX_LINES,
  GitBlameCache,
  appendGitBlameHover,
  formatInlineBlameAnnotation,
  formatRelativeBlameDate,
  getBlameSkipReason,
  type HoverTextSink
} from './git-blame-annotation-model'
import { GIT_BLAME_STRINGS_EN } from './git-blame-strings'

const COMMITTED: GitBlameLine = {
  lineNumber: 3,
  hash: 'a'.repeat(40),
  abbreviatedHash: 'abc1234',
  author: 'Jane Dev',
  authorTime: 1_700_000_000_000,
  summary: 'Add blame reader',
  committed: true
}

const UNCOMMITTED: GitBlameLine = {
  lineNumber: 4,
  hash: '0'.repeat(40),
  abbreviatedHash: '0000000',
  author: 'Not Committed Yet',
  authorTime: 1_700_000_000_000,
  summary: 'src/app.ts',
  committed: false
}

const NOW = 1_700_060_000_000

type RecordedCall = { method: string; args: unknown[] }

function recordingSink(): {
  calls: RecordedCall[]
  appendText: HoverTextSink['appendText']
  appendCodeblock: HoverTextSink['appendCodeblock']
  appendMarkdown: (value: string) => unknown
} {
  const calls: RecordedCall[] = []
  return {
    calls,
    appendText: (...args) => calls.push({ method: 'appendText', args }),
    appendCodeblock: (...args) => calls.push({ method: 'appendCodeblock', args }),
    appendMarkdown: (...args) => calls.push({ method: 'appendMarkdown', args })
  }
}

describe('git blame cache', () => {
  it('hits for the same (worktree, file, head) and misses when the head sha moves', () => {
    const cache = new GitBlameCache()
    cache.set('wt-1', 'src/app.ts', 'sha-1', { filePath: 'src/app.ts', lines: [COMMITTED] }, '')

    expect(cache.get('wt-1', 'src/app.ts', 'sha-1', '')).not.toBeNull()
    // A save (new clean buffer revision, same HEAD) invalidates the entry.
    expect(cache.get('wt-1', 'src/app.ts', 'sha-1', 'new content')).toBeNull()
    expect(cache.get('wt-1', 'src/app.ts', 'sha-2', '')).toBeNull()
    expect(cache.get('wt-1', 'src/other.ts', 'sha-1', '')).toBeNull()
    expect(cache.get('wt-2', 'src/app.ts', 'sha-1', '')).toBeNull()
  })

  it('keeps the old head entry alive after a head change — a revert is a cache hit', () => {
    const cache = new GitBlameCache()
    cache.set('wt-1', 'src/app.ts', 'sha-1', { filePath: 'src/app.ts', lines: [COMMITTED] }, '')
    cache.set('wt-1', 'src/app.ts', 'sha-2', { filePath: 'src/app.ts', lines: [UNCOMMITTED] }, '')

    expect(cache.get('wt-1', 'src/app.ts', 'sha-1', '')).not.toBeNull()
    expect(cache.get('wt-1', 'src/app.ts', 'sha-2', '')).not.toBeNull()
  })

  it('clearWorktree evicts only that worktree', () => {
    const cache = new GitBlameCache()
    cache.set('wt-1', 'src/app.ts', 'sha-1', { filePath: 'src/app.ts', lines: [] }, '')
    cache.set('wt-2', 'src/app.ts', 'sha-1', { filePath: 'src/app.ts', lines: [] }, '')

    cache.clearWorktree('wt-1')

    expect(cache.get('wt-1', 'src/app.ts', 'sha-1', '')).toBeNull()
    expect(cache.get('wt-2', 'src/app.ts', 'sha-1', '')).not.toBeNull()
  })

  it('clearFile evicts only that file', () => {
    const cache = new GitBlameCache()
    cache.set('wt-1', 'src/app.ts', 'sha-1', { filePath: 'src/app.ts', lines: [] }, '')
    cache.set('wt-1', 'src/other.ts', 'sha-1', { filePath: 'src/other.ts', lines: [] }, '')

    cache.clearFile('wt-1', 'src/app.ts')

    expect(cache.get('wt-1', 'src/app.ts', 'sha-1', '')).toBeNull()
    expect(cache.get('wt-1', 'src/other.ts', 'sha-1', '')).not.toBeNull()
  })

  it('evicts the oldest entries beyond the bounded capacity', () => {
    const cache = new GitBlameCache()
    const total = 45
    for (let i = 0; i < total; i += 1) {
      cache.set('wt-1', `src/file-${i}.ts`, 'sha-1', { filePath: `src/file-${i}.ts`, lines: [] }, '')
    }

    expect(cache.get('wt-1', 'src/file-0.ts', 'sha-1', '')).toBeNull()
    expect(cache.get('wt-1', `src/file-${total - 1}.ts`, 'sha-1', '')).not.toBeNull()
    expect(cache.size()).toBeLessThanOrEqual(40)
  })
})

describe('blame skip guard', () => {
  it('skips files over the byte limit', () => {
    expect(getBlameSkipReason('a'.repeat(GIT_BLAME_MAX_BYTES + 1))).toBe('file-too-large')
  })

  it('skips files over the line limit without materializing a line array', () => {
    const lines = `${'x\n'.repeat(GIT_BLAME_MAX_LINES)}x`
    expect(getBlameSkipReason(lines)).toBe('too-many-lines')
  })

  it('returns no skip reason for a normal file', () => {
    expect(getBlameSkipReason('const x = 1\n')).toBeNull()
  })
})

describe('formatInlineBlameAnnotation', () => {
  it('formats a committed line as author · relative date · summary', () => {
    const annotation = formatInlineBlameAnnotation(COMMITTED, {
      isDirty: false,
      strings: GIT_BLAME_STRINGS_EN,
      now: NOW
    })
    expect(annotation).toContain('Jane Dev')
    expect(annotation).toContain('Add blame reader')
  })

  it('renders an uncommitted inserted line as You — never the porcelain placeholder author', () => {
    const annotation = formatInlineBlameAnnotation(UNCOMMITTED, {
      isDirty: false,
      strings: GIT_BLAME_STRINGS_EN,
      now: NOW
    })
    expect(annotation).toContain('You')
    expect(annotation).not.toContain('Not Committed Yet')
  })

  it('appends the stale marker when the buffer has unsaved changes', () => {
    const annotation = formatInlineBlameAnnotation(COMMITTED, {
      isDirty: true,
      strings: GIT_BLAME_STRINGS_EN,
      now: NOW
    })
    expect(annotation).toContain(GIT_BLAME_STRINGS_EN.stale)
  })
})

describe('formatRelativeBlameDate', () => {
  it('buckets sub-minute diffs as just now', () => {
    expect(formatRelativeBlameDate(NOW - 5_000, NOW)).toBe('just now')
  })

  it('buckets a one-day-old commit as a day', () => {
    const label = formatRelativeBlameDate(NOW - 26 * 60 * 60 * 1000, NOW)
    expect(label).toMatch(/day/)
  })

  it('falls back to a plain date for very old commits', () => {
    const label = formatRelativeBlameDate(NOW - 400 * 24 * 60 * 60 * 1000, NOW)
    expect(label).toMatch(/\d{4}/)
  })
})

describe('appendGitBlameHover', () => {
  it('builds hover content only through appendText/appendCodeblock — never appendMarkdown', () => {
    const sink = recordingSink()
    appendGitBlameHover(sink, COMMITTED, GIT_BLAME_STRINGS_EN, NOW)

    const methods = sink.calls.map((call) => call.method)
    expect(methods).toContain('appendText')
    expect(methods).not.toContain('appendMarkdown')
  })

  it('passes hostile content through as literal text — no markdown interpretation possible', () => {
    const hostile: GitBlameLine = {
      ...COMMITTED,
      author: '<script>alert(1)</script>',
      summary: '[click](http://evil.example) `code` #heading'
    }
    const sink = recordingSink()
    appendGitBlameHover(sink, hostile, GIT_BLAME_STRINGS_EN, NOW)

    const allText = sink.calls.map((call) => String(call.args[0] ?? '')).join('\n')
    expect(allText).toContain('<script>alert(1)</script>')
    expect(allText).toContain('[click](http://evil.example)')
  })

  it('includes hash, author, date and summary labels', () => {
    const sink = recordingSink()
    appendGitBlameHover(sink, COMMITTED, GIT_BLAME_STRINGS_EN, NOW)

    const allText = sink.calls.map((call) => String(call.args[0] ?? '')).join('\n')
    expect(allText).toContain('abc1234')
    expect(allText).toContain('Jane Dev')
    expect(allText).toContain('Add blame reader')
  })

  it('labels an uncommitted line as You with no stale placeholder author', () => {
    const sink = recordingSink()
    appendGitBlameHover(sink, UNCOMMITTED, GIT_BLAME_STRINGS_EN, NOW)

    const allText = sink.calls.map((call) => String(call.args[0] ?? '')).join('\n')
    expect(allText).toContain('You')
    expect(allText).not.toContain('Not Committed Yet')
  })
})
