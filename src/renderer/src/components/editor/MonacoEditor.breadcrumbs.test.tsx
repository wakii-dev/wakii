// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsRef = vi.hoisted(() => {
  const ref: { current: Record<string, unknown> } = { current: {} }
  return ref
})

const revealRef = vi.hoisted(() => ({ current: vi.fn() }))

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
  loader: { config: vi.fn() }
}))
vi.mock('@/store', () => {
  // Mirror the state fields the component reads via useAppStore selectors, plus
  // the slices getConnectionId() reads through useAppStore.getState() (FI-35).
  const storeState = () => ({
    settings: settingsRef.current,
    editorFontZoomLevel: 0,
    setPendingEditorReveal: vi.fn(),
    setEditorCursorLine: vi.fn(),
    revealInExplorer: revealRef.current,
    addDiffComment: vi.fn(),
    deleteDiffComment: vi.fn(),
    updateDiffComment: vi.fn(),
    scrollToDiffCommentId: null,
    setScrollToDiffCommentId: vi.fn(),
    worktreeDiffComments: {},
    worktreesByRepo: {},
    gitStatusHeadByWorktree: {},
    repos: [],
    folderWorkspaces: [],
    projectGroups: []
  })
  return {
    useAppStore: Object.assign(
      (selector: (state: Record<string, unknown>) => unknown) => selector(storeState()),
      { getState: storeState }
    )
  }
})
vi.mock('../diff-comments/useDiffCommentDecorator', () => ({
  useDiffCommentDecorator: vi.fn()
}))
vi.mock('./useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))

import MonacoEditor from './MonacoEditor'

afterEach(() => {
  cleanup()
  settingsRef.current = {}
  revealRef.current = vi.fn()
})

function renderEditor(props: Partial<Parameters<typeof MonacoEditor>[0]> = {}): HTMLElement {
  const { container } = render(
    <MonacoEditor
      fileId="file"
      filePath="/repo/src/lib/file.ts"
      viewStateKey="pane:file"
      relativePath="src/lib/file.ts"
      content="const x = 1"
      language="typescript"
      onContentChange={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  )
  return container
}

// Matrix pinned by the spec (component x expectation): the breadcrumb lives inside
// MonacoEditor gated on !autoHeight, so every file-editor surface that renders this
// component gets it, and the autoHeight inline-overview pin stays clean.
describe('MonacoEditor breadcrumbs (matrix)', () => {
  it('shows breadcrumbs on the file editor (default ON)', () => {
    settingsRef.current = { theme: 'dark' }
    const container = renderEditor()
    expect(container.querySelector('[data-testid="editor-breadcrumbs"]')).not.toBeNull()
  })

  it('shows breadcrumbs on liveTail readOnly surfaces', () => {
    settingsRef.current = { theme: 'dark' }
    const container = renderEditor({ readOnly: true, liveTail: true })
    expect(container.querySelector('[data-testid="editor-breadcrumbs"]')).not.toBeNull()
  })

  it('hides breadcrumbs on the autoHeight inline overview pin', () => {
    settingsRef.current = { theme: 'dark' }
    const container = renderEditor({ autoHeight: true })
    expect(container.querySelector('[data-testid="editor-breadcrumbs"]')).toBeNull()
  })

  it('hides breadcrumbs when the editorBreadcrumbsEnabled setting is off', () => {
    settingsRef.current = { theme: 'dark', editorBreadcrumbsEnabled: false }
    const container = renderEditor()
    expect(container.querySelector('[data-testid="editor-breadcrumbs"]')).toBeNull()
  })

  it('reveals the file through the store action when a parent segment is clicked', () => {
    settingsRef.current = { theme: 'dark' }
    const container = renderEditor({ worktreeId: 'wt-9' })
    const parent = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="breadcrumb-segment"]'
    )[0]
    parent?.click()
    expect(revealRef.current).toHaveBeenCalledWith('wt-9', '/repo/src/lib/file.ts')
  })
})
