import { useCallback, useDeferredValue, useMemo, type RefObject } from 'react'
import type { SearchFileResult, SearchMatch, SearchResult } from '../../../../shared/code-search-types'
import { buildSearchRows, setAllSearchFilesCollapsed } from './search-rows'
import { openMatchResult } from './search-match-open'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'

type ResultsPanelArgs = {
  results: SearchResult | null
  resultOwner: Parameters<typeof openMatchResult>[0]['resultOwner']
  /** Currency gate from useFileSearchScope — stale results never render or open. */
  isCurrentOwner: (owner: FileSearchResultOwner | null | undefined) => boolean
  collapsedFiles: Set<string>
  query: string
  worktreePath: string | null
  toggleCollapsedFile: (filePath: string) => void
  updateActiveSearchState: (updates: { collapsedFiles?: Set<string> }) => void
  openFile: Parameters<typeof openMatchResult>[0]['openFile']
  setPendingEditorReveal: Parameters<typeof openMatchResult>[0]['setPendingEditorReveal']
  revealRafRef: RefObject<number | null>
  revealInnerRafRef: RefObject<number | null>
}

type ResultsPanel = {
  results: SearchResult | null
  resultsAreCurrent: boolean
  rows: ReturnType<typeof buildSearchRows>
  onToggleCollapsedFile: (filePath: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onMatchClick: (fileResult: SearchFileResult, match: SearchMatch) => void
}

// Why: result-row projection + expand/collapse/match-open handlers live here
// so useFileSearchPanel stays within the max-lines budget.
export function useFileSearchResultsPanel(args: ResultsPanelArgs): ResultsPanel {
  const {
    results,
    resultOwner,
    isCurrentOwner,
    collapsedFiles,
    query,
    worktreePath,
    toggleCollapsedFile,
    updateActiveSearchState,
    openFile,
    setPendingEditorReveal,
    revealRafRef,
    revealInnerRafRef
  } = args

  const resultsAreCurrent = isCurrentOwner(resultOwner)
  const committedSearchResults = useMemo(
    () => ({
      results: resultsAreCurrent ? results : null,
      owner: resultsAreCurrent ? resultOwner : null
    }),
    [resultOwner, results, resultsAreCurrent]
  )
  const deferredSearchResults = useDeferredValue(committedSearchResults)
  const deferredResultsAreCurrent = isCurrentOwner(deferredSearchResults.owner)
  const searchRows = useMemo(
    () =>
      buildSearchRows(
        deferredResultsAreCurrent && query.trim() && worktreePath
          ? deferredSearchResults.results
          : null,
        collapsedFiles
      ),
    [deferredSearchResults.results, collapsedFiles, query, worktreePath, deferredResultsAreCurrent]
  )

  const handleExpandAll = useCallback(() => {
    updateActiveSearchState({
      collapsedFiles: setAllSearchFilesCollapsed(results, false)
    })
  }, [results, updateActiveSearchState])

  const handleCollapseAll = useCallback(() => {
    updateActiveSearchState({ collapsedFiles: setAllSearchFilesCollapsed(results, true) })
  }, [results, updateActiveSearchState])

  const handleMatchClick = useCallback(
    (fileResult: SearchFileResult, match: SearchMatch) => {
      if (!deferredResultsAreCurrent) {
        return
      }
      openMatchResult({
        resultOwner: deferredSearchResults.owner,
        fileResult,
        match,
        openFile,
        setPendingEditorReveal,
        revealRafRef,
        revealInnerRafRef
      })
    },
    [
      deferredSearchResults.owner,
      openFile,
      setPendingEditorReveal,
      revealRafRef,
      revealInnerRafRef,
      deferredResultsAreCurrent
    ]
  )

  return {
    results: deferredSearchResults.results,
    resultsAreCurrent: deferredResultsAreCurrent,
    rows: searchRows,
    onToggleCollapsedFile: toggleCollapsedFile,
    onExpandAll: handleExpandAll,
    onCollapseAll: handleCollapseAll,
    onMatchClick: handleMatchClick
  }
}
