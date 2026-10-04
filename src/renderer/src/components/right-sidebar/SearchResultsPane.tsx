import React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'
import { getNextMatchRowIndex } from './search-rows'
import type { SearchRow } from './search-rows'
import { FileResultRow, MatchResultRow } from './SearchResultItems'
import { translate } from '@/i18n/i18n'

const SEARCH_VIRTUAL_OVERSCAN = 12

type SearchResultsPaneProps = {
  results: SearchResult | null
  error?: string | null
  hasCommittedResults: boolean
  query: string
  loading: boolean
  rows: SearchRow[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapsedFile: (filePath: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onMatchClick: (fileResult: SearchFileResult, match: SearchMatch) => void
}

export function SearchResultsPane({
  results,
  hasCommittedResults,
  error,
  query,
  loading,
  rows,
  scrollRef,
  onToggleCollapsedFile,
  onExpandAll,
  onCollapseAll,
  onMatchClick
}: SearchResultsPaneProps): React.JSX.Element {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) {
        return 20
      }
      // Why: file rows include pt-1.5 (6 px) for inter-group spacing, so
      // their estimate is taller than match rows.
      if (row.type === 'file') {
        return 28
      }
      return 20
    },
    // Why: paddingEnd adds visible breathing room after the last result row.
    // paddingStart is unnecessary because each file row already includes
    // pt-1.5 for inter-group spacing (which also covers the first row).
    paddingEnd: 8,
    overscan: SEARCH_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const row = rows[index]
      if (!row) {
        return `missing:${index}`
      }
      if (row.type === 'file') {
        return `file:${row.fileResult.filePath}`
      }
      return `match:${row.fileResult.filePath}:${row.match.line}:${row.match.column}:${row.matchIndex}`
    }
  })

  const handleResultsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest('[data-search-row-type="match"]')) {
        event.stopPropagation()
        active.blur()
      }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    if (!(event.target instanceof HTMLElement)) {
      return
    }
    const rowEl = event.target.closest('[data-search-row-type="match"]')
    if (!rowEl) {
      return
    }
    const currentIndex = Number(rowEl.getAttribute('data-search-row-index'))
    if (Number.isNaN(currentIndex)) {
      return
    }
    const next = getNextMatchRowIndex(rows, currentIndex, event.key === 'ArrowDown' ? 1 : -1)
    if (next === null) {
      return
    }
    event.preventDefault()
    virtualizer.scrollToIndex(next, { align: 'auto' })
    // Why: scrollToIndex swaps virtual items on the next render, so the row's
    // button only exists in the DOM after the frame it triggers.
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-search-row-index="${next}"] button`)
        ?.focus()
    })
  }

  return (
    <>
      {/* Why: the summary is rendered outside the virtualizer so it stays
         pinned at the top while the user scrolls through results. */}
      {!error && results && (rows.length > 0 || results.truncated) && (
        <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border-b border-border">
          <span>
            {results.totalMatches}{' '}
            {translate('auto.components.right.sidebar.Search.6aeda362ed', 'result')}
            {results.totalMatches !== 1 ? 's' : ''}{' '}
            {translate('auto.components.right.sidebar.Search.4107975b3a', 'in')}{' '}
            {results.files.length}{' '}
            {translate('auto.components.right.sidebar.Search.0b8104eaf2', 'file')}
            {results.files.length !== 1 ? 's' : ''}
            {results.truncated &&
              translate('auto.components.right.sidebar.Search.dcc294f28d', '(results truncated)')}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              data-testid="search-expand-all"
              aria-label={translate(
                'auto.components.right.sidebar.SearchResultsPane.9a1c2e3f4b',
                'Expand All'
              )}
              title={translate(
                'auto.components.right.sidebar.SearchResultsPane.9a1c2e3f4b',
                'Expand All'
              )}
              onClick={onExpandAll}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronsUpDown className="size-3" />
            </button>
            <button
              type="button"
              data-testid="search-collapse-all"
              aria-label={translate(
                'auto.components.right.sidebar.SearchResultsPane.7d2b4f6a8c',
                'Collapse All'
              )}
              title={translate(
                'auto.components.right.sidebar.SearchResultsPane.7d2b4f6a8c',
                'Collapse All'
              )}
              onClick={onCollapseAll}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronsDownUp className="size-3" />
            </button>
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek"
        onKeyDown={handleResultsKeyDown}
      >
        {error && (
          <div
            role="alert"
            className="p-2 text-xs text-destructive whitespace-pre-wrap break-words"
          >
            {error}
          </div>
        )}
        {!error && rows.length > 0 && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) {
                return null
              }

              return (
                <div
                  key={virtualRow.key}
                  data-search-row-index={virtualRow.index}
                  data-search-row-type={row.type}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === 'file' && (
                    <FileResultRow
                      fileResult={row.fileResult}
                      collapsed={row.collapsed}
                      onToggleCollapse={() => onToggleCollapsedFile(row.fileResult.filePath)}
                    />
                  )}
                  {row.type === 'match' && (
                    <MatchResultRow
                      match={row.match}
                      relativePath={row.fileResult.relativePath}
                      onClick={() => onMatchClick(row.fileResult, row.match)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!error && !hasCommittedResults && query && !loading && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            {translate('auto.components.right.sidebar.Search.d56d140747', 'Press Enter to search')}
          </div>
        )}

        {!query && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            {translate(
              'auto.components.right.sidebar.Search.1abfb25a66',
              'Type to search in files'
            )}
          </div>
        )}
      </div>
    </>
  )
}
