import { describe, expect, it, vi } from 'vitest'
import { SearchQueryRow } from './SearchQueryRow'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

function readTestId(entry: ReactElementLike): string | undefined {
  const testId = entry.props['data-testid']
  return typeof testId === 'string' ? testId : undefined
}

function findTestIds(node: ReactElementLike): Map<string, ReactElementLike> {
  const found = new Map<string, ReactElementLike>()
  visit(node, (entry) => {
    const testId = readTestId(entry)
    // Why: last-wins keeps presence checks simple; duplicate ids (history
    // items) are counted separately via collectTestIds.
    if (testId !== undefined) {
      found.set(testId, entry)
    }
  })
  return found
}

function collectTestIds(node: ReactElementLike): string[] {
  const ids: string[] = []
  visit(node, (entry) => {
    const testId = readTestId(entry)
    if (testId !== undefined) {
      ids.push(testId)
    }
  })
  return ids
}

function renderQueryRow(overrides: {
  history?: string[]
  historyOpen?: boolean
  onHistorySelect?: (query: string) => void
}) {
  return SearchQueryRow({
    inputRef: { current: null },
    query: '',
    loading: false,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    history: overrides.history ?? [],
    historyOpen: overrides.historyOpen ?? false,
    replaceVisible: false,
    replaceQuery: '',
    replaceDisabledReason: null,
    hasReplaceUndo: false,
    onReplaceUndo: vi.fn(),
    onToggleReplaceVisible: vi.fn(),
    onReplaceQueryChange: vi.fn(),
    onReplaceAll: vi.fn(),
    onQueryChange: vi.fn(),
    onKeyDown: vi.fn(),
    onClearSearch: vi.fn(),
    onToggleCaseSensitive: vi.fn(),
    onToggleWholeWord: vi.fn(),
    onToggleRegex: vi.fn(),
    onHistoryFocus: vi.fn(),
    onHistoryBlur: vi.fn(),
    onHistorySelect: overrides.onHistorySelect ?? vi.fn()
  })
}

describe('SearchQueryRow history dropdown', () => {
  it('renders one row per history entry when open', () => {
    const tree = renderQueryRow({ history: ['alpha', 'beta'], historyOpen: true })
    const items = collectTestIds(tree).filter((id) => id === 'search-history-item')
    expect(items).toHaveLength(2)
  })

  it('renders no dropdown when closed or history is empty', () => {
    const closed = findTestIds(renderQueryRow({ history: ['alpha'], historyOpen: false }))
    expect(closed.has('search-history-dropdown')).toBe(false)
    const empty = findTestIds(renderQueryRow({ history: [], historyOpen: true }))
    expect(empty.has('search-history-dropdown')).toBe(false)
  })

  it('selects the clicked history entry', () => {
    const onHistorySelect = vi.fn()
    const tree = renderQueryRow({ history: ['alpha', 'beta'], historyOpen: true, onHistorySelect })
    const items: ReactElementLike[] = []
    visit(tree, (entry) => {
      if (readTestId(entry) === 'search-history-item') {
        items.push(entry)
      }
    })
    const onClick = items[0]?.props.onClick
    if (typeof onClick === 'function') {
      onClick()
    }
    expect(onHistorySelect).toHaveBeenCalledWith('alpha')
  })

  it('marks the row container for external targeting', () => {
    const ids = findTestIds(renderQueryRow({ history: ['a'], historyOpen: true }))
    expect(ids.has('search-query-row')).toBe(true)
  })
})
