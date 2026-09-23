import type React from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import type { SearchFileResult, SearchMatch } from '../../../../shared/code-search-types'
import { buildSearchRows, setAllSearchFilesCollapsed } from './search-rows'
import { cancelRevealFrame, openMatchResult } from './search-match-open'
import type { FileSearchPanelModel } from './file-search-panel-model'
import { useFileSearchRunner } from './useFileSearchRunner'
import { useFileSearchHistory } from './use-file-search-history'
import { useFileSearchReplaceCancelGuard } from './use-file-search-replace-cancel'

const EMPTY_COLLAPSED_FILES = new Set<string>()

export function useFileSearchPanel(explorerView: 'files' | 'search'): FileSearchPanelModel {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const openFile = useAppStore((s) => s.openFile)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)

  const searchState = useAppStore((s) =>
    activeWorktreeId ? s.fileSearchStateByWorktree[activeWorktreeId] : null
  )
  const fileSearchQuery = searchState?.query ?? ''
  const fileSearchCaseSensitive = searchState?.caseSensitive ?? false
  const fileSearchWholeWord = searchState?.wholeWord ?? false
  const fileSearchUseRegex = searchState?.useRegex ?? false
  const fileSearchIncludePattern = searchState?.includePattern ?? ''
  const fileSearchExcludePattern = searchState?.excludePattern ?? ''
  const fileSearchResults = searchState?.results ?? null
  const fileSearchResultOwner = searchState?.resultOwner ?? null
  const fileSearchLoading = searchState?.loading ?? false
  const fileSearchCollapsedFiles = searchState?.collapsedFiles ?? EMPTY_COLLAPSED_FILES
  const fileSearchSeedRequestId = searchState?.seedRequestId
  const fileSearchFocusRequestId = searchState?.focusRequestId

  const updateFileSearchState = useAppStore((s) => s.updateFileSearchState)
  const consumeFileSearchSeedRequest = useAppStore((s) => s.consumeFileSearchSeedRequest)
  const toggleFileSearchCollapsedFile = useAppStore((s) => s.toggleFileSearchCollapsedFile)
  const clearFileSearch = useAppStore((s) => s.clearFileSearch)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsScrollRef = useRef<HTMLDivElement>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
  const seededInputSelectionRafRef = useRef<number | null>(null)
  const includeInputRef = useRef<HTMLInputElement>(null)
  const excludeInputRef = useRef<HTMLInputElement>(null)

  // Leaving the search view, switching worktrees, or unmounting cancels an
  // in-flight replace-all (criterion 5) — already-written files stay written.
  useFileSearchReplaceCancelGuard({ activeWorktreeId, explorerView })

  const updateActiveSearchState = useCallback(
    (updates: Partial<NonNullable<typeof searchState>>) => {
      if (!activeWorktreeId) {
        return
      }
      updateFileSearchState(activeWorktreeId, updates)
    },
    [activeWorktreeId, updateFileSearchState]
  )

  const clearActiveSearch = useCallback(() => {
    if (!activeWorktreeId) {
      return
    }
    clearFileSearch(activeWorktreeId)
  }, [activeWorktreeId, clearFileSearch])

  const toggleActiveCollapsedFile = useCallback(
    (filePath: string) => {
      if (!activeWorktreeId) {
        return
      }
      toggleFileSearchCollapsedFile(activeWorktreeId, filePath)
    },
    [activeWorktreeId, toggleFileSearchCollapsedFile]
  )

  const worktreePath = activeWorktree?.path ?? null
  const { executeSearch, cancelPendingSearch } = useFileSearchRunner({
    activeWorktreeId,
    worktreePath,
    updateActiveSearchState
  })

  const focusQueryInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const getCurrentSearchQuery = useCallback(() => {
    if (!activeWorktreeId) {
      return ''
    }
    return useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.query ?? ''
  }, [activeWorktreeId])

  const selectHistoryQuery = useCallback(
    (selected: string) => {
      updateActiveSearchState({ query: selected })
      executeSearch(selected)
    },
    [executeSearch, updateActiveSearchState]
  )

  const {
    searchHistory,
    historyOpen,
    handleHistoryFocus,
    handleHistoryBlur,
    handleHistorySelect,
    recordCurrentQuery
  } = useFileSearchHistory({
    activeWorktreeId,
    getCurrentQuery: getCurrentSearchQuery,
    onSelectQuery: selectHistoryQuery,
    focusInput: focusQueryInput
  })

  const cancelSeededInputSelectionFrame = useCallback(() => {
    if (seededInputSelectionRafRef.current !== null) {
      cancelAnimationFrame(seededInputSelectionRafRef.current)
      seededInputSelectionRafRef.current = null
    }
  }, [])

  const scheduleSeededInputSelection = useCallback(() => {
    cancelSeededInputSelectionFrame()
    seededInputSelectionRafRef.current = requestAnimationFrame(() => {
      seededInputSelectionRafRef.current = null
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [cancelSeededInputSelectionFrame])

  useEffect(() => {
    return () => {
      cancelSeededInputSelectionFrame()
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    }
  }, [cancelSeededInputSelectionFrame])

  useEffect(() => {
    if (!worktreePath) {
      cancelPendingSearch()
      updateActiveSearchState({ results: null, resultOwner: null })
    }
  }, [worktreePath, cancelPendingSearch, updateActiveSearchState])

  const committedSearchResults = useMemo(
    () => ({ results: fileSearchResults, owner: fileSearchResultOwner }),
    [fileSearchResultOwner, fileSearchResults]
  )
  const deferredSearchResults = useDeferredValue(committedSearchResults)
  const searchRows = useMemo(
    () =>
      buildSearchRows(
        fileSearchQuery.trim() && worktreePath ? deferredSearchResults.results : null,
        fileSearchCollapsedFiles
      ),
    [deferredSearchResults.results, fileSearchCollapsedFiles, fileSearchQuery, worktreePath]
  )

  useEffect(() => {
    if (!activeWorktreeId || fileSearchSeedRequestId === undefined) {
      return
    }

    if (fileSearchQuery.trim()) {
      executeSearch(fileSearchQuery)
    }
    scheduleSeededInputSelection()
    consumeFileSearchSeedRequest(activeWorktreeId, fileSearchSeedRequestId)
  }, [
    activeWorktreeId,
    consumeFileSearchSeedRequest,
    executeSearch,
    fileSearchQuery,
    fileSearchSeedRequestId,
    scheduleSeededInputSelection
  ])

  useEffect(() => {
    if (!activeWorktreeId || fileSearchFocusRequestId === undefined) {
      return
    }
    inputRef.current?.focus()
  }, [activeWorktreeId, fileSearchFocusRequestId])

  const previousExplorerViewRef = useRef(explorerView)
  useEffect(() => {
    if (previousExplorerViewRef.current !== 'search' && explorerView === 'search') {
      focusQueryInput()
    }
    previousExplorerViewRef.current = explorerView
  }, [explorerView, focusQueryInput])

  const handleClearSearch = useCallback(() => {
    cancelPendingSearch()
    clearActiveSearch()
  }, [cancelPendingSearch, clearActiveSearch])

  const rerunSearch = useCallback(() => {
    if (!activeWorktreeId) {
      return
    }
    const q = useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.query ?? ''
    if (q.trim()) {
      executeSearch(q)
    }
  }, [executeSearch, activeWorktreeId])

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      updateActiveSearchState({ query: val })
      executeSearch(val)
    },
    [updateActiveSearchState, executeSearch]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) {
        return
      }
      if (e.key === 'Escape') {
        if (fileSearchQuery) {
          handleClearSearch()
        }
      }
      if (e.key === 'Enter') {
        executeSearch(fileSearchQuery)
        recordCurrentQuery()
      }
    },
    [fileSearchQuery, handleClearSearch, executeSearch, recordCurrentQuery]
  )

  const handleExpandAll = useCallback(() => {
    updateActiveSearchState({
      collapsedFiles: setAllSearchFilesCollapsed(fileSearchResults, false)
    })
  }, [fileSearchResults, updateActiveSearchState])

  const handleCollapseAll = useCallback(() => {
    updateActiveSearchState({ collapsedFiles: setAllSearchFilesCollapsed(fileSearchResults, true) })
  }, [fileSearchResults, updateActiveSearchState])

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
    [deferredSearchResults.owner, openFile, setPendingEditorReveal]
  )

  return {
    activeWorktreeId,
    queryRowProps: {
      inputRef,
      query: fileSearchQuery,
      loading: fileSearchLoading,
      caseSensitive: fileSearchCaseSensitive,
      wholeWord: fileSearchWholeWord,
      useRegex: fileSearchUseRegex,
      history: searchHistory,
      historyOpen: historyOpen && fileSearchQuery.trim() === '',
      onQueryChange: handleQueryChange,
      onKeyDown: handleKeyDown,
      onClearSearch: handleClearSearch,
      onToggleCaseSensitive: () => {
        updateActiveSearchState({ caseSensitive: !fileSearchCaseSensitive })
        rerunSearch()
      },
      onToggleWholeWord: () => {
        updateActiveSearchState({ wholeWord: !fileSearchWholeWord })
        rerunSearch()
      },
      onToggleRegex: () => {
        updateActiveSearchState({ useRegex: !fileSearchUseRegex })
        rerunSearch()
      },
      onHistoryFocus: handleHistoryFocus,
      onHistoryBlur: handleHistoryBlur,
      onHistorySelect: handleHistorySelect
    },
    filtersProps: {
      includePattern: fileSearchIncludePattern,
      excludePattern: fileSearchExcludePattern,
      includeInputRef,
      excludeInputRef,
      onIncludeChange: (value: string) => {
        updateActiveSearchState({ includePattern: value })
        rerunSearch()
      },
      onExcludeChange: (value: string) => {
        updateActiveSearchState({ excludePattern: value })
        rerunSearch()
      }
    },
    resultsProps: {
      results: deferredSearchResults.results,
      hasCommittedResults: fileSearchResults !== null,
      query: fileSearchQuery,
      loading: fileSearchLoading,
      rows: searchRows,
      scrollRef: resultsScrollRef,
      onToggleCollapsedFile: toggleActiveCollapsedFile,
      onExpandAll: handleExpandAll,
      onCollapseAll: handleCollapseAll,
      onMatchClick: handleMatchClick
    },
    focusQueryInput
  }
}
