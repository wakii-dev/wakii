import type { SearchFileResult } from '../../../../shared/code-search-types'
import {
  runReplaceAllAcrossFiles,
  type ReplaceAllIo,
  type ReplaceAllRunSummary
} from './search-replace-all-runner'
import type { SearchReplaceFlags } from './search-replace-engine'
import type { SearchReplaceOp } from './search-replace-op'
import type { FileExplorerOperationGuard, FileExplorerOperationRoute } from './file-explorer-operation-owner'

export type FileReplaceAllRunCallbacks = {
  begin: () => void
  finish: (op: SearchReplaceOp | null) => void
  cancelRequested: () => boolean
  notifySummary: (summary: ReplaceAllRunSummary) => void
}

export type ExecuteFileReplaceAllParams = {
  candidates: SearchFileResult[]
  query: string
  replaceTerm: string
  flags: SearchReplaceFlags
  // Throws when the workspace owner is unresolved — the run must not start.
  captureGuard: () => FileExplorerOperationGuard
  buildIo: (route: FileExplorerOperationRoute) => ReplaceAllIo
  callbacks: FileReplaceAllRunCallbacks
}

// The confirmed replace pass: owner guard first (no begin on unresolved), then
// begin → write run → finish(op|null) — finish always runs so the in-progress
// flag can never stick after a failure.
export async function executeFileReplaceAll(params: ExecuteFileReplaceAllParams): Promise<void> {
  const { candidates, query, replaceTerm, flags, captureGuard, buildIo, callbacks } = params

  const guard = captureGuard()
  callbacks.begin()
  try {
    const summary = await runReplaceAllAcrossFiles({
      candidates,
      query,
      replaceTerm,
      flags,
      io: buildIo(guard.route),
      cancelRequested: callbacks.cancelRequested,
      mode: 'write'
    })
    callbacks.finish(
      summary.writtenFiles.length > 0
        ? { kind: 'replace-all', at: Date.now(), files: summary.writtenFiles }
        : null
    )
    callbacks.notifySummary(summary)
  } catch (err) {
    callbacks.finish(null)
    throw err
  }
}
