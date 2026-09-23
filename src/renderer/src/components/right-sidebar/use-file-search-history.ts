import { useCallback, useRef, useState } from 'react'
import { loadSearchHistory, recordSearchQuery, saveSearchHistory } from './file-search-history'

type UseFileSearchHistoryArgs = {
  activeWorktreeId: string | null
  getCurrentQuery: () => string
  onSelectQuery: (query: string) => void
  focusInput: () => void
}

/** Recent-queries dropdown state for the file search panel (localStorage-backed). */
export function useFileSearchHistory({
  activeWorktreeId,
  getCurrentQuery,
  onSelectQuery,
  focusInput
}: UseFileSearchHistoryArgs): {
  searchHistory: string[]
  historyOpen: boolean
  handleHistoryFocus: () => void
  handleHistoryBlur: () => void
  handleHistorySelect: (selected: string) => void
  recordCurrentQuery: () => void
} {
  const historyBlurCloseTimerRef = useRef<number | null>(null)

  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    loadSearchHistory(localStorage)
  )
  const [historyOpen, setHistoryOpen] = useState(false)

  const recordCurrentQuery = useCallback(() => {
    if (!activeWorktreeId) {
      return
    }
    const query = getCurrentQuery()
    if (!query.trim()) {
      return
    }
    setSearchHistory((current) => {
      const next = recordSearchQuery(current, query)
      saveSearchHistory(localStorage, next)
      return next
    })
  }, [activeWorktreeId, getCurrentQuery])

  const handleHistoryFocus = useCallback(() => {
    if (historyBlurCloseTimerRef.current !== null) {
      clearTimeout(historyBlurCloseTimerRef.current)
      historyBlurCloseTimerRef.current = null
    }
    setHistoryOpen(true)
  }, [])

  const handleHistoryBlur = useCallback(() => {
    recordCurrentQuery()
    if (historyBlurCloseTimerRef.current !== null) {
      clearTimeout(historyBlurCloseTimerRef.current)
    }
    // Why: delay so a click on a history item (which fires after blur)
    // still lands while the dropdown is mounted.
    historyBlurCloseTimerRef.current = window.setTimeout(() => {
      historyBlurCloseTimerRef.current = null
      setHistoryOpen(false)
    }, 150)
  }, [recordCurrentQuery])

  const handleHistorySelect = useCallback(
    (selected: string) => {
      setHistoryOpen(false)
      onSelectQuery(selected)
      focusInput()
    },
    [focusInput, onSelectQuery]
  )

  return {
    searchHistory,
    historyOpen,
    handleHistoryFocus,
    handleHistoryBlur,
    handleHistorySelect,
    recordCurrentQuery
  }
}
