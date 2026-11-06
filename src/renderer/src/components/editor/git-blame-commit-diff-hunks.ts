import type { GitDiffResult } from '../../../../shared/git/diff/git-diff-compare-types'

/** Cap: beyond this many lines the dialog shows a truncation notice, not a freeze. */
export const GIT_BLAME_DIFF_MAX_LINES = 5_000
/**
 * LCS table cell budget (~16MB of Uint32Array). The 5000-line cap alone still
 * allowed a 25M-cell table for two large dissimilar files; prefix/suffix
 * trimming handles real diffs, and only a pathological middle section pays
 * the truncation notice.
 */
export const GIT_BLAME_DIFF_MAX_LCS_CELLS = 4_000_000

export type GitBlameDiffHunk = {
  /** 1-based start line in the original file. */
  originalStart: number
  /** 1-based start line in the modified file. */
  modifiedStart: number
  rows: { kind: 'context' | 'added' | 'removed'; text: string }[]
}

export type GitBlameFileDiff = {
  isText: boolean
  added: number
  removed: number
  hunks: GitBlameDiffHunk[]
  truncated: boolean
}

type Op = { kind: 'same' | 'add' | 'del'; originalLine?: string; modifiedLine?: string }

// Classic LCS table diff — blame-dialog files are single-file diffs capped at
// GIT_BLAME_DIFF_MAX_LINES, where the O(n*m) table stays small.
function diffLines(original: string[], modified: string[]): Op[] {
  const rows = original.length
  const columns = modified.length
  const table: Uint32Array[] = []
  for (let i = 0; i <= rows; i += 1) {
    table.push(new Uint32Array(columns + 1))
  }
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      table[i][j] =
        original[i] === modified[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (original[i] === modified[j]) {
      ops.push({ kind: 'same', originalLine: original[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: 'del', originalLine: original[i] })
      i += 1
    } else {
      ops.push({ kind: 'add', modifiedLine: modified[j] })
      j += 1
    }
  }
  while (i < rows) {
    ops.push({ kind: 'del', originalLine: original[i] })
    i += 1
  }
  while (j < columns) {
    ops.push({ kind: 'add', modifiedLine: modified[j] })
    j += 1
  }
  return ops
}

const HUNK_CONTEXT_LINES = 3

/**
 * Unified hunks + +/− stats for the commit-detail dialog, computed from the
 * same `git.commitDiff` result the dialog renders — so the dialog's diff and
 * the card's `+N −M` stat share one source by construction.
 */
export function buildGitBlameFileDiff(result: GitDiffResult): GitBlameFileDiff {
  if (result.kind !== 'text') {
    return { isText: false, added: 0, removed: 0, hunks: [], truncated: false }
  }
  const original = result.originalContent.split('\n')
  const modified = result.modifiedContent.split('\n')
  if (original.length > GIT_BLAME_DIFF_MAX_LINES || modified.length > GIT_BLAME_DIFF_MAX_LINES) {
    return { isText: true, added: 0, removed: 0, hunks: [], truncated: true }
  }
  // Identical heads/tails carry no diff; trimming them keeps the LCS table to
  // the actually-changed middle (typical commits change a small window).
  let lead = 0
  while (lead < original.length && lead < modified.length && original[lead] === modified[lead]) {
    lead += 1
  }
  let tail = 0
  while (
    tail < original.length - lead &&
    tail < modified.length - lead &&
    original[original.length - 1 - tail] === modified[modified.length - 1 - tail]
  ) {
    tail += 1
  }
  const originalMiddle = original.slice(lead, original.length - tail)
  const modifiedMiddle = modified.slice(lead, modified.length - tail)
  if (originalMiddle.length * modifiedMiddle.length > GIT_BLAME_DIFF_MAX_LCS_CELLS) {
    return { isText: true, added: 0, removed: 0, hunks: [], truncated: true }
  }
  const ops = diffLines(originalMiddle, modifiedMiddle)
  const hunks: GitBlameDiffHunk[] = []
  let added = 0
  let removed = 0
  let index = 0
  while (index < ops.length) {
    if (ops[index].kind === 'same') {
      index += 1
      continue
    }
    // Hunk start: back up over the surrounding context lines.
    const start = Math.max(0, index - HUNK_CONTEXT_LINES)
    const rows: GitBlameDiffHunk['rows'] = []
    let originalStart: number | null = null
    let modifiedStart: number | null = null
    for (let back = start; back < index; back += 1) {
      rows.push({ kind: 'context', text: ops[back].originalLine ?? '' })
    }
    let cursor = index
    let trailingSame = 0
    while (cursor < ops.length) {
      const op = ops[cursor]
      if (op.kind === 'same') {
        if (trailingSame >= HUNK_CONTEXT_LINES) {
          break
        }
        trailingSame += 1
        rows.push({ kind: 'context', text: op.originalLine ?? '' })
        cursor += 1
        continue
      }
      trailingSame = 0
      if (op.kind === 'add') {
        added += 1
        rows.push({ kind: 'added', text: op.modifiedLine ?? '' })
      } else {
        removed += 1
        rows.push({ kind: 'removed', text: op.originalLine ?? '' })
      }
      cursor += 1
    }
    // 1-based line numbers over all ops before the hunk body; ops exclude the
    // trimmed common prefix, so file lines are offset by `lead`.
    for (let back = 0; back < start; back += 1) {
      const op = ops[back]
      if (op.kind !== 'add' && originalStart === null) {
        originalStart = lead + back + 1
      }
      if (op.kind !== 'del' && modifiedStart === null) {
        modifiedStart = lead + back + 1
      }
    }
    hunks.push({
      originalStart: originalStart ?? lead + 1,
      modifiedStart: modifiedStart ?? lead + 1,
      rows
    })
    index = cursor
  }
  return { isText: true, added, removed, hunks, truncated: false }
}
