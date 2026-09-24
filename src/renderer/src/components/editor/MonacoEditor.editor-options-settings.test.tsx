// @vitest-environment happy-dom
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

const settingsRef = vi.hoisted(() => {
  const ref: { current: Record<string, unknown> } = { current: {} }
  return ref
})

const editorProps = vi.hoisted(() => {
  const ref: { current: Record<string, unknown> | null } = { current: null }
  return ref
})

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

function renderEditor(): void {
  render(
    <MonacoEditor
      fileId="file"
      filePath="/repo/file.ts"
      viewStateKey="pane:file"
      relativePath="file.ts"
      content="const x = 1"
      language="typescript"
      onContentChange={vi.fn()}
      onSave={vi.fn()}
    />
  )
}

describe('MonacoEditor bracket/caret/whitespace options (editor parity)', () => {
  it('defaults bracket colorization on, smooth caret on, whitespace to selection', () => {
    settingsRef.current = { theme: 'dark' }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({
      bracketPairColorization: { enabled: true },
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection'
    })
  })

  it('reads caret animation and whitespace preferences from settings', () => {
    settingsRef.current = {
      theme: 'dark',
      editorCursorSmoothCaretAnimation: 'explicit',
      editorRenderWhitespace: 'all'
    }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({
      cursorSmoothCaretAnimation: 'explicit',
      renderWhitespace: 'all'
    })
  })

  it('ships caret on + whitespace selection in the default settings', () => {
    const defaults = getDefaultSettings(join('test', 'home'))
    expect(defaults.editorCursorSmoothCaretAnimation).toBe('on')
    expect(defaults.editorRenderWhitespace).toBe('selection')
  })

  it('defaults the minimap on before settings hydrate (no off-flash)', () => {
    settingsRef.current = { theme: 'dark' }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({ minimap: { enabled: true } })
  })

  it('keeps the minimap off when the preference is explicitly false', () => {
    settingsRef.current = { theme: 'dark', editorMinimapEnabled: false }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({ minimap: { enabled: false } })
  })
})
