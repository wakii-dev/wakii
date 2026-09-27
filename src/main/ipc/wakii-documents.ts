import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { WakiiFileOpenPayload } from '../../shared/wakii-file-open-payload'
import { authorizeExternalPath } from './filesystem-auth'

// Keep this module in sync with WAKII_FILE_EXTENSIONS in config/electron-builder.config.cjs
// and the .wakii ProgID block in config/nsis/orca-installer-hooks.nsh — a mismatch on either
// side leaves the association silently dead (the markdown rule of 4 places).

/** Input is untrusted: a larger file is rejected instead of parsed (schema v1 spec, cap 5MB). */
export const MAX_WAKII_DOCUMENT_BYTES = 5 * 1024 * 1024

export function isWakiiDocumentName(name: string): boolean {
  return extname(name).toLowerCase() === '.wakii'
}

export type WakiiMindmapValidation =
  | { ok: true; mindmap: Record<string, unknown> }
  | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Required-field table from schema v1 (spec 2026-09-27 §3) — nothing deeper. Structural
 * checks (duplicate ids, dangling edges, unknown enums) belong to the viewer's decoder.
 */
export function validateWakiiMindmapFile(value: unknown): WakiiMindmapValidation {
  if (!isRecord(value)) {
    return { ok: false, reason: 'document is not a JSON object' }
  }
  const document = value
  if (document.wakiiMindmap !== 1) {
    return { ok: false, reason: 'wakiiMindmap must be 1' }
  }
  if (!isRecord(document.meta)) {
    return { ok: false, reason: 'meta is missing' }
  }
  const meta = document.meta
  for (const field of ['story', 'generatedAt', 'generator']) {
    const fieldValue = meta[field]
    if (typeof fieldValue !== 'string' || fieldValue === '') {
      return { ok: false, reason: `meta.${field} is required` }
    }
  }
  if (!Array.isArray(document.nodes)) {
    return { ok: false, reason: 'nodes is missing' }
  }
  if (!document.nodes.some((node) => isNamedNode(node) && node.kind === 'epic')) {
    return { ok: false, reason: 'at least one epic node is required' }
  }
  for (const node of document.nodes) {
    if (!isNamedNode(node)) {
      return { ok: false, reason: 'every node requires id, kind, and title' }
    }
  }
  // Why edges is required here: the canonical kit decoder (story-mindmap --decode) treats a
  // missing edges[] as INVALID, and SF-3's renderer decoder keeps that rule.
  if (!Array.isArray(document.edges)) {
    return { ok: false, reason: 'edges is missing' }
  }
  for (const edge of document.edges) {
    if (!isNamedNode(edge, ['from', 'to', 'rel'])) {
      return { ok: false, reason: 'every edge requires from, to, and rel' }
    }
  }
  return { ok: true, mindmap: document }
}

function isNamedNode(
  value: unknown,
  fields: readonly string[] = ['id', 'kind', 'title']
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  return fields.every((field) => {
    const fieldValue = value[field]
    return typeof fieldValue === 'string' && fieldValue !== ''
  })
}

/**
 * Reads and validates one OS-handed `.wakii` file. Never throws: every failure becomes the
 * payload's error half so the renderer always receives a per-file verdict.
 */
export async function decodeWakiiFile(filePath: string): Promise<WakiiFileOpenPayload> {
  try {
    const stats = await stat(filePath)
    if (stats.size > MAX_WAKII_DOCUMENT_BYTES) {
      return wakiiFileError(filePath, 'too-large', `File exceeds ${MAX_WAKII_DOCUMENT_BYTES} bytes`)
    }
    const contents = await readFile(filePath, 'utf8')
    return decodeWakiiContents(filePath, contents)
  } catch (error) {
    return wakiiFileError(filePath, 'io', error instanceof Error ? error.message : String(error))
  }
}

/** Validates already-read `.wakii` contents; the caller owns the fs read. */
export function decodeWakiiContents(filePath: string, contents: string): WakiiFileOpenPayload {
  // Why re-checked: the file can grow between a caller's stat and read.
  if (Buffer.byteLength(contents, 'utf8') > MAX_WAKII_DOCUMENT_BYTES) {
    return wakiiFileError(filePath, 'too-large', `File exceeds ${MAX_WAKII_DOCUMENT_BYTES} bytes`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch (error) {
    return wakiiFileError(
      filePath,
      'schema',
      error instanceof Error ? error.message : String(error)
    )
  }
  const validation = validateWakiiMindmapFile(parsed)
  if (!validation.ok) {
    return wakiiFileError(filePath, 'schema', validation.reason)
  }
  // Why here, not before the read: only a successfully-read file is worth whitelisting for
  // the renderer's later fs access (refresh/authorization), matching the markdown pattern.
  authorizeExternalPath(filePath)
  return { path: filePath, mindmap: validation.mindmap }
}

function wakiiFileError(
  filePath: string,
  code: 'io' | 'schema' | 'too-large',
  message: string
): WakiiFileOpenPayload {
  return { path: filePath, error: { code, message } }
}
