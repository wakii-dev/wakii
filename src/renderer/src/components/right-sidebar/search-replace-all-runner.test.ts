import { describe, expect, it, vi } from 'vitest'
import type { SearchFileResult } from '../../../../shared/code-search-types'
import {
  REPLACE_ALL_MAX_FILES,
  runReplaceAllAcrossFiles,
  type ReplaceAllIo,
  type ReplaceAllRunSummary
} from './search-replace-all-runner'

const FLAGS = { caseSensitive: false, wholeWord: false, useRegex: false }

type FakeFile = {
  content: string
  mtime: number
  size: number
  dirty?: boolean
  readError?: Error
  writeError?: Error
  binary?: boolean
}

function makeFileStore(files: Record<string, FakeFile>) {
  const writes: { filePath: string; content: string }[] = []
  const stamps: { filePath: string; content: string }[] = []
  return { files, writes, stamps }
}

function makeIo(store: ReturnType<typeof makeFileStore>): ReplaceAllIo {
  const stat = vi.fn(async (filePath: string) => {
    const file = store.files[filePath]
    if (!file) {
      throw new Error(`ENOENT: no such file: ${filePath}`)
    }
    return { size: file.size, isDirectory: false, mtime: file.mtime }
  })
  const read = vi.fn(async (filePath: string) => {
    const file = store.files[filePath]
    if (!file) {
      throw new Error(`ENOENT: no such file: ${filePath}`)
    }
    if (file.readError) {
      throw file.readError
    }
    if (file.binary) {
      return { content: '', isBinary: true }
    }
    return { content: file.content, isBinary: false }
  })
  const write = vi.fn(async (filePath: string, content: string) => {
    const file = store.files[filePath]
    if (!file) {
      throw new Error(`ENOENT: no such file: ${filePath}`)
    }
    if (file.writeError) {
      throw file.writeError
    }
    file.content = content
    file.mtime += 1
    file.size = content.length
    store.writes.push({ filePath, content })
  })
  const isDirty = vi.fn((filePath: string) => store.files[filePath]?.dirty === true)
  const stamp = vi.fn((filePath: string, content: string) => {
    store.stamps.push({ filePath, content })
  })
  return { stat, read, write, isDirty, stamp }
}

function candidate(path: string, relativePath = path): SearchFileResult {
  return {
    filePath: path,
    relativePath,
    matches: [{ line: 1, column: 0, matchLength: 3, lineContent: 'stub' }],
    matchCount: 1
  }
}

// Why: the summary-accounting invariant (buckets sum to the roster) is
// asserted inside every tally call, so each test also proves sum == total.
function tally(summary: ReplaceAllRunSummary) {
  const { replaced, skippedDirty, skippedStale, errors, unprocessed } = summary.counts
  expect(replaced + skippedDirty + skippedStale + errors + unprocessed).toBe(
    summary.totalCandidates
  )
  return summary.counts
}

describe('runReplaceAllAcrossFiles', () => {
  it('replaces matches in sequential files and records the undo closure', async () => {
    const store = makeFileStore({
      '/wt/a.md': { content: 'foo bar', mtime: 1, size: 7 },
      '/wt/b.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/a.md'), candidate('/wt/b.md', 'b.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary)).toEqual({
      replaced: 2,
      skippedDirty: 0,
      skippedStale: 0,
      errors: 0,
      unprocessed: 0
    })
    expect(store.files['/wt/a.md'].content).toBe('baz bar')
    expect(store.files['/wt/b.md'].content).toBe('baz')
    expect(summary.writtenFiles).toEqual([
      { filePath: '/wt/a.md', relativePath: '/wt/a.md', oldContent: 'foo bar', newContent: 'baz bar' },
      { filePath: '/wt/b.md', relativePath: 'b.md', oldContent: 'foo', newContent: 'baz' }
    ])
    expect(io.stamp).toHaveBeenCalledTimes(2)
    expect(summary.stoppedOnTransportError).toBe(false)
    expect(summary.cancelled).toBe(false)
  })

  it('re-derives from fresh content: a candidate with no remaining match is skipped stale', async () => {
    const store = makeFileStore({
      // Search roster said 1 match, but disk content no longer contains it.
      '/wt/stale.md': { content: 'nothing here', mtime: 1, size: 12 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/stale.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary)).toEqual({
      replaced: 0,
      skippedDirty: 0,
      skippedStale: 1,
      errors: 0,
      unprocessed: 0
    })
    expect(io.write).not.toHaveBeenCalled()
  })

  it('skips the write when the replacement would not change the content', async () => {
    const store = makeFileStore({
      '/wt/same.md': { content: 'foo', mtime: 7, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/same.md')],
      query: 'foo',
      replaceTerm: 'foo',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary).skippedStale).toBe(1)
    expect(io.write).not.toHaveBeenCalled()
    // Why: the mtime is the undo baseline — a no-op must not churn it.
    expect(store.files['/wt/same.md'].mtime).toBe(7)
  })

  it('skips dirty files before reading them', async () => {
    const store = makeFileStore({
      '/wt/dirty.md': { content: 'foo', mtime: 1, size: 3, dirty: true }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/dirty.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary).skippedDirty).toBe(1)
    expect(io.read).not.toHaveBeenCalled()
    expect(io.write).not.toHaveBeenCalled()
  })

  it('skips a file whose stat changed between read and write (TOCTOU)', async () => {
    const store = makeFileStore({
      '/wt/raced.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    // Simulate an agent touching the file after the runner read it.
    vi.mocked(io.read).mockImplementation(async (filePath) => {
      const result = { content: store.files[filePath]?.content ?? '', isBinary: false }
      store.files['/wt/raced.md'].mtime = 99
      return result
    })
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/raced.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary).skippedStale).toBe(1)
    expect(io.write).not.toHaveBeenCalled()
  })

  it('stops on transport errors and marks the rest unprocessed', async () => {
    const store = makeFileStore({
      '/wt/ok.md': { content: 'foo', mtime: 1, size: 3 },
      '/wt/down.md': { content: 'foo', mtime: 1, size: 3, readError: new Error('SSH connection reset') },
      '/wt/never.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/ok.md'), candidate('/wt/down.md'), candidate('/wt/never.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    const counts = tally(summary)
    // The transport-errored file lands in errors; files never attempted are unprocessed.
    expect(counts).toEqual({
      replaced: 1,
      skippedDirty: 0,
      skippedStale: 0,
      errors: 1,
      unprocessed: 1
    })
    expect(summary.stoppedOnTransportError).toBe(true)
    expect(store.files['/wt/never.md'].content).toBe('foo')
  })

  it('continues on per-file content errors (binary, too large, deleted)', async () => {
    const store = makeFileStore({
      '/wt/bin.md': { content: '', mtime: 1, size: 0, binary: true },
      '/wt/big.md': {
        content: '',
        mtime: 1,
        size: 0,
        readError: new Error('File too large: 9.0MB exceeds 8.0MB limit')
      },
      '/wt/gone.md': { content: '', mtime: 1, size: 0, readError: new Error('ENOENT: no such file') },
      '/wt/ok.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [
        candidate('/wt/bin.md'),
        candidate('/wt/big.md'),
        candidate('/wt/gone.md'),
        candidate('/wt/ok.md')
      ],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    const counts = tally(summary)
    expect(counts.errors).toBe(3)
    expect(counts.replaced).toBe(1)
    expect(summary.stoppedOnTransportError).toBe(false)
  })

  it('classifies permission-denied writes as content errors and keeps going', async () => {
    const store = makeFileStore({
      '/wt/ro.md': { content: 'foo', mtime: 1, size: 3, writeError: new Error('EACCES: permission denied, open') },
      '/wt/rw.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/ro.md'), candidate('/wt/rw.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    const counts = tally(summary)
    expect(counts.errors).toBe(1)
    expect(counts.replaced).toBe(1)
    expect(summary.stoppedOnTransportError).toBe(false)
  })

  it('enforces the per-run file cap and marks the remainder unprocessed', async () => {
    const store = makeFileStore({})
    const candidates: SearchFileResult[] = []
    for (let i = 0; i < REPLACE_ALL_MAX_FILES + 30; i++) {
      const path = `/wt/f${i}.md`
      store.files[path] = { content: 'foo', mtime: 1, size: 3 }
      candidates.push(candidate(path))
    }
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates,
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    const counts = tally(summary)
    expect(counts.replaced).toBe(REPLACE_ALL_MAX_FILES)
    expect(counts.unprocessed).toBe(30)
    expect(io.write).toHaveBeenCalledTimes(REPLACE_ALL_MAX_FILES)
  })

  it('cancel between files keeps written files and marks the rest unprocessed', async () => {
    const store = makeFileStore({
      '/wt/1.md': { content: 'foo', mtime: 1, size: 3 },
      '/wt/2.md': { content: 'foo', mtime: 1, size: 3 },
      '/wt/3.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    let cancelAfter = 0
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/1.md'), candidate('/wt/2.md'), candidate('/wt/3.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => {
        cancelAfter += 1
        return cancelAfter > 1
      }
    })

    const counts = tally(summary)
    expect(counts.replaced).toBe(1)
    expect(counts.unprocessed).toBe(2)
    expect(summary.cancelled).toBe(true)
    // The already-written file stays written.
    expect(store.files['/wt/1.md'].content).toBe('baz')
    expect(summary.writtenFiles.map((f) => f.filePath)).toEqual(['/wt/1.md'])
  })

  it('dry-run mode derives previews without writing or stamping', async () => {
    const store = makeFileStore({
      '/wt/a.md': { content: 'foo\r\nbar', mtime: 1, size: 8 },
      '/wt/b.md': { content: 'foo', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/a.md'), candidate('/wt/b.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: FLAGS,
      io,
      cancelRequested: () => false,
      mode: 'dry-run'
    })

    const counts = tally(summary)
    expect(counts.replaced).toBe(2)
    expect(io.write).not.toHaveBeenCalled()
    expect(io.stamp).not.toHaveBeenCalled()
    expect(io.stat).not.toHaveBeenCalled()
    expect(store.files['/wt/a.md'].content).toBe('foo\r\nbar')
    expect(summary.previews).toEqual([
      { filePath: '/wt/a.md', relativePath: '/wt/a.md', oldContent: 'foo\r\nbar', newContent: 'baz\r\nbar', matchCount: 1 },
      { filePath: '/wt/b.md', relativePath: '/wt/b.md', oldContent: 'foo', newContent: 'baz', matchCount: 1 }
    ])
  })

  it('removes matches end-to-end with an empty replace term', async () => {
    const store = makeFileStore({
      '/wt/a.md': { content: 'aaa', mtime: 1, size: 3 }
    })
    const io = makeIo(store)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/a.md')],
      query: 'aa',
      replaceTerm: '',
      flags: FLAGS,
      io,
      cancelRequested: () => false
    })

    expect(tally(summary).replaced).toBe(1)
    expect(store.files['/wt/a.md'].content).toBe('a')
    expect(summary.writtenFiles).toEqual([
      { filePath: '/wt/a.md', relativePath: '/wt/a.md', oldContent: 'aaa', newContent: 'a' }
    ])
  })
})
