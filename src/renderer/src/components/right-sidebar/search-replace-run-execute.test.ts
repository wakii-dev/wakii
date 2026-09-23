import { describe, expect, it, vi } from 'vitest'
import type { SearchFileResult } from '../../../../shared/code-search-types'
import { executeFileReplaceAll } from './search-replace-run-execute'
import type { FileExplorerOperationGuard } from './file-explorer-operation-owner'

const FLAGS = { caseSensitive: false, wholeWord: false, useRegex: false }

function candidate(path: string): SearchFileResult {
  return {
    filePath: path,
    relativePath: path,
    matches: [{ line: 1, column: 0, matchLength: 3, lineContent: 'foo' }],
    matchCount: 1
  }
}

const GUARD: FileExplorerOperationGuard = {
  route: { settings: { activeRuntimeEnvironmentId: null }, expectedExecutionHostId: 'local' },
  assertCurrent: () => ({
    settings: { activeRuntimeEnvironmentId: null },
    expectedExecutionHostId: 'local'
  })
}

function makeIo(files: Record<string, string>) {
  const contents = new Map(Object.entries(files))
  const stats = new Map(
    Object.entries(files).map(([path, content]) => [path, { size: content.length, isDirectory: false, mtime: 1 }])
  )
  return {
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
      contents.set(filePath, content)
      stats.set(filePath, { size: content.length, isDirectory: false, mtime: 2 })
    }),
    isDirty: vi.fn(() => false),
    stamp: vi.fn()
  }
}

function baseParams(io: ReturnType<typeof makeIo>) {
  return {
    candidates: [candidate('/wt/a.md'), candidate('/wt/b.md')],
    query: 'foo',
    replaceTerm: 'baz',
    flags: FLAGS,
    captureGuard: vi.fn(() => GUARD),
    buildIo: vi.fn(() => io),
    callbacks: {
      begin: vi.fn(),
      finish: vi.fn(),
      cancelRequested: vi.fn(() => false),
      notifySummary: vi.fn()
    }
  }
}

describe('executeFileReplaceAll', () => {
  it('marks the run in progress, runs the write pass, stores the op, and reports the summary', async () => {
    const io = makeIo({ '/wt/a.md': 'foo', '/wt/b.md': 'bar' })
    const params = baseParams(io)

    await executeFileReplaceAll(params)

    expect(params.callbacks.begin).toHaveBeenCalledTimes(1)
    expect(params.callbacks.finish).toHaveBeenCalledTimes(1)
    const [op] = params.callbacks.finish.mock.calls[0]
    expect(op?.kind).toBe('replace-all')
    expect(op?.files).toHaveLength(1)
    expect(op?.files[0]).toMatchObject({ filePath: '/wt/a.md', oldContent: 'foo', newContent: 'baz' })
    expect(params.callbacks.notifySummary).toHaveBeenCalledTimes(1)
    expect(params.callbacks.notifySummary.mock.calls[0][0].counts.replaced).toBe(1)
  })

  it('stores no undo op when nothing was written', async () => {
    const io = makeIo({ '/wt/a.md': 'bar', '/wt/b.md': 'bar' })
    const params = baseParams(io)

    await executeFileReplaceAll(params)

    expect(params.callbacks.finish).toHaveBeenCalledWith(null)
    expect(params.callbacks.notifySummary).toHaveBeenCalledTimes(1)
  })

  it('blocks the whole run when the operation owner cannot be resolved', async () => {
    const io = makeIo({ '/wt/a.md': 'foo' })
    const params = baseParams(io)
    params.captureGuard = vi.fn(() => {
      throw new Error('unresolved owner')
    })

    await expect(executeFileReplaceAll(params)).rejects.toThrow('unresolved owner')
    expect(params.callbacks.begin).not.toHaveBeenCalled()
    expect(params.callbacks.finish).not.toHaveBeenCalled()
    expect(io.read).not.toHaveBeenCalled()
  })

  it('clears the in-progress flag when the runner blows up mid-run', async () => {
    const io = makeIo({ '/wt/a.md': 'foo' })
    const params = baseParams(io)
    params.buildIo = vi.fn(() => {
      throw new Error('io wiring failed')
    })

    await expect(executeFileReplaceAll(params)).rejects.toThrow('io wiring failed')
    expect(params.callbacks.begin).toHaveBeenCalledTimes(1)
    expect(params.callbacks.finish).toHaveBeenCalledWith(null)
  })
})
