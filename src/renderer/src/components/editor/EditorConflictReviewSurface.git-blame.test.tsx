// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import type { FileContent } from './editor-panel-content-types'

const monacoProps = vi.hoisted((): { current: Record<string, unknown> | null } => ({
  current: null
}))

vi.mock('./editor-lazy-views', () => ({
  MonacoEditor: (props: Record<string, unknown>) => {
    monacoProps.current = props
    return null
  },
  ImageViewer: () => null
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openConflictReviewFile: vi.fn(),
      openConflictReview: vi.fn(),
      closeFile: vi.fn(),
      setRightSidebarTab: vi.fn()
    })
}))
vi.mock('./ConflictComponents', () => ({
  ConflictBanner: () => null,
  ConflictPlaceholderView: () => null,
  ConflictReviewPanel: ({
    selectedContent
  }: {
    selectedContent: React.ReactNode
  }) => <div data-testid="conflict-review-content">{selectedContent}</div>
}))

import { EditorConflictReviewSurface } from './EditorConflictReviewSurface'

afterEach(() => {
  cleanup()
  monacoProps.current = null
})

function makeFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    // Why root path: a conflict-review tab anchors at the worktree root; entry paths join against it.
    id: '/wt/repo',
    filePath: '/wt/repo',
    relativePath: '',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'conflict-review',
    conflictReview: {
      source: 'live-summary',
      snapshotTimestamp: 0,
      entries: [{ path: 'src/conflicted.ts', conflictKind: 'both_modified' }]
    },
    ...overrides
  }
}

function makeEntry(): GitStatusEntry {
  return {
    path: 'src/conflicted.ts',
    status: 'modified',
    area: 'unstaged',
    conflictKind: 'both_modified',
    conflictStatus: 'unresolved',
    conflictStatusSource: 'git'
  }
}

describe('EditorConflictReviewSurface inline blame opt-out', () => {
  it('renders conflict editors without opting into inline blame', () => {
    const file = makeFile()
    render(
      <EditorConflictReviewSurface
        activeFile={file}
        viewStateScopeId="pane-1"
        fileContents={{
          '/wt/repo/src/conflicted.ts': {
            content: 'const conflict = true\n',
            isBinary: false
          } satisfies FileContent
        }}
        editBuffers={{}}
        openFiles={[file]}
        worktreeEntries={[makeEntry()]}
        pendingEditorReveal={null}
        getConflictNavigation={vi.fn()}
        handleContentChangeForFile={vi.fn()}
        handleSaveForFile={vi.fn(async () => true)}
        reloadContent={vi.fn()}
      />
    )

    expect(monacoProps.current).toBeTruthy()
    expect(monacoProps.current?.['inlineBlameEnabled']).toBeUndefined()
    expect(monacoProps.current?.['conflictDecorationsEnabled']).toBe(true)
  })
})
