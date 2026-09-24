// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settingsRef = vi.hoisted(() => ({
  current: {} as Record<string, unknown>
}))

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
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
import { QUICK_OUTLINE_EDITOR_ATTRIBUTE } from '@/lib/quick-outline-editor-target'

afterEach(() => {
  cleanup()
  settingsRef.current = {}
})

function renderEditor(language: string, filePath: string): HTMLElement {
  const { container } = render(
    <MonacoEditor
      fileId="file"
      filePath={filePath}
      viewStateKey="pane:file"
      relativePath={filePath}
      content=""
      language={language}
      onContentChange={vi.fn()}
      onSave={vi.fn()}
    />
  )
  return container.firstElementChild as HTMLElement
}

describe('MonacoEditor quick-outline ownership (chord policy)', () => {
  it('marks a ts editor as the quick-outline owner so shortcut eaters yield', () => {
    settingsRef.current = { theme: 'dark' }
    const root = renderEditor('typescript', '/repo/file.ts')
    expect(root.hasAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE)).toBe(true)
  })

  it('does not mark a markdown-source editor — Mod+Shift+O keeps opening the preview', () => {
    settingsRef.current = { theme: 'dark' }
    const root = renderEditor('markdown', '/repo/notes.md')
    expect(root.hasAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE)).toBe(false)
  })

  it('does not mark surfaces without a DocumentSymbolProvider', () => {
    settingsRef.current = { theme: 'dark' }
    for (const language of ['python', 'shell', 'notebook']) {
      const root = renderEditor(language, `/repo/file.${language === 'python' ? 'py' : 'txt'}`)
      expect(root.hasAttribute(QUICK_OUTLINE_EDITOR_ATTRIBUTE), language).toBe(false)
    }
  })
})
