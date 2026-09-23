import { describe, expect, it, vi } from 'vitest'
import { undoReplaceOp, type UndoSummary } from './search-replace-undo'
import type { SearchReplaceOp } from './search-replace-op'

function makeOp(files: { path: string; oldContent: string; newContent: string }[]): SearchReplaceOp {
  return {
    kind: 'replace-all',
    at: 1_700_000_000_000,
    files: files.map((f) => ({
      filePath: f.path,
      relativePath: f.path,
      oldContent: f.oldContent,
      newContent: f.newContent
    }))
  }
}

// currentContents models the disk as the replace run left it; tests mutate
// entries to simulate third-party edits between replace and undo.
function makeIo(current: Record<string, string>, opts: { failWrite?: string[]; dirty?: string[] } = {}) {
  const stats = new Map(
    Object.entries(current).map(([path, content]) => [path, { size: content.length, isDirectory: false, mtime: 1 }])
  )
  const contents = new Map(Object.entries(current))
  const failWrite = new Set(opts.failWrite ?? [])
  const dirty = new Set(opts.dirty ?? [])
  const summary: { writes: { path: string; content: string }[] } = { writes: [] }
  const io = {
    stat: vi.fn(async (filePath: string) => {
      const value = stats.get(filePath)
      if (!value) {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return value
    }),
    read: vi.fn(async (filePath: string) => {
      const content = contents.get(filePath)
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return { content, isBinary: false }
    }),
    write: vi.fn(async (filePath: string, content: string) => {
      if (failWrite.has(filePath)) {
        throw new Error(`EPERM: cannot write ${filePath}`)
      }
      contents.set(filePath, content)
      stats.set(filePath, { size: content.length, isDirectory: false, mtime: 2 })
      summary.writes.push({ path: filePath, content })
    }),
    isDirty: vi.fn((filePath: string) => dirty.has(filePath)),
    stamp: vi.fn()
  }
  return { io, summary, contents }
}

function tally(summary: UndoSummary): number {
  const { counts } = summary
  const accounted = counts.restored + counts.skippedDirty + counts.skippedStale + counts.errors + counts.unprocessed
  expect(accounted).toBe(summary.totalFiles)
  return accounted
}

describe('undoReplaceOp', () => {
  it('restores every file the replace run wrote', async () => {
    const { io, summary } = makeIo({ '/wt/a.md': 'new A', '/wt/b.md': 'new B' })
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' },
      { path: '/wt/b.md', oldContent: 'old B', newContent: 'new B' }
    ]), io })

    expect(tally(result)).toBe(2)
    expect(result.counts).toMatchObject({ restored: 2, skippedDirty: 0, skippedStale: 0, errors: 0 })
    expect(summary.writes).toEqual([
      { path: '/wt/a.md', content: 'old A' },
      { path: '/wt/b.md', content: 'old B' }
    ])
    // Restores stamp self-writes so editor/remote echo suppressions apply.
    expect(io.stamp).toHaveBeenCalledWith('/wt/b.md', 'old B')
  })

  it('restores only the still-undoable files when one write fails', async () => {
    const { io, summary } = makeIo(
      { '/wt/a.md': 'new A', '/wt/b.md': 'new B' },
      { failWrite: ['/wt/a.md'] }
    )
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' },
      { path: '/wt/b.md', oldContent: 'old B', newContent: 'new B' }
    ]), io })

    expect(result.counts).toMatchObject({ restored: 1, errors: 1 })
    expect(tally(result)).toBe(2)
    expect(summary.writes).toEqual([{ path: '/wt/b.md', content: 'old B' }])
  })

  it('skips files changed on disk after the replace instead of clobbering them', async () => {
    const { io, summary } = makeIo({ '/wt/a.md': 'agent touched this' })
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' }
    ]), io })

    expect(result.counts).toMatchObject({ restored: 0, skippedStale: 1 })
    expect(result.outcomes[0]?.reason).toContain('changed on disk')
    expect(tally(result)).toBe(1)
    expect(summary.writes).toEqual([])
  })

  it('skips dirty editor buffers', async () => {
    const { io, summary } = makeIo({ '/wt/a.md': 'new A' }, { dirty: ['/wt/a.md'] })
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' }
    ]), io })

    expect(result.counts).toMatchObject({ restored: 0, skippedDirty: 1 })
    expect(tally(result)).toBe(1)
    expect(summary.writes).toEqual([])
  })

  it('is a no-op on the second undo (double-undo safety)', async () => {
    const { io, summary } = makeIo({ '/wt/a.md': 'old A' })
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' }
    ]), io })

    expect(result.counts).toMatchObject({ restored: 0, skippedStale: 1 })
    expect(result.outcomes[0]?.reason).toContain('already undone')
    expect(tally(result)).toBe(1)
    expect(summary.writes).toEqual([])
  })

  it('stops on transport errors and counts the rest as unprocessed', async () => {
    const { io } = makeIo({ '/wt/a.md': 'new A', '/wt/b.md': 'new B' })
    io.read.mockRejectedValueOnce(new Error('connection lost'))
    const result = await undoReplaceOp({ op: makeOp([
      { path: '/wt/a.md', oldContent: 'old A', newContent: 'new A' },
      { path: '/wt/b.md', oldContent: 'old B', newContent: 'new B' }
    ]), io })

    expect(result.stoppedOnTransportError).toBe(true)
    expect(result.counts).toMatchObject({ errors: 1, unprocessed: 1 })
    expect(tally(result)).toBe(2)
  })
})
