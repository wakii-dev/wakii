import { extname } from 'node:path'
import type { WakiiFileOpenPayload } from '../../shared/wakii-file-open-payload'
import type { WakiiMindmap } from '../../shared/wakii-mindmap-types'

// Keep this module in sync with WAKII_FILE_EXTENSIONS in config/electron-builder.config.cjs
// and the .wakii ProgID block in config/nsis/orca-installer-hooks.nsh — a mismatch on either
// side leaves the association silently dead (the markdown rule of 4 places).

/** Input is untrusted: a larger file is rejected instead of parsed (schema v1 spec, cap 5MB). */
export const MAX_WAKII_DOCUMENT_BYTES = 5 * 1024 * 1024

export function isWakiiDocumentName(name: string): boolean {
  return extname(name).toLowerCase() === '.wakii'
}

export type WakiiMindmapValidation =
  | { ok: true; mindmap: WakiiMindmap }
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
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the table above verified every field the envelope type requires (wakiiMindmap=1, meta strings, node id/kind/title, edge from/to/rel); enum VALUES stay unchecked by design — the viewer drops unknown kinds via the kind filter and dangling edges via visibility (spec §8: no partial render).
  return { ok: true, mindmap: document as WakiiMindmap }
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
 * Validates already-read `.wakii` contents. Never throws: every failure becomes the payload's
 * error half so the renderer always receives a per-file verdict. The caller owns the fs read
 * and must size-cap it BEFORE reading (see resolveOpenedWakiiFiles); the byteLength re-check
 * below only covers growth between the caller's stat and read.
 */
export function decodeWakiiContents(filePath: string, contents: string): WakiiFileOpenPayload {
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
  return { path: filePath, mindmap: validation.mindmap }
}

function wakiiFileError(
  filePath: string,
  code: 'io' | 'schema' | 'too-large',
  message: string
): WakiiFileOpenPayload {
  return { path: filePath, error: { code, message } }
}
