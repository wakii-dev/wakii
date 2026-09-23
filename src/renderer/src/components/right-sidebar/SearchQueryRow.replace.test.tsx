import { describe, expect, it, vi } from 'vitest'
import { SearchQueryRow, type ReplaceDisabledReason } from './SearchQueryRow'
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

function invokeHandler(entry: ReactElementLike | undefined, prop: string, arg?: unknown): void {
  const handler = entry?.props[prop]
  if (typeof handler === 'function') {
    handler(arg)
  }
}

function renderQueryRow(overrides: {
  replaceVisible?: boolean
  replaceQuery?: string
  replaceDisabledReason?: ReplaceDisabledReason | null
  onToggleReplaceVisible?: () => void
  onReplaceQueryChange?: (event: unknown) => void
  onReplaceAll?: () => void
}) {
  return SearchQueryRow({
    inputRef: { current: null },
    query: 'foo',
    loading: false,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    history: [],
    historyOpen: false,
    replaceVisible: overrides.replaceVisible ?? false,
    replaceQuery: overrides.replaceQuery ?? '',
    replaceDisabledReason: overrides.replaceDisabledReason ?? null,
    onQueryChange: vi.fn(),
    onKeyDown: vi.fn(),
    onClearSearch: vi.fn(),
    onToggleCaseSensitive: vi.fn(),
    onToggleWholeWord: vi.fn(),
    onToggleRegex: vi.fn(),
    onToggleReplaceVisible: overrides.onToggleReplaceVisible ?? vi.fn(),
    onReplaceQueryChange: overrides.onReplaceQueryChange ?? vi.fn(),
    onReplaceAll: overrides.onReplaceAll ?? vi.fn(),
    onHistoryFocus: vi.fn(),
    onHistoryBlur: vi.fn(),
    onHistorySelect: vi.fn()
  })
}

describe('SearchQueryRow replace field', () => {
  it('hides the replace row until the toggle is switched on', () => {
    const collapsed = collectTestIds(renderQueryRow({}))
    expect(collapsed).not.toContain('search-replace-input')
    expect(collapsed).not.toContain('search-replace-all-button')

    const expanded = collectTestIds(renderQueryRow({ replaceVisible: true }))
    expect(expanded).toContain('search-replace-toggle')
    expect(expanded).toContain('search-replace-input')
    expect(expanded).toContain('search-replace-all-button')
  })

  it('typing in the replace field reports the new value', () => {
    const onReplaceQueryChange = vi.fn()
    const ids = findTestIds(renderQueryRow({ replaceVisible: true, onReplaceQueryChange }))
    invokeHandler(ids.get('search-replace-input'), 'onChange', { target: { value: 'bar' } })
    expect(onReplaceQueryChange).toHaveBeenCalledWith({ target: { value: 'bar' } })
  })

  it('clicking Replace All reports the click when enabled', () => {
    const onReplaceAll = vi.fn()
    const ids = findTestIds(renderQueryRow({ replaceVisible: true, onReplaceAll }))
    invokeHandler(ids.get('search-replace-all-button'), 'onClick')
    expect(onReplaceAll).toHaveBeenCalledTimes(1)
  })

  it.each<ReplaceDisabledReason>(['no-results', 'truncated', 'cap', 'invalid-regex', 'running'])(
    'disables Replace All while blocked by %s',
    (reason) => {
      const ids = findTestIds(
        renderQueryRow({ replaceVisible: true, replaceDisabledReason: reason })
      )
      const button = ids.get('search-replace-all-button')
      expect(button?.props['disabled']).toBe(true)
      expect(button?.props['aria-disabled']).toBe(true)
    }
  )

  it('enables Replace All when nothing blocks it', () => {
    const ids = findTestIds(
      renderQueryRow({ replaceVisible: true, replaceDisabledReason: null })
    )
    const button = ids.get('search-replace-all-button')
    expect(button?.props['disabled']).toBe(false)
  })

  it('shows an explanatory message for the invalid-regex block', () => {
    const ids = findTestIds(
      renderQueryRow({ replaceVisible: true, replaceDisabledReason: 'invalid-regex' })
    )
    expect(ids.has('search-replace-block-message')).toBe(true)
  })

  it('shows no block message for other reasons', () => {
    const ids = findTestIds(
      renderQueryRow({ replaceVisible: true, replaceDisabledReason: 'truncated' })
    )
    expect(ids.has('search-replace-block-message')).toBe(false)
  })

  it('mirrors the typed replace value into the input', () => {
    const ids = findTestIds(renderQueryRow({ replaceVisible: true, replaceQuery: 'bar' }))
    expect(ids.get('search-replace-input')?.props['value']).toBe('bar')
  })
})
