import type { SearchReplaceOp } from './search-replace-op'
import type { ReplaceAllIo } from './search-replace-all-runner'

export type UndoFileStatus = 'restored' | 'skipped-dirty' | 'skipped-stale' | 'error' | 'unprocessed'

export type UndoOutcome = {
  filePath: string
  relativePath: string
  status: UndoFileStatus
  reason?: string
}

export type UndoSummary = {
  totalFiles: number
  stoppedOnTransportError: boolean
  outcomes: UndoOutcome[]
  counts: {
    restored: number
    skippedDirty: number
    skippedStale: number
    errors: number
    unprocessed: number
  }
}

const TRANSPORT_REASON = 'transport error'

// Undo mirrors the replace runner's safety rails: dirty buffers are skipped,
// the TOCTOU baseline is re-checked, and a file whose content is neither the
// replaced text nor the original (an agent edited it in between) is left alone.
export async function undoReplaceOp(params: { op: SearchReplaceOp; io: ReplaceAllIo }): Promise<UndoSummary> {
  const { op, io } = params
  const summary: UndoSummary = {
    totalFiles: op.files.length,
    stoppedOnTransportError: false,
    outcomes: [],
    counts: { restored: 0, skippedDirty: 0, skippedStale: 0, errors: 0, unprocessed: 0 }
  }

  for (const [index, record] of op.files.entries()) {
    const base = { filePath: record.filePath, relativePath: record.relativePath }

    if (io.isDirty(record.filePath)) {
      summary.counts.skippedDirty += 1
      summary.outcomes.push({ ...base, status: 'skipped-dirty', reason: 'unsaved editor' })
      continue
    }

    let baseline: { size: number; mtime: number }
    try {
      baseline = await io.stat(record.filePath)
    } catch (err) {
      if (recordTransportStop(summary, base, err, op.files.slice(index + 1))) {
        break
      }
      continue
    }

    let current: string
    try {
      const read = await io.read(record.filePath)
      current = read.content
    } catch (err) {
      if (recordTransportStop(summary, base, err, op.files.slice(index + 1))) {
        break
      }
      continue
    }

    if (current === record.oldContent) {
      summary.counts.skippedStale += 1
      summary.outcomes.push({ ...base, status: 'skipped-stale', reason: 'already undone' })
      continue
    }
    if (current !== record.newContent) {
      summary.counts.skippedStale += 1
      summary.outcomes.push({ ...base, status: 'skipped-stale', reason: 'changed on disk since replace' })
      continue
    }

    let recheck: { size: number; mtime: number }
    try {
      recheck = await io.stat(record.filePath)
    } catch (err) {
      if (recordTransportStop(summary, base, err, op.files.slice(index + 1))) {
        break
      }
      continue
    }
    if (baseline.mtime !== recheck.mtime || baseline.size !== recheck.size) {
      summary.counts.skippedStale += 1
      summary.outcomes.push({ ...base, status: 'skipped-stale', reason: 'changed on disk' })
      continue
    }

    try {
      await io.write(record.filePath, record.oldContent)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (describeError(message) === TRANSPORT_REASON) {
        summary.stoppedOnTransportError = true
        summary.counts.errors += 1
        summary.outcomes.push({ ...base, status: 'error', reason: TRANSPORT_REASON })
        for (const rest of op.files.slice(index + 1)) {
          summary.counts.unprocessed += 1
          summary.outcomes.push({
            filePath: rest.filePath,
            relativePath: rest.relativePath,
            status: 'unprocessed',
            reason: 'stopped after transport error'
          })
        }
        break
      }
      summary.counts.errors += 1
      summary.outcomes.push({ ...base, status: 'error', reason: message })
      continue
    }
    io.stamp(record.filePath, record.oldContent)
    summary.counts.restored += 1
    summary.outcomes.push({ ...base, status: 'restored' })
  }

  return summary
}

function recordTransportStop(
  summary: UndoSummary,
  base: { filePath: string; relativePath: string },
  err: unknown,
  rest: { filePath: string; relativePath: string }[]
): boolean {
  const message = err instanceof Error ? err.message : String(err)
  summary.counts.errors += 1
  summary.outcomes.push({ ...base, status: 'error', reason: describeError(message) })
  if (describeError(message) !== TRANSPORT_REASON) {
    return false
  }
  summary.stoppedOnTransportError = true
  for (const file of rest) {
    summary.counts.unprocessed += 1
    summary.outcomes.push({
      filePath: file.filePath,
      relativePath: file.relativePath,
      status: 'unprocessed',
      reason: 'stopped after transport error'
    })
  }
  return true
}

// Same stop taxonomy as the replace runner: content problems continue, contact
// loss stops the run.
function describeError(message: string): string {
  const lower = message.toLowerCase()
  if (/too large|binary|eperm|eacces|permission|enoent|no such file|is a directory/.test(lower)) {
    return message
  }
  return TRANSPORT_REASON
}
