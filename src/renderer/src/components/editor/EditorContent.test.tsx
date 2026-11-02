// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'

// Stub lazy renderers because renderToStaticMarkup cannot resolve them; retain the banner branch structure.
vi.mock('@/lib/lazy-with-retry', () => ({
  lazyWithRetry: () => () => null
}))

import { EditorContent, getMarkdownSourceLineOffset } from './EditorContent'

function createOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/repo/notebook.ipynb',
    filePath: '/repo/notebook.ipynb',
    relativePath: 'notebook.ipynb',
    worktreeId: 'repo::/repo',
    language: 'notebook',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EditorContent wakii-viewer payload lookup', () => {
  afterEach(() => {
    cleanup()
    useAppStore.setState({ wakiiViewerFiles: {} })
  })

  // Why a client render: zustand's server snapshot reads getInitialState(), so
  // renderToStaticMarkup can never see setState-seeded payload state.
  it('resolves the payload by filePath when another owner owns the tab id', () => {
    const path = '/repo/docs/superpowers/mindmaps/vu-14.wakii'
    const ownedId = `editor:global-floating-terminal:local:${path}`
    useAppStore.setState({
      wakiiViewerFiles: {
        [path]: {
          path,
          mindmap: {
            wakiiMindmap: 1,
            meta: { story: 's', generatedAt: '2026-09-27T00:00:00Z', generator: 'g' },
            nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
            edges: []
          }
        }
      }
    })
    const activeFile = createOpenFile({
      id: ownedId,
      filePath: path,
      relativePath: 'vu-14.wakii',
      worktreeId: 'global-floating-terminal',
      language: 'plaintext',
      mode: 'wakii-viewer'
    })
    const { container } = render(
      <EditorContent
        activeFile={activeFile}
        viewStateScopeId={activeFile.id}
        fileContents={{}}
        diffContents={{}}
        editBuffers={{}}
        openFiles={[activeFile]}
        worktreeEntries={[]}
        resolvedLanguage="plaintext"
        isMarkdown={false}
        isMermaid={false}
        isCsv={false}
        isNotebook={false}
        mdViewMode="source"
        inlineMarkdownRenderState={null}
        isChangesMode={false}
        sideBySide={false}
        pendingEditorReveal={null}
        handleContentChange={vi.fn()}
        handleContentChangeForFile={vi.fn()}
        handleDirtyStateHint={vi.fn()}
        handleSave={vi.fn()}
        handleSaveForFile={vi.fn()}
        reloadContent={vi.fn()}
      />
    )
    // Old code looked the payload up by tab id and showed the placeholder even
    // though the payload was in memory under the file path.
    expect(container.textContent).not.toContain('no longer in memory')
  })
})

describe('EditorContent', () => {
  it('maps rich-editor annotation lines after front matter to source lines', () => {
    expect(getMarkdownSourceLineOffset('---\ntitle: x\n---\n')).toBe(3)
    expect(getMarkdownSourceLineOffset('+++\ntitle = "x"\n+++\n')).toBe(3)
    expect(getMarkdownSourceLineOffset('---\r\ntitle: x\r\n---\r\n')).toBe(3)
    expect(getMarkdownSourceLineOffset('---\rtitle: x\n---\r\n')).toBe(3)
  })
})
