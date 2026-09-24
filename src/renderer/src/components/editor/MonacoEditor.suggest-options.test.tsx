// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsRef = vi.hoisted(() => ({
  current: {} as Record<string, unknown>
}))

const editorProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    editorProps.current = props
    return null
  },
  loader: { config: vi.fn() }
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settings: settingsRef.current,
      editorFontZoomLevel: 0,
      setPendingEditorReveal: vi.fn(),
      setEditorCursorLine: vi.fn(),
      addDiffComment: vi.fn(),
      deleteDiffComment: vi.fn(),
      updateDiffComment: vi.fn(),
      scrollToDiffCommentId: null,
      setScrollToDiffCommentId: vi.fn(),
      worktreeDiffComments: {}
    })
}))
vi.mock('../diff-comments/useDiffCommentDecorator', () => ({
  useDiffCommentDecorator: vi.fn()
}))
vi.mock('./useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))

import MonacoEditor from './MonacoEditor'

afterEach(() => {
  cleanup()
  editorProps.current = null
  settingsRef.current = {}
})

function renderEditor(language = 'typescript'): void {
  render(
    <MonacoEditor
      fileId="file"
      filePath="/repo/file.ts"
      viewStateKey="pane:file"
      relativePath="file.ts"
      content="const x = 1"
      language={language}
      onContentChange={vi.fn()}
      onSave={vi.fn()}
    />
  )
}

describe('MonacoEditor suggest options (editor parity)', () => {
  it('exposes word-based + snippet suggestions explicitly', () => {
    settingsRef.current = { theme: 'dark' }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({
      quickSuggestions: { other: 'on', comments: 'off', strings: 'off' },
      wordBasedSuggestions: 'currentDocument',
      snippetSuggestions: 'inline'
    })
  })

  it('keeps suggest options on read-only surfaces (precondition gates action, not options)', () => {
    settingsRef.current = { theme: 'dark' }
    render(
      <MonacoEditor
        fileId="file"
        filePath="/repo/file.ts"
        viewStateKey="pane:file"
        relativePath="file.ts"
        content="const x = 1"
        language="typescript"
        readOnly
        onContentChange={vi.fn()}
        onSave={vi.fn()}
      />
    )

    expect(editorProps.current?.options).toMatchObject({
      wordBasedSuggestions: 'currentDocument'
    })
  })
})
