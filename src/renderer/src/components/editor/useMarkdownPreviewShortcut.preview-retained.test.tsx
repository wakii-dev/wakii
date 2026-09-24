// @vitest-environment happy-dom
// Exit test (ii) FI-33 task 8: the panel preview binding Mod+Shift+V still opens
// the preview with the markdown SOURCE editor focused. The Mod+Shift+O yield half
// (markdown keeps its new-tab claim) is covered by
// floating-workspace-shortcut-policy.quick-outline.test.ts.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'

import { useMarkdownPreviewShortcut } from './useMarkdownPreviewShortcut'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ keybindings: undefined })
}))

afterEach(() => {
  cleanup()
})

function ShortcutHarness({
  panelRef,
  openMarkdownPreview
}: {
  panelRef: RefObject<HTMLDivElement | null>
  openMarkdownPreview: (file: {
    filePath: string
    relativePath: string
    worktreeId: string
    runtimeEnvironmentId?: string | null
    language: string
  }) => void
}): null {
  useMarkdownPreviewShortcut({
    activeFile: {
      id: 'file-1',
      filePath: '/repo/notes.md',
      relativePath: 'notes.md',
      worktreeId: 'wt-1',
      mode: 'edit',
      language: 'markdown',
      isDirty: false
    },
    panelRef,
    openMarkdownPreview
  })
  return null
}

describe('useMarkdownPreviewShortcut (quick-outline chord policy)', () => {
  it('opens the preview when the preview chord is pressed inside the markdown source editor', () => {
    const openMarkdownPreview = vi.fn()
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const editorSurface = document.createElement('textarea')
    panel.appendChild(editorSurface)
    const panelRef = { current: panel }

    render(<ShortcutHarness panelRef={panelRef} openMarkdownPreview={openMarkdownPreview} />)

    act(() => {
      editorSurface.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'V',
          code: 'KeyV',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })

    expect(openMarkdownPreview).toHaveBeenCalledTimes(1)
    panel.remove()
  })

  it('ignores the preview chord when the event originates outside the editor panel', () => {
    const openMarkdownPreview = vi.fn()
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const outside = document.createElement('textarea')
    document.body.appendChild(outside)
    const panelRef = { current: panel }

    render(<ShortcutHarness panelRef={panelRef} openMarkdownPreview={openMarkdownPreview} />)

    act(() => {
      outside.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'V',
          code: 'KeyV',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })

    expect(openMarkdownPreview).not.toHaveBeenCalled()
    panel.remove()
    outside.remove()
  })
})
