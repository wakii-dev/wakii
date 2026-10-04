import { useCallback, useEffect, useRef, type RefObject } from 'react'

// Why: seeded query input (focus + select + pending seed request execution)
// and view-entry focus effects live here so useFileSearchPanel stays within
// the max-lines budget.
export function useFileSearchInputFocus(args: {
  inputRef: RefObject<HTMLInputElement | null>
  activeWorktreeId: string | null
  worktreePath: string | null
  fileSearchQuery: string
  fileSearchSeedRequestId: number | undefined
  fileSearchFocusRequestId: number | undefined
  explorerView: 'files' | 'search'
  executeSearch: (query: string) => void
  cancelPendingSearch: () => void
  updateActiveSearchState: (updates: { results: null; resultOwner: null; error: null }) => void
  consumeFileSearchSeedRequest: (worktreeId: string, requestId: number) => void
}): void {
  const {
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
  } = args

  const seededInputSelectionRafRef = useRef<number | null>(null)

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
  }, [cancelSeededInputSelectionFrame, inputRef])

  useEffect(() => {
    return () => {
      cancelSeededInputSelectionFrame()
    }
  }, [cancelSeededInputSelectionFrame])

  useEffect(() => {
    if (!worktreePath) {
      cancelPendingSearch()
      updateActiveSearchState({ results: null, resultOwner: null, error: null })
    }
  }, [worktreePath, cancelPendingSearch, updateActiveSearchState])

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
  }, [activeWorktreeId, fileSearchFocusRequestId, inputRef])

  const previousExplorerViewRef = useRef(explorerView)
  useEffect(() => {
    if (previousExplorerViewRef.current !== 'search' && explorerView === 'search') {
      inputRef.current?.focus()
    }
    previousExplorerViewRef.current = explorerView
  }, [explorerView, inputRef])
}
