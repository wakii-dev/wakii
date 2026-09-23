import { useCallback, useDeferredValue, useMemo, type RefObject } from 'react'
import type { SearchFileResult, SearchMatch, SearchResult } from '../../../../shared/code-search-types'
import { buildSearchRows, setAllSearchFilesCollapsed } from './search-rows'
import { openMatchResult } from './search-match-open'

type ResultsPanelArgs = {
  results: SearchResult | null
  resultOwner: Parameters<typeof openMatchResult>[0]['resultOwner']
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

  const committedSearchResults = useMemo(
    () => ({ results, owner: resultOwner }),
    [resultOwner, results]
  )
  const deferredSearchResults = useDeferredValue(committedSearchResults)
  const searchRows = useMemo(
    () =>
      buildSearchRows(
        query.trim() && worktreePath ? deferredSearchResults.results : null,
        collapsedFiles
      ),
    [deferredSearchResults.results, collapsedFiles, query, worktreePath]
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
    [deferredSearchResults.owner, openFile, setPendingEditorReveal, revealRafRef, revealInnerRafRef]
  )

  return {
    results: deferredSearchResults.results,
    rows: searchRows,
    onToggleCollapsedFile: toggleCollapsedFile,
    onExpandAll: handleExpandAll,
    onCollapseAll: handleCollapseAll,
    onMatchClick: handleMatchClick
  }
}
