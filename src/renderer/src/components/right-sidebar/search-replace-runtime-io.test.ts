import { describe, expect, it, vi } from 'vitest'
import {
  fsReadFile,
  fsStat,
  fsWriteFile,
  installRuntimeFileClientEnvironment
} from '@/runtime/runtime-file-client-test-harness'
import type { SearchFileResult } from '../../../../shared/code-search-types'
import { runReplaceAllAcrossFiles } from './search-replace-all-runner'
import { buildReplaceAllIo } from './search-replace-runtime-io'

installRuntimeFileClientEnvironment()

vi.mock('@/store', () => ({
  useAppStore: Object.assign(vi.fn(), {
    getState: () => ({
      openFiles: [
        {
          id: '/wt/dirty.md',
          filePath: '/wt/dirty.md',
          worktreeId: 'wt-1',
          isDirty: true
        },
        {
          id: '/wt/clean.md',
          filePath: '/wt/clean.md',
          worktreeId: 'wt-1',
          isDirty: false
        },
        {
          id: '/wt/other.md',
          filePath: '/wt/other.md',
          worktreeId: 'wt-OTHER',
          isDirty: true
        }
      ]
    })
  })
}))

const LOCAL_CONTEXT = {
  settings: { activeRuntimeEnvironmentId: null },
  worktreeId: 'wt-1',
  worktreePath: '/wt',
  connectionId: undefined
} as const

function candidate(path: string, relativePath = path): SearchFileResult {
  return {
    filePath: path,
    relativePath,
    matches: [{ line: 1, column: 0, matchLength: 3, lineContent: 'stub' }],
    matchCount: 1
  }
}

describe('buildReplaceAllIo — real runtime file clients', () => {
  it('round-trips CRLF and BOM through readRuntimeFileContent + writeRuntimeFile untouched', async () => {
    // BOM + CRLF, exactly what a Windows-authored file looks like on disk.
    const diskContent = '﻿name\r\nvalue\r\n'
    fsReadFile.mockResolvedValue({ content: diskContent, isBinary: false })
    fsStat.mockResolvedValue({ size: diskContent.length, isDirectory: false, mtime: 1 })

    const io = buildReplaceAllIo(LOCAL_CONTEXT)
    const summary = await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/file.md', 'file.md')],
      query: 'value',
      replaceTerm: 'giá trị',
      flags: { caseSensitive: false, wholeWord: false, useRegex: false },
      io,
      cancelRequested: () => false
    })

    expect(summary.counts.replaced).toBe(1)
    expect(fsWriteFile).toHaveBeenCalledTimes(1)
    // BOM preserved at the front, CRLF line endings intact, VN replacement text intact.
    expect(fsWriteFile.mock.calls[0]?.[0]).toMatchObject({
      filePath: '/wt/file.md',
      content: '﻿name\r\ngiá trị\r\n'
    })
  })

  it('detects dirty files through the open editor tabs store', async () => {
    const io = buildReplaceAllIo(LOCAL_CONTEXT)
    expect(io.isDirty('/wt/dirty.md')).toBe(true)
    expect(io.isDirty('/wt/clean.md')).toBe(false)
    expect(io.isDirty('/wt/other.md')).toBe(false)
  })

  it('stamps a self-write with the written content after a successful write', async () => {
    const { getRecentSelfWrite, clearSelfWrite } = await import(
      '@/components/editor/editor-self-write-registry'
    )
    fsReadFile.mockResolvedValue({ content: 'foo bar', isBinary: false })
    fsStat.mockResolvedValue({ size: 7, isDirectory: false, mtime: 1 })
    fsWriteFile.mockResolvedValue(undefined)

    const io = buildReplaceAllIo(LOCAL_CONTEXT)
    await runReplaceAllAcrossFiles({
      candidates: [candidate('/wt/stamp.md', 'stamp.md')],
      query: 'foo',
      replaceTerm: 'baz',
      flags: { caseSensitive: false, wholeWord: false, useRegex: false },
      io,
      cancelRequested: () => false
    })

    expect(getRecentSelfWrite('/wt/stamp.md')?.content).toBe('baz bar')
    clearSelfWrite('/wt/stamp.md')
  })
})
