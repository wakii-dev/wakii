// @vitest-environment happy-dom
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

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

describe('MonacoEditor sticky scroll wiring', () => {
  it('defaults sticky scroll to off when the preference is absent', () => {
    settingsRef.current = { theme: 'dark' }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({ stickyScroll: { enabled: false } })
  })

  it('honors the sticky scroll preference when enabled', () => {
    settingsRef.current = { theme: 'dark', editorStickyScroll: true }
    renderEditor()

    expect(editorProps.current?.options).toMatchObject({ stickyScroll: { enabled: true } })
  })

  it('ships sticky scroll off in the default settings', () => {
    expect(getDefaultSettings(join('test', 'home')).editorStickyScroll).toBe(false)
  })
})
