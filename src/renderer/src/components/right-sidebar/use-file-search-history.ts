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
  openHistory: () => void
  closeHistory: () => void
} {
  const historyBlurCloseTimerRef = useRef<number | null>(null)
  // Why: recording needs the latest list to persist synchronously; keeping it
  // in a ref avoids side effects inside a state updater (React may re-invoke).
  const historyRef = useRef<string[]>([])
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    historyRef.current = loadSearchHistory(localStorage)
    return historyRef.current
  })
  const [historyOpen, setHistoryOpen] = useState(false)

  const recordCurrentQuery = useCallback(() => {
    if (!activeWorktreeId) {
      return
    }
    const query = getCurrentQuery()
    if (!query.trim()) {
      return
    }
    const next = recordSearchQuery(historyRef.current, query)
    historyRef.current = next
    saveSearchHistory(localStorage, next)
    setSearchHistory(next)
  }, [activeWorktreeId, getCurrentQuery])

  const handleHistoryFocus = useCallback(() => {
    // Why: focus must NOT open the history dropdown (user directive — it read
    // as a pre-filled value); only an explicit ArrowDown opens it. This only
    // cancels a pending blur-close so a just-opened dropdown survives refocus.
    if (historyBlurCloseTimerRef.current !== null) {
      clearTimeout(historyBlurCloseTimerRef.current)
      historyBlurCloseTimerRef.current = null
    }
  }, [])

  const openHistory = useCallback(() => {
    setHistoryOpen(true)
  }, [])

  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
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
    recordCurrentQuery,
    openHistory,
    closeHistory
  }
}
