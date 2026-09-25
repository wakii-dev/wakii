// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { FileContent } from './editor-panel-content-types'

const monacoProps = vi.hoisted((): { current: Record<string, unknown> | null } => ({
  current: null
}))

vi.mock('./editor-lazy-views', () => ({
  MonacoEditor: (props: Record<string, unknown>) => {
    monacoProps.current = props
    return null
  },
  CsvViewer: () => null,
  ImageViewer: () => null,
  IpynbViewer: () => null,
  MermaidViewer: () => null
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./useMarkdownDocuments', () => ({
  useMarkdownDocuments: () => ({
    markdownDocuments: [],
    openMarkdownDocument: vi.fn(),
    onOpenDocLink: vi.fn(),
    previewProps: { markdownDocuments: [], onOpenDocument: vi.fn() },
    mdSave: vi.fn()
  })
}))

import { EditorEditFileSurface } from './EditorEditFileSurface'

afterEach(() => {
  cleanup()
  monacoProps.current = null
})

function makeFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/wt/repo/src/file.ts',
    filePath: '/wt/repo/src/file.ts',
    relativePath: 'src/file.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

function makeFileContent(): FileContent {
  return {
    content: 'const x = 1\n',
    isBinary: false,
    isImage: false
  }
}

function renderSurface(file: OpenFile): void {
  render(
    <EditorEditFileSurface
      activeFile={file}
      viewStateScopeId="pane-1"
      editorViewStateKey="pane-1:/wt/repo/src/file.ts"
      diffViewStateKey="diff-pane-1"
      pdfViewStateKey="pdf-pane-1"
      pdfPreferenceKey="pdf-pref"
      fileContent={makeFileContent()}
      diffContent={undefined}
      editBuffer={undefined}
      activeConflictEntry={null}
      monacoLanguage="typescript"
      isMarkdown={false}
      isMermaid={false}
      isCsv={false}
      isNotebook={false}
      mdViewMode="source"
      inlineMarkdownRenderState={null}
      isChangesMode={false}
      sideBySide={false}
      showMarkdownTableOfContents={false}
      showMarkdownFrontmatter={false}
      onCloseMarkdownTableOfContents={vi.fn()}
      markdownAnnotationsEnabled={false}
      pendingEditorReveal={null}
      markdownDocuments={{
        markdownDocuments: [],
        openMarkdownDocument: vi.fn(),
        onOpenDocLink: vi.fn(),
        previewProps: { markdownDocuments: [], onOpenDocument: vi.fn() },
        mdSave: vi.fn()
      }}
      getConflictNavigation={vi.fn()}
      getMarkdownSourceLineOffset={vi.fn(() => 0)}
      handleContentChange={vi.fn()}
      handleDirtyStateHint={vi.fn()}
      handleSave={vi.fn(async () => true)}
      reloadContent={vi.fn()}
    />
  )
}

describe('EditorEditFileSurface inline blame opt-in', () => {
  it('opts the file editor into inline blame and forwards the dirty flag', () => {
    renderSurface(makeFile({ isDirty: true }))

    expect(monacoProps.current).toMatchObject({
      inlineBlameEnabled: true,
      isDirty: true,
      worktreeId: 'wt-1',
      relativePath: 'src/file.ts'
    })
  })

  it('keeps forwarding a clean dirty flag for saved tabs', () => {
    renderSurface(makeFile({ isDirty: false }))

    expect(monacoProps.current).toMatchObject({ inlineBlameEnabled: true, isDirty: false })
  })
})
