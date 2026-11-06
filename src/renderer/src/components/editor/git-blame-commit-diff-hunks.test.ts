import { describe, expect, it } from 'vitest'
import type { GitDiffResult } from '../../../../shared/git/diff/git-diff-compare-types'
import { buildGitBlameFileDiff, GIT_BLAME_DIFF_MAX_LINES } from './git-blame-commit-diff-hunks'

function textResult(original: string, modified: string): GitDiffResult {
  return {
    kind: 'text',
    originalContent: original,
    modifiedContent: modified,
    originalIsBinary: false,
    modifiedIsBinary: false
  }
}

describe('buildGitBlameFileDiff (SF-1 commit dialog diff)', () => {
  it('produces hunks with +/− stats matching the card stat source', () => {
    const diff = buildGitBlameFileDiff(
      textResult('line1\nline2\nline3', 'line1\nline2 changed\nline3\nline4')
    )
    expect(diff.isText).toBe(true)
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(1)
    expect(diff.hunks).toHaveLength(1)
    const kinds = diff.hunks[0].rows.map((row) => row.kind)
    expect(kinds.filter((kind) => kind === 'added')).toHaveLength(2)
    expect(kinds.filter((kind) => kind === 'removed')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'context').length).toBeGreaterThanOrEqual(1)
  })

  it('renders a binary result as no text diff', () => {
    const diff = buildGitBlameFileDiff({
      kind: 'binary',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: true,
      modifiedIsBinary: false
    })
    expect(diff.isText).toBe(false)
    expect(diff.hunks).toHaveLength(0)
  })

  it('truncates instead of freezing on oversized files', () => {
    const big = 'x\n'.repeat(GIT_BLAME_DIFF_MAX_LINES + 1)
    const diff = buildGitBlameFileDiff(textResult(big, big))
    expect(diff.truncated).toBe(true)
    expect(diff.hunks).toHaveLength(0)
  })

  it('reports no hunks for identical content', () => {
    const diff = buildGitBlameFileDiff(textResult('same', 'same'))
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    expect(diff.hunks).toHaveLength(0)
  })
})
