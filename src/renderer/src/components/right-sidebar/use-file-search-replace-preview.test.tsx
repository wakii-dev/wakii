// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SearchFileResult } from '../../../../shared/code-search-types'
import { useFileSearchReplacePreview } from './use-file-search-replace-preview'
import type { ReplaceAllIo } from './search-replace-all-runner'

const FLAGS = { caseSensitive: false, wholeWord: false, useRegex: false }

function candidate(path: string): SearchFileResult {
  return {
    filePath: path,
    relativePath: path,
    matches: [{ line: 1, column: 0, matchLength: 3, lineContent: 'foo' }],
    matchCount: 1
  }
}

function makeIo(files: Record<string, string>): ReplaceAllIo {
  const stats = new Map(Object.entries(files).map(([path, content]) => [path, { size: content.length, isDirectory: false, mtime: 1 }]))
  const contents = new Map(Object.entries(files))
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
    write: vi.fn(async () => {}),
    isDirty: vi.fn(() => false),
    stamp: vi.fn()
  }
}

describe('useFileSearchReplacePreview', () => {
  it('runs an exact dry-run when opened and reports derived counts', async () => {
    const io = makeIo({ '/wt/a.md': 'foo bar', '/wt/b.md': 'foo' })
    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        useFileSearchReplacePreview({
          open: props.open,
          candidates: [candidate('/wt/a.md'), candidate('/wt/b.md')],
          query: 'foo',
          replaceTerm: 'baz',
          flags: FLAGS,
          buildIo: () => io
        }),
      { initialProps: { open: false } }
    )

    expect(result.current.loading).toBe(false)
    rerender({ open: true })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary?.counts.replaced).toBe(2)
    expect(result.current.summary?.previews).toHaveLength(2)
    expect(result.current.summary?.previews[0]?.newContent).toBe('baz bar')
    // Dry-run must not write.
    expect(io.write).not.toHaveBeenCalled()
  })

  it('performs no IO when never opened', () => {
    const io = makeIo({})
    renderHook(() =>
      useFileSearchReplacePreview({
        open: false,
        candidates: [candidate('/wt/a.md')],
        query: 'foo',
        replaceTerm: 'baz',
        flags: FLAGS,
        buildIo: () => io
      })
    )
    expect(io.read).not.toHaveBeenCalled()
  })

  it('exposes a dismiss that clears the summary without touching files', async () => {
    const io = makeIo({ '/wt/a.md': 'foo' })
    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        useFileSearchReplacePreview({
          open: props.open,
          candidates: [candidate('/wt/a.md')],
          query: 'foo',
          replaceTerm: 'baz',
          flags: FLAGS,
          buildIo: () => io
        }),
      { initialProps: { open: true } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary?.counts.replaced).toBe(1)

    act(() => {
      result.current.dismiss()
    })
    rerender({ open: false })
    expect(result.current.summary).toBeNull()
    expect(io.write).not.toHaveBeenCalled()
  })
})
