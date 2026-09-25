import type { SearchFileResult } from '../../../../shared/code-search-types'
import type { SearchReplaceFileRecord } from './search-replace-op'
import { deriveReplacements, type SearchReplaceFlags } from './search-replace-engine'

export const REPLACE_ALL_MAX_FILES = 200

export type ReplaceAllFileStatus =
  | 'replaced'
  | 'skipped-dirty'
  | 'skipped-stale'
  | 'error'
  | 'unprocessed'

export type ReplaceAllFileOutcome = {
  filePath: string
  relativePath: string
  status: ReplaceAllFileStatus
  /** Display-ready reason for skips and errors (e.g. "changed on disk"). */
  reason?: string
  matchCount?: number
}

export type ReplacePreviewEntry = {
  filePath: string
  relativePath: string
  oldContent: string
  newContent: string
  matchCount: number
}

export type ReplaceAllRunSummary = {
  totalCandidates: number
  cancelled: boolean
  stoppedOnTransportError: boolean
  outcomes: ReplaceAllFileOutcome[]
  /** Files actually written, in write order — the undo closure. */
  writtenFiles: SearchReplaceFileRecord[]
  /** Dry-run only: derived before/after per matched file. */
  previews: ReplacePreviewEntry[]
  counts: {
    replaced: number
    skippedDirty: number
    skippedStale: number
    errors: number
    unprocessed: number
  }
}

export type ReplaceAllIo = {
  stat: (filePath: string) => Promise<{ size: number; isDirectory: boolean; mtime: number }>
  read: (filePath: string) => Promise<{ content: string; isBinary: boolean }>
  write: (filePath: string, content: string) => Promise<void>
  isDirty: (filePath: string) => boolean
  stamp: (filePath: string, content: string) => void
}

export type RunReplaceAllParams = {
  candidates: SearchFileResult[]
  query: string
  replaceTerm: string
  flags: SearchReplaceFlags
  io: ReplaceAllIo
  cancelRequested: () => boolean
  mode?: 'write' | 'dry-run'
  maxFiles?: number
}

export async function runReplaceAllAcrossFiles(params: RunReplaceAllParams): Promise<ReplaceAllRunSummary> {
  const {
    candidates,
    query,
    replaceTerm,
    flags,
    io,
    cancelRequested,
    mode = 'write',
    maxFiles = REPLACE_ALL_MAX_FILES
  } = params

  const summary: ReplaceAllRunSummary = {
    totalCandidates: candidates.length,
    cancelled: false,
    stoppedOnTransportError: false,
    outcomes: [],
    writtenFiles: [],
    previews: [],
    counts: { replaced: 0, skippedDirty: 0, skippedStale: 0, errors: 0, unprocessed: 0 }
  }

  for (const [index, file] of candidates.entries()) {
    if (index >= maxFiles) {
      summary.outcomes.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        status: 'unprocessed',
        reason: `cap reached (${maxFiles} files per run)`
      })
      summary.counts.unprocessed += 1
      continue
    }
    if (cancelRequested()) {
      summary.cancelled = true
      summary.outcomes.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        status: 'unprocessed',
        reason: 'cancelled'
      })
      summary.counts.unprocessed += 1
      continue
    }

    const outcome = await processFile(file, query, replaceTerm, flags, io, mode, summary)
    summary.outcomes.push(outcome)
    if (outcome.status === 'error' && outcome.reason === TRANSPORT_REASON) {
      // Transport loss (SSH drop, RPC failure): the remaining roster is not
      // attempted — it is unprocessed, not errored.
      summary.stoppedOnTransportError = true
      for (const rest of candidates.slice(index + 1)) {
        summary.outcomes.push({
          filePath: rest.filePath,
          relativePath: rest.relativePath,
          status: 'unprocessed',
          reason: 'stopped after transport error'
        })
        summary.counts.unprocessed += 1
      }
      break
    }
  }

  return summary
}

const TRANSPORT_REASON = 'transport error'

async function processFile(
  file: SearchFileResult,
  query: string,
  replaceTerm: string,
  flags: SearchReplaceFlags,
  io: ReplaceAllIo,
  mode: 'write' | 'dry-run',
  summary: ReplaceAllRunSummary
): Promise<ReplaceAllFileOutcome> {
  const base = { filePath: file.filePath, relativePath: file.relativePath }

  if (io.isDirty(file.filePath)) {
    summary.counts.skippedDirty += 1
    return { ...base, status: 'skipped-dirty', reason: 'unsaved editor' }
  }

  // TOCTOU baseline: taken before the read so any mutation between baseline
  // and write (the window our content could go stale in) is detectable.
  let baseline: { size: number; mtime: number } | null = null
  if (mode === 'write') {
    try {
      baseline = await io.stat(file.filePath)
    } catch (err) {
      return recordError(summary, base, err)
    }
  }

  let readResult: { content: string; isBinary: boolean }
  try {
    readResult = await io.read(file.filePath)
  } catch (err) {
    return recordError(summary, base, err)
  }
  if (readResult.isBinary) {
    summary.counts.errors += 1
    return { ...base, status: 'error', reason: 'binary file' }
  }

  const derived = deriveReplacements(readResult.content, query, replaceTerm, flags)

  if (derived.matchCount === 0) {
    summary.counts.skippedStale += 1
    return { ...base, status: 'skipped-stale', reason: 'no longer matches', matchCount: 0 }
  }

  if (mode === 'dry-run') {
    summary.counts.replaced += 1
    summary.previews.push({
      filePath: file.filePath,
      relativePath: file.relativePath,
      oldContent: readResult.content,
      newContent: derived.newContent,
      matchCount: derived.matchCount
    })
    return { ...base, status: 'replaced', matchCount: derived.matchCount }
  }

  if (derived.newContent === readResult.content) {
    summary.counts.skippedStale += 1
    return { ...base, status: 'skipped-stale', reason: 'already matches replacement', matchCount: derived.matchCount }
  }

  // TOCTOU recheck, right before the write.
  let recheck: { size: number; mtime: number }
  try {
    recheck = await io.stat(file.filePath)
  } catch (err) {
    return recordError(summary, base, err)
  }
  if (baseline && (baseline.mtime !== recheck.mtime || baseline.size !== recheck.size)) {
    summary.counts.skippedStale += 1
    return { ...base, status: 'skipped-stale', reason: 'changed on disk', matchCount: derived.matchCount }
  }

  try {
    await io.write(file.filePath, derived.newContent)
  } catch (err) {
    return recordError(summary, base, err)
  }
  io.stamp(file.filePath, derived.newContent)

  summary.writtenFiles.push({
    filePath: file.filePath,
    relativePath: file.relativePath,
    oldContent: readResult.content,
    newContent: derived.newContent
  })
  summary.counts.replaced += 1
  return { ...base, status: 'replaced', matchCount: derived.matchCount }
}

function recordError(
  summary: ReplaceAllRunSummary,
  base: { filePath: string; relativePath: string },
  err: unknown
): ReplaceAllFileOutcome {
  summary.counts.errors += 1
  return { ...base, status: 'error', reason: describeError(err) }
}

// Why: per-file content problems (too large, binary, permission, deleted) let
// the run continue; anything else is treated as transport loss and stops the
// run — the stop taxonomy the spec fixes.
function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  if (
    /too large|binary|eperm|eacces|permission|enoent|no such file|is a directory/.test(lower)
  ) {
    return message
  }
  return TRANSPORT_REASON
}
