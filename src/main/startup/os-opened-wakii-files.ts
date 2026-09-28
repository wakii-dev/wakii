import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WakiiFileOpenPayload } from '../../shared/wakii-file-open-payload'
import {
  MAX_WAKII_DOCUMENT_BYTES,
  decodeWakiiContents,
  isWakiiDocumentName
} from '../ipc/wakii-documents'

// Why: a shell can only ever hand over the files the user selected; anything past this is a
// runaway argv, and buffering it unbounded would pin the paths for the whole session.
// Mirrors MAX_PENDING_OS_OPENED_MARKDOWN_FILES.
export const MAX_PENDING_OS_OPENED_WAKII_FILES = 32

/**
 * Absolute .wakii paths an OS "Open With" put on a launch or second-instance argv.
 *
 * Clones markdownPathsFromArguments (file:// defensiveness, win32 casing) with the .wakii
 * extension check; see that function for the platform notes.
 */
export function wakiiPathsFromArguments(
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform
): string[] {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const seen = new Set<string>()
  const paths: string[] = []
  for (const rawArgument of argv) {
    if (!rawArgument || rawArgument.startsWith('-')) {
      continue
    }
    let argument: string | null = null
    if (rawArgument.startsWith('file://')) {
      try {
        argument = fileURLToPath(rawArgument, { windows: platform === 'win32' })
      } catch {
        argument = null
      }
    } else {
      argument = pathApi.isAbsolute(rawArgument) ? rawArgument : null
    }
    if (!argument || !isWakiiDocumentName(argument)) {
      continue
    }
    const normalized = pathApi.normalize(argument)
    // Why lowercased on win32: the shell round-trips drive letters and 8.3 casing
    // inconsistently, and two spellings of one path must not open two tabs.
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    paths.push(normalized)
  }
  return paths
}

/**
 * Buffers .wakii paths the OS handed us until a renderer can receive them.
 *
 * Mirrors OsOpenedMarkdownFileState: main pushes when a window is already live, and the
 * renderer pulls the same buffer when its listener attaches, so a cold-start "Open With"
 * that lands before mount is not dropped.
 */
export class OsOpenedWakiiFileState {
  private pending: string[] = []

  /** Returns true when argv carried at least one .wakii path. */
  capture(argv: readonly string[], publish?: () => void): boolean {
    return this.add(wakiiPathsFromArguments(argv), publish)
  }

  /** Returns true when at least one path was a .wakii document. */
  captureFilePaths(filePaths: readonly string[], publish?: () => void): boolean {
    return this.add(wakiiPathsFromArguments(filePaths), publish)
  }

  consume(): string[] {
    const pending = this.pending
    this.pending = []
    return pending
  }

  /** Puts an undelivered batch back at the front so the next renderer still receives it. */
  restore(filePaths: readonly string[]): void {
    this.pending = [...filePaths, ...this.pending].slice(0, MAX_PENDING_OS_OPENED_WAKII_FILES)
  }

  private add(filePaths: readonly string[], publish?: () => void): boolean {
    if (filePaths.length === 0) {
      return false
    }
    const merged = [...this.pending]
    let index = 0
    for (; index < filePaths.length; index++) {
      if (merged.length >= MAX_PENDING_OS_OPENED_WAKII_FILES) {
        break
      }
      const filePath = filePaths[index]!
      if (!merged.includes(filePath)) {
        merged.push(filePath)
      }
    }
    if (index < filePaths.length) {
      // Why logged: the cap drops the tail of an oversized selection, and a file the
      // user explicitly asked to open must not vanish without leaving a trace.
      console.warn(
        `[os-open] Dropped ${filePaths.length - index} of ${filePaths.length} OS-opened .wakii files; the pending queue is capped at ${MAX_PENDING_OS_OPENED_WAKII_FILES}.`
      )
    }
    this.pending = merged.slice(0, MAX_PENDING_OS_OPENED_WAKII_FILES)
    publish?.()
    return true
  }
}

/**
 * A decoded `.wakii` payload plus the raw-content hash of what was read. `contentHash` is
 * null only when the file was unreadable; a readable-but-invalid file still carries a hash,
 * which dedupe ignores because error payloads always re-deliver.
 */
export type ResolvedWakiiFileOpen = {
  payload: WakiiFileOpenPayload
  contentHash: string | null
}

/** Resolves OS-handed paths into per-file payloads. Never throws for an individual file. */
export async function resolveOpenedWakiiFiles(
  filePaths: readonly string[]
): Promise<ResolvedWakiiFileOpen[]> {
  const resolved: ResolvedWakiiFileOpen[] = []
  for (const filePath of filePaths) {
    let payload: WakiiFileOpenPayload
    let contentHash: string | null = null
    try {
      // Why stat first: the shell can hand over arbitrarily large paths, and the size cap
      // must reject them BEFORE a read pins gigabytes in the main process.
      const stats = await stat(filePath)
      if (stats.size > MAX_WAKII_DOCUMENT_BYTES) {
        payload = wakiiTooLarge(filePath)
      } else {
        const contents = await readFile(filePath, 'utf8')
        // Why hash the raw bytes: identical content under the same path is the skip signal;
        // formatting-only differences still count as a change.
        contentHash = createHash('sha256').update(contents).digest('hex')
        payload = decodeWakiiContents(filePath, contents)
      }
    } catch (error) {
      payload = {
        path: filePath,
        error: {
          code: 'io',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
    resolved.push({ payload, contentHash })
  }
  return resolved
}

function wakiiTooLarge(filePath: string): WakiiFileOpenPayload {
  return {
    path: filePath,
    error: { code: 'too-large', message: `File exceeds ${MAX_WAKII_DOCUMENT_BYTES} bytes` }
  }
}

/**
 * Map key for the delivered-hash table. Why normalized like the capture queue: on win32 the
 * shell round-trips drive-letter/8.3 casing, and one file spelled two ways must not dedupe
 * against itself inconsistently (the renderer still receives the raw path).
 */
function deliveredKey(filePath: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? filePath.toLowerCase() : filePath
}

/**
 * Keeps files worth delivering: every failed decode re-delivers (a retry after the user
 * fixed or moved the file must surface its error again), while successfully decoded files
 * only deliver when their content changed for the path — the spec's dedupe owner is the
 * main-process map of path → content hash.
 */
export function filterUnchangedWakiiFiles(
  files: readonly ResolvedWakiiFileOpen[],
  deliveredHashes: Map<string, string>,
  platform: NodeJS.Platform = process.platform
): ResolvedWakiiFileOpen[] {
  return files.filter((file) => {
    if (!('mindmap' in file.payload)) {
      return true
    }
    return deliveredHashes.get(deliveredKey(file.payload.path, platform)) !== file.contentHash
  })
}

/** Records successful deliveries so the next open of identical content is skipped. */
export function recordDeliveredWakiiFiles(
  files: readonly ResolvedWakiiFileOpen[],
  deliveredHashes: Map<string, string>,
  platform: NodeJS.Platform = process.platform
): void {
  for (const file of files) {
    if ('mindmap' in file.payload && file.contentHash !== null) {
      deliveredHashes.set(deliveredKey(file.payload.path, platform), file.contentHash)
    }
  }
}
