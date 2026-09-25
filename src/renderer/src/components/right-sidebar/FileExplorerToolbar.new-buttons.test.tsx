import { describe, expect, it, vi } from 'vitest'
import { FileExplorerToolbar } from './FileExplorerToolbar'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

function readTestId(entry: ReactElementLike): string | undefined {
  const testId = entry.props['data-testid']
  return typeof testId === 'string' ? testId : undefined
}

function findTestIds(node: ReactElementLike): Map<string, ReactElementLike> {
  const found = new Map<string, ReactElementLike>()
  visit(node, (entry) => {
    const testId = readTestId(entry)
    if (testId !== undefined) {
      found.set(testId, entry)
    }
  })
  return found
}

function invokeHandler(entry: ReactElementLike | undefined, prop: string, arg?: unknown): void {
  const handler = entry?.props[prop]
  if (typeof handler === 'function') {
    handler(arg)
  }
}

function renderToolbar(overrides: {
  canCreate?: boolean
  onStartNewFile?: () => void
  onStartNewFolder?: () => void
}) {
  return FileExplorerToolbar({
    repoName: 'repo',
    worktreePath: '/wt',
    refresh: { isRefreshing: false, showRefreshSpinner: false, handleRefresh: vi.fn() },
    canRefresh: true,
    canCollapseAll: true,
    onCollapseAll: vi.fn(),
    showGitIgnoredFilesToggle: false,
    showGitIgnoredFiles: false,
    onToggleGitIgnoredFiles: vi.fn(),
    showDotfiles: false,
    onToggleDotfiles: vi.fn(),
    canCreate: overrides.canCreate ?? true,
    onStartNewFile: overrides.onStartNewFile ?? vi.fn(),
    onStartNewFolder: overrides.onStartNewFolder ?? vi.fn()
  })
}

describe('FileExplorerToolbar New File / New Folder buttons', () => {
  it('renders both create buttons', () => {
    const ids = findTestIds(renderToolbar({}))
    expect(ids.has('explorer-new-file')).toBe(true)
    expect(ids.has('explorer-new-folder')).toBe(true)
  })

  it('starts a new file when the New File button is clicked', () => {
    const onStartNewFile = vi.fn()
    const ids = findTestIds(renderToolbar({ onStartNewFile }))
    invokeHandler(ids.get('explorer-new-file'), 'onClick')
    expect(onStartNewFile).toHaveBeenCalledTimes(1)
  })

  it('starts a new folder when the New Folder button is clicked', () => {
    const onStartNewFolder = vi.fn()
    const ids = findTestIds(renderToolbar({ onStartNewFolder }))
    invokeHandler(ids.get('explorer-new-folder'), 'onClick')
    expect(onStartNewFolder).toHaveBeenCalledTimes(1)
  })

  it('renders the create buttons as disabled without a workspace', () => {
    const ids = findTestIds(renderToolbar({ canCreate: false }))
    expect(ids.get('explorer-new-file')?.props['disabled']).toBe(true)
    expect(ids.get('explorer-new-folder')?.props['disabled']).toBe(true)
    expect(ids.get('explorer-new-file')?.props['aria-disabled']).toBe(true)
  })
})
