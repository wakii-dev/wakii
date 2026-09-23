import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { buildReplaceAllIo } from './search-replace-runtime-io'
import { undoReplaceOp } from './search-replace-undo'
import {
  captureFileExplorerOperationGuard,
  getFileExplorerOperationOwner,
  getFileExplorerOwnerUnresolvedMessage
} from './file-explorer-operation-owner'

// Undo rides the same owner guard + runtime IO as the confirmed replace, and
// clears the stored op when the run completes so double-undo is impossible.
export function useFileSearchReplaceUndo({
  activeWorktreeId,
  worktreePath
}: {
  activeWorktreeId: string | null
  worktreePath: string | null
}): { undoReplaceAll: () => Promise<void> } {
  const undoReplaceAll = useCallback(async () => {
    if (!activeWorktreeId || !worktreePath) {
      return
    }
    const worktreeId = activeWorktreeId
    const op = useAppStore.getState().fileSearchStateByWorktree[worktreeId]?.lastReplaceOp
    if (!op || op.files.length === 0) {
      return
    }
    try {
      const guard = captureFileExplorerOperationGuard(
        worktreeId,
        getFileExplorerOperationOwner(worktreeId)
      )
      const io = buildReplaceAllIo({
        settings: guard.route.settings,
        worktreeId,
        worktreePath,
        connectionId: guard.route.connectionId,
        expectedExecutionHostId: guard.route.expectedExecutionHostId,
        expectedSshTargetId: guard.route.expectedSshTargetId,
        expectedSshConnectionGeneration: guard.route.expectedSshConnectionGeneration
      })
      const summary = await undoReplaceOp({ op, io })
      useAppStore.getState().clearLastFileReplaceOp(worktreeId)
      if (summary.stoppedOnTransportError) {
        toast.error(
          translate(
            'auto.components.right.sidebar.useFileSearchReplaceUndo.transportStopped',
            'Undo stopped — lost contact with the workspace. Restorable files were kept.'
          )
        )
      }
      toast.success(
        translate(
          'auto.components.right.sidebar.useFileSearchReplaceUndo.summary',
          'Restored {{restored}} — skipped unsaved {{dirty}}, changed-on-disk/undone {{stale}}, errors {{errors}}, not attempted {{unprocessed}}.',
          {
            restored: summary.counts.restored,
            dirty: summary.counts.skippedDirty,
            stale: summary.counts.skippedStale,
            errors: summary.counts.errors,
            unprocessed: summary.counts.unprocessed
          }
        )
      )
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : getFileExplorerOwnerUnresolvedMessage()
      )
    }
  }, [activeWorktreeId, worktreePath])

  return { undoReplaceAll }
}
