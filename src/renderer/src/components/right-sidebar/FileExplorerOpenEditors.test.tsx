import { describe, expect, it, vi } from 'vitest'
import { FileExplorerOpenEditors } from './FileExplorerOpenEditors'
import type { OpenEditorsEntry } from './file-explorer-open-editors'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

const ENTRIES: OpenEditorsEntry[] = [
  {
    id: 'f1',
    fileName: 'index.ts',
    relativeDir: 'src',
    isDirty: true,
    isPreview: false,
    isActive: true,
    externalMutation: null
  },
  {
    id: 'f2',
    fileName: 'README.md',
    relativeDir: '',
    isDirty: false,
    isPreview: true,
    isActive: false,
    externalMutation: 'deleted'
  }
]

function collectByTestId(node: unknown, testId: string): ReactElementLike[] {
  const found: ReactElementLike[] = []
  visit(node, (entry) => {
    if (entry.props['data-testid'] === testId) {
      found.push(entry)
    }
  })
  return found
}

function findByTestId(node: unknown, testId: string): ReactElementLike {
  const found = collectByTestId(node, testId)
  if (found.length === 0) {
    throw new Error(`${testId} element not found`)
  }
  return found[0]
}

describe('FileExplorerOpenEditors', () => {
  it('renders nothing when there are no open editors', () => {
    const element = FileExplorerOpenEditors({
      entries: [],
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      onActivate: vi.fn(),
      onClose: vi.fn()
    })
    expect(element).toBeNull()
  })

  it('renders one row per open editor with the file name and dir suffix', () => {
    const element = FileExplorerOpenEditors({
      entries: ENTRIES,
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      onActivate: vi.fn(),
      onClose: vi.fn()
    })

    const rows = collectByTestId(element, 'open-editors-row')
    expect(rows).toHaveLength(2)
    expect(String(rows[0]?.props['data-active'])).toBe('true')
    expect(JSON.stringify(rows[1]?.props.children)).toContain('README.md')
  })

  it('activates a file when its row is clicked', () => {
    const onActivate = vi.fn()
    const element = FileExplorerOpenEditors({
      entries: ENTRIES,
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      onActivate,
      onClose: vi.fn()
    })

    const row = findByTestId(element, 'open-editors-row')
    ;(row.props.onClick as () => void)()
    expect(onActivate).toHaveBeenCalledWith('f1')
  })

  it('closes a file from its close button without activating the row', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const element = FileExplorerOpenEditors({
      entries: ENTRIES,
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      onActivate,
      onClose
    })

    const closeButtons = collectByTestId(element, 'open-editors-close')
    expect(closeButtons).toHaveLength(2)
    const stopPropagation = vi.fn()
    ;(closeButtons[0].props.onClick as (event: { stopPropagation: () => void }) => void)({
      stopPropagation
    })
    expect(stopPropagation).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledWith('f1')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('toggles collapse from the section header', () => {
    const onToggleCollapsed = vi.fn()
    const element = FileExplorerOpenEditors({
      entries: ENTRIES,
      collapsed: false,
      onToggleCollapsed,
      onActivate: vi.fn(),
      onClose: vi.fn()
    })

    const header = findByTestId(element, 'open-editors-header')
    ;(header.props.onClick as () => void)()
    expect(onToggleCollapsed).toHaveBeenCalled()
  })

  it('hides rows while collapsed but keeps the header with the count', () => {
    const element = FileExplorerOpenEditors({
      entries: ENTRIES,
      collapsed: true,
      onToggleCollapsed: vi.fn(),
      onActivate: vi.fn(),
      onClose: vi.fn()
    })

    expect(collectByTestId(element, 'open-editors-row')).toHaveLength(0)
    expect(JSON.stringify(findByTestId(element, 'open-editors-header').props.children)).toContain(
      '2'
    )
  })
})
