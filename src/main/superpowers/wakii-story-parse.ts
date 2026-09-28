// Pure .wakii → story projection for the Story tab RPC (VU-14 SF-5): the
// mindmaps/*.wakii file is the canonical story source, brackets/*.md stay as
// the legacy fallback. Projection mirrors bracket-file-parse.ts (no fs — the
// caller owns IO) and reuses the schema-v1 required-field table from
// validateWakiiMindmapFile so the tab and the file-open IPC can never drift.
import { validateWakiiMindmapFile } from '../ipc/wakii-documents'
import type { WakiiMindmap } from '../../shared/wakii-mindmap-types'

export type WakiiStorySf = {
  name: string // 'SF-1' — normalized from the node id 'sf-1'
  title: string
  tier: number
  what: string
  dependsOn: string[] // normalized 'SF-N' from edges rel 'depends-on'
  linear: string | null
}

export type WakiiStoryDoc = {
  epicId: string // meta.epic ('' when absent)
  title: string // meta.story
  destination: string | null // meta.dest
  sfs: WakiiStorySf[]
  /** Written by the generator/updater for dropped unknown enums — the tab surfaces them. */
  decodeWarnings: string[]
}

// Same rule family as bracket R1: not a story document at all → 'parse-error'.
// A valid document with zero sf nodes parses to sfs: [] — the caller decides
// whether that is a parse error (the list marks it parseError, bracket-style).
export function parseWakiiStory(text: string): WakiiStoryDoc | 'parse-error' {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return 'parse-error'
  }
  const validation = validateWakiiMindmapFile(parsed)
  if (!validation.ok) {
    return 'parse-error'
  }
  const doc: WakiiMindmap = validation.mindmap
  const sfIds = new Set(doc.nodes.filter((n) => n.kind === 'sf').map((n) => n.id))
  const sfs: WakiiStorySf[] = doc.nodes
    .filter((n) => n.kind === 'sf')
    .map((n) => ({
      name: n.id.toUpperCase(),
      title: n.title,
      tier: n.tier ?? 0,
      what: n.summary ?? '',
      dependsOn: doc.edges
        .filter((e) => e.rel === 'depends-on' && e.from === n.id && sfIds.has(e.to))
        .map((e) => e.to.toUpperCase()),
      linear: n.linear ?? null
    }))
  return {
    epicId: doc.meta.epic ?? '',
    title: doc.meta.story,
    destination: doc.meta.dest ?? null,
    sfs,
    decodeWarnings: (doc.decodeWarnings ?? []).filter((w) => typeof w === 'string')
  }
}
