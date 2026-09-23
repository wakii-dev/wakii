import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { selectOpenEditorsEntries } from './file-explorer-open-editors'

function openFile(overrides: Partial<OpenFile> & Pick<OpenFile, 'id' | 'relativePath'>): OpenFile {
  return {
    filePath: `/repo/${overrides.relativePath}`,
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  } as OpenFile
}

describe('selectOpenEditorsEntries', () => {
  it('lists edit and markdown-preview files of the active worktree in tab order', () => {
    const entries = selectOpenEditorsEntries(
      [
        openFile({ id: 'f1', relativePath: 'src/index.ts' }),
        openFile({ id: 'd1', relativePath: 'diff', mode: 'diff' }),
        openFile({ id: 'f2', relativePath: 'docs/guide.md', mode: 'markdown-preview' }),
        openFile({ id: 'other', relativePath: 'x.ts', worktreeId: 'wt-2' })
      ],
      'wt-1',
      null
    )

    expect(entries.map((entry) => entry.id)).toEqual(['f1', 'f2'])
  })

  it('derives file name, parent directory, dirty, preview, and active flags', () => {
    const entries = selectOpenEditorsEntries(
      [
        openFile({ id: 'f1', relativePath: 'src/deep/index.ts', isDirty: true }),
        openFile({
          id: 'f2',
          relativePath: 'README.md',
          isPreview: true,
          externalMutation: 'deleted'
        })
      ],
      'wt-1',
      'f2'
    )

    expect(entries[0]).toEqual({
      id: 'f1',
      fileName: 'index.ts',
      relativeDir: 'src/deep',
      isDirty: true,
      isPreview: false,
      isActive: false,
      externalMutation: null
    })
    expect(entries[1]).toEqual({
      id: 'f2',
      fileName: 'README.md',
      relativeDir: '',
      isDirty: false,
      isPreview: true,
      isActive: true,
      externalMutation: 'deleted'
    })
  })

  it('returns nothing without an active worktree', () => {
    expect(
      selectOpenEditorsEntries([openFile({ id: 'f1', relativePath: 'a.ts' })], null, 'f1')
    ).toEqual([])
  })
})
