import type React from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import type { SearchFileResult, SearchMatch } from '../../../../shared/code-search-types'
import { buildSearchRows, setAllSearchFilesCollapsed } from './search-rows'
import { cancelRevealFrame, openMatchResult } from './search-match-open'
import type { FileSearchPanelModel } from './file-search-panel-model'
import { useFileSearchRunner } from './useFileSearchRunner'
import { useFileSearchHistory } from './use-file-search-history'
import { useFileSearchReplaceCancelGuard } from './use-file-search-replace-cancel'
import { useFileSearchReplacePreview } from './use-file-search-replace-preview'
import { useFileSearchReplaceRun } from './use-file-search-replace-run'
import { useFileSearchReplaceUndo } from './use-file-search-replace-undo'
import { isInvalidReplaceRegex } from './search-replace-engine'
import { REPLACE_ALL_MAX_FILES } from './search-replace-all-runner'
import { buildReplaceAllIo } from './search-replace-runtime-io'
import { toast } from 'sonner'
import {
  captureFileExplorerOperationGuard,
  getFileExplorerOperationOwner,
  getFileExplorerOwnerUnresolvedMessage
} from './file-explorer-operation-owner'
import type { ReplaceDisabledReason } from './SearchQueryRow'

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

  // Why: computed in the panel (not the component) so the block matrix and the
  // up-front regex compile share one source of truth with the runner.
  const replaceDisabledReason = useMemo<ReplaceDisabledReason | null>(() => {
    if (!fileSearchResults || fileSearchResults.files.length === 0) {
      return 'no-results'
    }
    if (fileSearchReplaceAllInProgress) {
      return 'running'
    }
    if (fileSearchResults.truncated) {
      return 'truncated'
    }
    if (fileSearchResults.files.length > REPLACE_ALL_MAX_FILES) {
      return 'cap'
    }
    if (
      fileSearchUseRegex &&
      isInvalidReplaceRegex(fileSearchQuery, {
        caseSensitive: fileSearchCaseSensitive,
        wholeWord: fileSearchWholeWord,
        useRegex: true
      })
    ) {
      return 'invalid-regex'
    }
    return null
  }, [
    fileSearchResults,
    fileSearchReplaceAllInProgress,
    fileSearchUseRegex,
    fileSearchQuery,
    fileSearchCaseSensitive,
    fileSearchWholeWord
  ])

  const [replacePreviewOpen, setReplacePreviewOpen] = useState(false)
  const { runReplaceAll } = useFileSearchReplaceRun({ activeWorktreeId, worktreePath })
  const { undoReplaceAll } = useFileSearchReplaceUndo({ activeWorktreeId, worktreePath })

  const handleReplaceUndo = useCallback(() => {
    void undoReplaceAll()
  }, [undoReplaceAll])

  // Why: the preview is a real dry-run over fresh disk content — counts shown
  // in the modal come from re-derivation, never the stored match list (P0).
  const replacePreview = useFileSearchReplacePreview({
    open: replacePreviewOpen,
    candidates: fileSearchResults?.files ?? [],
    query: fileSearchQuery,
    replaceTerm: fileSearchReplaceQuery,
    flags: {
      caseSensitive: fileSearchCaseSensitive,
      wholeWord: fileSearchWholeWord,
      useRegex: fileSearchUseRegex
    },
    buildIo: () => {
      const worktreeId = activeWorktreeId
      if (!worktreeId) {
        throw new Error(getFileExplorerOwnerUnresolvedMessage())
      }
      const route = captureFileExplorerOperationGuard(
        worktreeId,
        getFileExplorerOperationOwner(worktreeId)
      ).route
      return buildReplaceAllIo({
        settings: route.settings,
        worktreeId,
        worktreePath,
        connectionId: route.connectionId,
        expectedExecutionHostId: route.expectedExecutionHostId,
        expectedSshTargetId: route.expectedSshTargetId,
        expectedSshConnectionGeneration: route.expectedSshConnectionGeneration
      })
    }
  })

  const handleToggleReplaceVisible = useCallback(() => {
    updateActiveSearchState({ replaceVisible: !fileSearchReplaceVisible })
  }, [updateActiveSearchState, fileSearchReplaceVisible])

  const handleReplaceQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateActiveSearchState({ replaceQuery: e.target.value })
    },
    [updateActiveSearchState]
  )

  const handleReplaceAll = useCallback(() => {
    if (replaceDisabledReason !== null || !activeWorktreeId) {
      return
    }
    // Reject unresolved/changed workspace ownership before the preview opens —
    // the confirmed run re-captures the guard at confirm time.
    try {
      captureFileExplorerOperationGuard(
        activeWorktreeId,
        getFileExplorerOperationOwner(activeWorktreeId)
      )
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : getFileExplorerOwnerUnresolvedMessage())
      return
    }
    setReplacePreviewOpen(true)
  }, [replaceDisabledReason, activeWorktreeId])

  const closeReplacePreview = useCallback(() => {
    setReplacePreviewOpen(false)
    replacePreview.dismiss()
  }, [replacePreview])

  const totalReplaceOccurrences = useMemo(() => {
    if (!fileSearchResults) {
      return 0
    }
    return fileSearchResults.files.reduce((total, file) => total + (file.matchCount ?? 0), 0)
  }, [fileSearchResults])

  const handleConfirmReplacePreview = useCallback(() => {
    setReplacePreviewOpen(false)
    replacePreview.dismiss()
    void runReplaceAll({
      candidates: fileSearchResults?.files ?? [],
      query: fileSearchQuery,
      replaceTerm: fileSearchReplaceQuery,
      flags: {
        caseSensitive: fileSearchCaseSensitive,
        wholeWord: fileSearchWholeWord,
        useRegex: fileSearchUseRegex
      }
    }).then(() => {
      if (activeWorktreeId) {
        const q = useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.query ?? ''
        if (q.trim()) {
          executeSearch(q)
        }
      }
    })
  }, [
    replacePreview,
    runReplaceAll,
    fileSearchResults,
    fileSearchQuery,
    fileSearchReplaceQuery,
    fileSearchCaseSensitive,
    fileSearchWholeWord,
    fileSearchUseRegex,
    activeWorktreeId,
    executeSearch
  ])

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
      replaceVisible: fileSearchReplaceVisible,
      replaceQuery: fileSearchReplaceQuery,
      replaceDisabledReason,
      hasReplaceUndo: fileSearchHasReplaceUndo,
      onReplaceUndo: handleReplaceUndo,
      onToggleReplaceVisible: handleToggleReplaceVisible,
      onReplaceQueryChange: handleReplaceQueryChange,
      onReplaceAll: handleReplaceAll,
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
    replacePreviewProps: {
      open: replacePreviewOpen,
      onClose: closeReplacePreview,
      onConfirm: handleConfirmReplacePreview,
      loading: replacePreview.loading,
      summary: replacePreview.summary,
      replaceTerm: fileSearchReplaceQuery,
      totalOccurrences: totalReplaceOccurrences
    },
    focusQueryInput
  }
}
