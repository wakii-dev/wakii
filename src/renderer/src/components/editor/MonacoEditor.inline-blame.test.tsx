// @vitest-environment happy-dom
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

type CapturedProps = { current: Record<string, unknown> }

const settingsRef = vi.hoisted((): CapturedProps => ({ current: {} }))
const storeRef = vi.hoisted((): CapturedProps => ({ current: {} }))
const blameArgs = vi.hoisted((): { current: Record<string, unknown> | null } => ({ current: null }))

vi.mock('./use-monaco-git-blame', () => ({
  useMonacoGitBlame: (args: Record<string, unknown>) => {
    blameArgs.current = args
  },
  clearGitBlameCacheForWorktree: vi.fn(),
  clearGitBlameCacheForFile: vi.fn()
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
      revealInExplorer: vi.fn(),
      worktreesByRepo: {},
      activeGroupIdByWorktree: {},
      worktreeDiffComments: {},
      ...storeRef.current
    })
}))
vi.mock('../diff-comments/useDiffCommentDecorator', () => ({
  useDiffCommentDecorator: vi.fn()
}))
vi.mock('@/lib/connection-context', () => ({
  getConnectionId: vi.fn(() => null)
}))
vi.mock('./useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))

import MonacoEditor from './MonacoEditor'

afterEach(() => {
  cleanup()
  blameArgs.current = null
  settingsRef.current = {}
  storeRef.current = {}
})

type RenderOpts = {
  inlineBlameEnabled?: boolean
  isDirty?: boolean
  settings?: Record<string, unknown>
}

function renderEditor(opts: RenderOpts = {}): { rerender: (opts: RenderOpts) => void } {
  const base = {
    fileId: 'file-1',
    filePath: '/wt/repo/src/file.ts',
    viewStateKey: 'pane:file-1',
    relativePath: 'src/file.ts',
    content: 'const x = 1\nconst y = 2\n',
    language: 'typescript',
    onContentChange: vi.fn(),
    onSave: vi.fn(),
    worktreeId: 'wt-1'
  }
  const view = render(
    <MonacoEditor
      {...base}
      inlineBlameEnabled={opts.inlineBlameEnabled}
      isDirty={opts.isDirty}
    />
  )
  return {
    rerender: (next: RenderOpts) => {
      view.rerender(
        <MonacoEditor
          {...base}
          inlineBlameEnabled={next.inlineBlameEnabled}
          isDirty={next.isDirty}
        />
      )
    }
  }
}

describe('MonacoEditor inline blame wiring', () => {
  it('enables the blame hook when the surface opts in and the preference is on by default', () => {
    renderEditor({ inlineBlameEnabled: true })

    expect(blameArgs.current).toMatchObject({ enabled: true, worktreeId: 'wt-1' })
  })

  it('keeps the hook disabled when the surface does not opt in', () => {
    renderEditor()

    expect(blameArgs.current).toMatchObject({ enabled: false })
  })

  it('reflects the preference toggle instantly without remounting', () => {
    const view = renderEditor({ inlineBlameEnabled: true })
    expect(blameArgs.current).toMatchObject({ enabled: true })

    settingsRef.current = { editorInlineBlameEnabled: false }
    view.rerender({ inlineBlameEnabled: true })

    expect(blameArgs.current).toMatchObject({ enabled: false })
  })

  it('passes the worktree-scoped blame context through to the hook', () => {
    storeRef.current = {
      worktreesByRepo: { 'repo::/wt': [{ id: 'wt-1', path: '/wt', hostId: 'host-1' }] }
    }
    renderEditor({ inlineBlameEnabled: true, isDirty: true })

    expect(blameArgs.current).toMatchObject({
      enabled: true,
      worktreeId: 'wt-1',
      worktreePath: '/wt',
      relativePath: 'src/file.ts',
      content: 'const x = 1\nconst y = 2\n',
      isDirty: true
    })
  })

  it('ships inline blame on in the default settings', () => {
    expect(getDefaultSettings(join('test', 'home')).editorInlineBlameEnabled).toBe(true)
  })
})
