import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import { useFileSearchScope } from './useFileSearchScope'
import { cancelRevealFrame } from './search-match-open'
import type { FileSearchPanelModel } from './file-search-panel-model'
import { useFileSearchRunner } from './useFileSearchRunner'
import { useFileSearchHistory } from './use-file-search-history'
import { useFileSearchReplaceCancelGuard } from './use-file-search-replace-cancel'
import { useFileSearchReplacePanel } from './use-file-search-replace-panel'
import { useFileSearchResultsPanel } from './use-file-search-results-panel'
import { useFileSearchInputFocus } from './use-file-search-input-focus'

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
  const fileSearchReplaceVisible = searchState?.replaceVisible ?? false
  const fileSearchReplaceQuery = searchState?.replaceQuery ?? ''
  const fileSearchReplaceAllInProgress = searchState?.replaceAllInProgress ?? false
  const fileSearchHasReplaceUndo = (searchState?.lastReplaceOp?.files.length ?? 0) > 0

  const updateFileSearchState = useAppStore((s) => s.updateFileSearchState)
  const consumeFileSearchSeedRequest = useAppStore((s) => s.consumeFileSearchSeedRequest)
  const toggleFileSearchCollapsedFile = useAppStore((s) => s.toggleFileSearchCollapsedFile)
  const clearFileSearch = useAppStore((s) => s.clearFileSearch)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsScrollRef = useRef<HTMLDivElement>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
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

  const isCurrentOwner = useFileSearchScope({
    activeWorktreeId,
    worktreePath,
    explorerView,
    executeSearch,
    cancelPendingSearch,
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
    recordCurrentQuery,
    openHistory,
    closeHistory
  } = useFileSearchHistory({
    activeWorktreeId,
    getCurrentQuery: getCurrentSearchQuery,
    onSelectQuery: selectHistoryQuery,
    focusInput: focusQueryInput
  })

  useEffect(() => {
    return () => {
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    }
  }, [])

  useFileSearchInputFocus({
    inputRef,
    activeWorktreeId,
    worktreePath,
    fileSearchQuery,
    fileSearchSeedRequestId,
    fileSearchFocusRequestId,
    explorerView,
    executeSearch,
    cancelPendingSearch,
    updateActiveSearchState,
    consumeFileSearchSeedRequest
  })

  const resultsPanel = useFileSearchResultsPanel({
    results: fileSearchResults,
    resultOwner: fileSearchResultOwner,
    isCurrentOwner,
    collapsedFiles: fileSearchCollapsedFiles,
    query: fileSearchQuery,
    worktreePath,
    toggleCollapsedFile: toggleActiveCollapsedFile,
    updateActiveSearchState,
    openFile,
    setPendingEditorReveal,
    revealRafRef,
    revealInnerRafRef
  })

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

  const {
    replaceDisabledReason,
    onReplaceUndo,
    onToggleReplaceVisible,
    onReplaceQueryChange,
    onReplaceAll,
    replacePreviewProps
  } = useFileSearchReplacePanel({
    activeWorktreeId,
    worktreePath,
    results: fileSearchResults,
    query: fileSearchQuery,
    replaceTerm: fileSearchReplaceQuery,
    replaceVisible: fileSearchReplaceVisible,
    flags: {
      caseSensitive: fileSearchCaseSensitive,
      wholeWord: fileSearchWholeWord,
      useRegex: fileSearchUseRegex
    },
    replaceAllInProgress: fileSearchReplaceAllInProgress,
    updateActiveSearchState,
    rerunSearch
  })

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
        e.preventDefault()
        e.stopPropagation()
        inputRef.current?.blur()
        closeHistory()
        if (fileSearchQuery) {
          handleClearSearch()
        }
      }
      if (e.key === 'ArrowDown') {
        // Why: history is opt-in (VS Code behavior) — never auto-opened on focus.
        e.preventDefault()
        openHistory()
      }
      if (e.key === 'Enter') {
        executeSearch(fileSearchQuery)
        recordCurrentQuery()
      }
    },
    [fileSearchQuery, handleClearSearch, executeSearch, recordCurrentQuery, closeHistory, openHistory]
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
      replaceVisible: fileSearchReplaceVisible,
      replaceQuery: fileSearchReplaceQuery,
      replaceDisabledReason,
      hasReplaceUndo: fileSearchHasReplaceUndo,
      onReplaceUndo,
      onToggleReplaceVisible,
      onReplaceQueryChange,
      onReplaceAll,
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
      results: resultsPanel.results,
      error: resultsPanel.resultsAreCurrent ? searchState?.error : null,
      hasCommittedResults: resultsPanel.resultsAreCurrent && fileSearchResults !== null,
      query: fileSearchQuery,
      loading: fileSearchLoading,
      rows: resultsPanel.rows,
      scrollRef: resultsScrollRef,
      onToggleCollapsedFile: resultsPanel.onToggleCollapsedFile,
      onExpandAll: resultsPanel.onExpandAll,
      onCollapseAll: resultsPanel.onCollapseAll,
      onMatchClick: resultsPanel.onMatchClick
    },
    replacePreviewProps,
    focusQueryInput
  }
}
