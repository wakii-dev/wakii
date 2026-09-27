/**
 * Decoded `.wakii` mindmap (schema v1) — the wire shape main hands the renderer
 * over `ui:openWakiiFile`. Mirrors the decoder in kit bin `story-mindmap`
 * (spec docs/superpowers/specs/2026-09-27-mindmap-wakii-viewer-design.md §3/§5):
 * unknown enum values are already dropped into `decodeWarnings`, so every union
 * here is closed. The renderer never re-reads the file or JSON.parses again.
 */

export type WakiiNodeKind = 'epic' | 'sf' | 'task' | 'step' | 'area' | 'file'

/** `complete` is the decoder's derived epic state (all SFs done). */
export type WakiiNodeState = 'pending' | 'in-progress' | 'done' | 'blocked' | 'complete'

export type WakiiEdgeRel = 'contains' | 'depends-on' | 'flows-to' | 'impacts' | 'writes'

export type WakiiErrorCode = 'io' | 'schema' | 'too-large'

export type WakiiMindmapNode = {
  id: string
  kind: WakiiNodeKind
  title: string
  state?: WakiiNodeState
  linear?: string
  /** Orbit ring for SF nodes (0 = innermost). */
  tier?: number
  /** Convenience parent pointer; edge `contains` wins on conflict. */
  parent?: string
  /** Step nodes: one-sentence mechanism. */
  detail?: string
  /** File nodes: repo-relative path. */
  path?: string
  /** File nodes: from story-impact (computed) vs touch map (curated). */
  computed?: boolean
  summary?: string
  acceptance?: string[]
  tests?: string[]
  notes?: string[]
  filesTouched?: string[]
}

export type WakiiMindmapEdge = {
  from: string
  to: string
  rel: WakiiEdgeRel
}

export type WakiiEvidenceEntry = {
  node: string
  summary: string
  ref: string
}

export type WakiiMindmapMeta = {
  story: string
  generatedAt: string
  generator: string
  epic?: string
  linear?: string
  dest?: string
  summary?: string
  phases?: string[]
}

export type WakiiMindmap = {
  /** Contract with the viewer layout: the central disc node is expected to carry id `epic`. */
  wakiiMindmap: 1
  meta: WakiiMindmapMeta
  nodes: WakiiMindmapNode[]
  edges: WakiiMindmapEdge[]
  evidence?: WakiiEvidenceEntry[]
  decodeWarnings?: string[]
}

/** Push payload of `ui:openWakiiFile` — decoded by main, error or mindmap. */
export type WakiiFileOpenPayload =
  | { path: string; mindmap: WakiiMindmap }
  | { path: string; error: { code: WakiiErrorCode; message: string } }
