import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { buildReplaceAllIo } from './search-replace-runtime-io'
import { executeFileReplaceAll } from './search-replace-run-execute'
import {
  captureFileExplorerOperationGuard,
  getFileExplorerOperationOwner,
  getFileExplorerOwnerUnresolvedMessage
} from './file-explorer-operation-owner'
import type { SearchReplaceFlags } from './search-replace-engine'
import type { SearchFileResult } from '../../../../shared/code-search-types'

export type UseFileSearchReplaceRunParams = {
  activeWorktreeId: string | null
  worktreePath: string | null
}

export type UseFileSearchReplaceRunResult = {
  runReplaceAll: (params: {
    candidates: SearchFileResult[]
    query: string
    replaceTerm: string
    flags: SearchReplaceFlags
  }) => Promise<void>
}

// Confirmed run wiring: the owner guard is captured fresh at confirm time so
// an SSH/runtime ownership change between preview and confirm is rejected.
export function useFileSearchReplaceRun({
  activeWorktreeId,
  worktreePath
}: UseFileSearchReplaceRunParams): UseFileSearchReplaceRunResult {
  const runReplaceAll = useCallback(
    async ({
      candidates,
      query,
      replaceTerm,
      flags
    }: {
      candidates: SearchFileResult[]
      query: string
      replaceTerm: string
      flags: SearchReplaceFlags
    }) => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      const worktreeId = activeWorktreeId
      try {
        await executeFileReplaceAll({
          candidates,
          query,
          replaceTerm,
          flags,
          captureGuard: () =>
            captureFileExplorerOperationGuard(worktreeId, getFileExplorerOperationOwner(worktreeId)),
          buildIo: (route) =>
            buildReplaceAllIo({
              settings: route.settings,
              worktreeId,
              worktreePath,
              connectionId: route.connectionId,
              expectedExecutionHostId: route.expectedExecutionHostId,
              expectedSshTargetId: route.expectedSshTargetId,
              expectedSshConnectionGeneration: route.expectedSshConnectionGeneration
            }),
          callbacks: {
            begin: () => useAppStore.getState().beginFileReplaceAll(worktreeId),
            finish: (op) => useAppStore.getState().finishFileReplaceAll(worktreeId, op),
            cancelRequested: () =>
              useAppStore.getState().fileSearchStateByWorktree[worktreeId]?.cancelRequested ?? false,
            notifySummary: (summary) => {
              const { counts } = summary
              if (summary.stoppedOnTransportError) {
                toast.error(
                  translate(
                    'auto.components.right.sidebar.useFileSearchReplaceRun.transportStopped',
                    'Replace stopped — lost contact with the workspace. Already-written files were kept.'
                  )
                )
              }
              toast.success(
                translate(
                  'auto.components.right.sidebar.useFileSearchReplaceRun.summary',
                  'Replaced {{replaced}} — skipped unsaved {{dirty}}, stale {{stale}}, errors {{errors}}, not attempted {{unprocessed}}.',
                  {
                    replaced: counts.replaced,
                    dirty: counts.skippedDirty,
                    stale: counts.skippedStale,
                    errors: counts.errors,
                    unprocessed: counts.unprocessed
                  }
                )
              )
            }
          }
        })
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : getFileExplorerOwnerUnresolvedMessage()
        )
      }
    },
    [activeWorktreeId, worktreePath]
  )

  return { runReplaceAll }
}
