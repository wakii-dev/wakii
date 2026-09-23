import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { RightSidebarExplorerView } from '../../../../shared/ui-chrome-types'

// Why: a replace-all run must not outlive the panel the user drove it from.
// Leaving the search view, switching worktrees, or unmounting the explorer all
// set cancelRequested so the runner stops between files; already-written files
// stay written and are reported in the summary.
export function useFileSearchReplaceCancelGuard({
  activeWorktreeId,
  explorerView
}: {
  activeWorktreeId: string | null
  explorerView: RightSidebarExplorerView
}): void {
  const requestCancelFileReplaceAll = useAppStore((s) => s.requestCancelFileReplaceAll)

  const previousViewRef = useRef(explorerView)
  useEffect(() => {
    const previousView = previousViewRef.current
    previousViewRef.current = explorerView
    if (
      previousView === 'search' &&
      explorerView !== 'search' &&
      activeWorktreeId &&
      useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.replaceAllInProgress
    ) {
      requestCancelFileReplaceAll(activeWorktreeId)
    }
  }, [explorerView, activeWorktreeId, requestCancelFileReplaceAll])

  useEffect(() => {
    return () => {
      if (
        activeWorktreeId &&
        useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.replaceAllInProgress
      ) {
        requestCancelFileReplaceAll(activeWorktreeId)
      }
    }
  }, [activeWorktreeId, requestCancelFileReplaceAll])
}
