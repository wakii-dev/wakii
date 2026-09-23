import { useCallback, useMemo, useState } from 'react'
import type { SearchResult } from '../../../../shared/code-search-types'
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
import type { FileSearchPanelModel } from './file-search-panel-model'
import type { ReplaceDisabledReason } from './SearchQueryRow'

type ReplacePanelArgs = {
  activeWorktreeId: string | null
  worktreePath: string | null
  results: SearchResult | null
  query: string
  replaceTerm: string
  replaceVisible: boolean
  flags: { caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }
  replaceAllInProgress: boolean
  updateActiveSearchState: (updates: { replaceVisible?: boolean; replaceQuery?: string }) => void
  rerunSearch: () => void
}

type ReplacePanel = Pick<
  FileSearchPanelModel['queryRowProps'],
  'replaceDisabledReason' | 'onReplaceUndo' | 'onToggleReplaceVisible' | 'onReplaceQueryChange' | 'onReplaceAll'
> & {
  replacePreviewProps: FileSearchPanelModel['replacePreviewProps']
}

// Why: the replace side of the search panel (block matrix, preview dry-run,
// confirm, undo entry points) lives here so useFileSearchPanel stays within
// the max-lines budget and the two concerns stay separately readable.
export function useFileSearchReplacePanel(args: ReplacePanelArgs): ReplacePanel {
  const {
    activeWorktreeId,
    worktreePath,
    results,
    query,
    replaceTerm,
    replaceVisible,
    flags,
    replaceAllInProgress,
    updateActiveSearchState,
    rerunSearch
  } = args

  // Why: computed here (not the component) so the block matrix and the
  // up-front regex compile share one source of truth with the runner.
  const replaceDisabledReason = useMemo<ReplaceDisabledReason | null>(() => {
    if (!results || results.files.length === 0) {
      return 'no-results'
    }
    if (replaceAllInProgress) {
      return 'running'
    }
    if (results.truncated) {
      return 'truncated'
    }
    if (results.files.length > REPLACE_ALL_MAX_FILES) {
      return 'cap'
    }
    if (
      flags.useRegex &&
      isInvalidReplaceRegex(query, {
        caseSensitive: flags.caseSensitive,
        wholeWord: flags.wholeWord,
        useRegex: true
      })
    ) {
      return 'invalid-regex'
    }
    return null
  }, [results, replaceAllInProgress, flags, query])

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
    candidates: results?.files ?? [],
    query,
    replaceTerm,
    flags,
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
    updateActiveSearchState({ replaceVisible: !replaceVisible })
  }, [updateActiveSearchState, replaceVisible])

  const handleReplaceQueryChange = useCallback(
    (e: { target: { value: string } }) => {
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
    if (!results) {
      return 0
    }
    return results.files.reduce((total, file) => total + (file.matchCount ?? 0), 0)
  }, [results])

  const handleConfirmReplacePreview = useCallback(() => {
    setReplacePreviewOpen(false)
    replacePreview.dismiss()
    void runReplaceAll({
      candidates: results?.files ?? [],
      query,
      replaceTerm,
      flags
    }).then(() => {
      rerunSearch()
    })
  }, [replacePreview, runReplaceAll, results, query, replaceTerm, flags, rerunSearch])

  return {
    replaceDisabledReason,
    onReplaceUndo: handleReplaceUndo,
    onToggleReplaceVisible: handleToggleReplaceVisible,
    onReplaceQueryChange: handleReplaceQueryChange,
    onReplaceAll: handleReplaceAll,
    replacePreviewProps: {
      open: replacePreviewOpen,
      onClose: closeReplacePreview,
      onConfirm: handleConfirmReplacePreview,
      loading: replacePreview.loading,
      summary: replacePreview.summary,
      replaceTerm,
      totalOccurrences: totalReplaceOccurrences
    }
  }
}
