// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import type { TreeNode } from './file-explorer-types'
import { useFileExplorerKeys } from './useFileExplorerKeys'

const mocks = vi.hoisted(() => ({
  keybindings: {} as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      rightSidebarOpen: true,
      rightSidebarTab: 'explorer',
      rightSidebarExplorerView: 'files',
      keybindings: mocks.keybindings
    })
}))

vi.mock('./fileExplorerUndoRedo', () => ({
  fileExplorerHasUndo: () => false,
  fileExplorerHasRedo: () => false,
  undoFileExplorer: vi.fn(),
  redoFileExplorer: vi.fn()
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const fileNode: TreeNode = {
  name: 'App.tsx',
  path: '/repo/src/App.tsx',
  relativePath: 'src/App.tsx',
  isDirectory: false,
  depth: 1
}

function Harness(props: {
  startRename: (node: TreeNode) => void
  inlineInput: unknown
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  useFileExplorerKeys({
    containerRef,
    rowProjection: createFileExplorerRowProjection([fileNode]),
    expandedPaths: new Set(),
    canToggleDirectories: true,
    inlineInput: props.inlineInput as never,
    selectedPaths: new Set(),
    selectedNode: fileNode,
    activateNode: vi.fn(),
    moveSelection: vi.fn(),
    toggleDir: vi.fn(),
    startRename: props.startRename,
    requestDelete: vi.fn(),
    requestDeleteAll: vi.fn(),
    scrollToIndex: vi.fn(),
    activeWorktreeId: 'wt-1'
  })

  return (
    <div ref={containerRef} data-orca-explorer-shell="true">
      <div data-index="0">
        <button type="button">src/App.tsx</button>
      </div>
    </div>
  )
}

function pressKey(key: string): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })
    )
  })
}

describe('useFileExplorerKeys rename shortcuts', () => {
  afterEach(() => {
    cleanup()
    mocks.keybindings = {}
    document.body.replaceChildren()
  })

  function renderFocused(): { startRename: ReturnType<typeof vi.fn> } {
    const startRename = vi.fn()
    const { container } = render(<Harness startRename={startRename} inlineInput={null} />)
    ;(container.querySelector('[data-index="0"] button') as HTMLButtonElement).focus()
    expect(document.activeElement?.textContent).toBe('src/App.tsx')
    return { startRename }
  }

  it('renames the focused row on F2', () => {
    const { startRename } = renderFocused()

    pressKey('F2')

    expect(startRename).toHaveBeenCalledTimes(1)
    expect(startRename).toHaveBeenCalledWith(fileNode)
  })

  it('keeps Enter renaming the focused row', () => {
    const { startRename } = renderFocused()

    pressKey('Enter')

    expect(startRename).toHaveBeenCalledTimes(1)
    expect(startRename).toHaveBeenCalledWith(fileNode)
  })

  it('ignores F2 while the inline rename input is open', () => {
    const startRename = vi.fn()
    const { container } = render(
      <Harness startRename={startRename} inlineInput={{ path: fileNode.path }} />
    )
    ;(container.querySelector('[data-index="0"] button') as HTMLButtonElement).focus()

    pressKey('F2')
    pressKey('Enter')

    expect(startRename).not.toHaveBeenCalled()
  })
})
