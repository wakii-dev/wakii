import type {
  WakiiEvidenceEntry,
  WakiiFileOpenPayload,
  WakiiMindmap
} from '../../../shared/wakii-mindmap-types'
import { WAKII_GOLDEN_EDGES, WAKII_GOLDEN_NODES } from './wakii-golden-graph'

const WAKII_GOLDEN_META = {
  story: 'VU-14 — mindmap.wakii viewer',
  epic: 'VU-14',
  linear: 'VU-14',
  dest: 'story/vu-14-mindmap-viewer',
  generatedAt: '2026-09-27T13:00:00Z',
  generator: 'story-mindmap 1.0.0',
  summary: 'File .wakii snapshot đồ thị story + app Wakii mở được thành mindmap tương tác.'
} as const

const WAKII_GOLDEN_EVIDENCE: WakiiEvidenceEntry[] = [
  {
    node: 'sf-1',
    summary: 'Suite kit xanh 25 asserts + fingerprint rehash',
    ref: 'tests/kit-verify-manifest.mjs'
  },
  {
    node: 'sf-2',
    summary: 'IPC wiring test restore-on-failure đạt',
    ref: 'os-opened-wakii-wiring.test.ts'
  },
  { node: 'f-main-index', summary: 'reverse-import 12 module đụng', ref: 'story-impact --json' },
  { node: 't-2.3', summary: 'Chờ review NSIS macro cặp đối xứng', ref: 'Linear comment VU-14-2' }
] as const

const WAKII_GOLDEN_DECODE_WARNINGS: string[] = [
  'Bỏ node "w-1" — kind "note" không nhận diện (drop-unknown-field)',
  'Bỏ edge "e-90" — rel "relates" không nhận diện'
] as const

/**
 * Golden render fixture — assembles the prototype c.html graph (see
 * wakii-golden-graph.ts) into a decoded mindmap. Every viewer test (vitest +
 * Playwright golden) pins against this exact graph so counts stay stable.
 */
export const WAKII_GOLDEN_MINDMAP: WakiiMindmap = {
  wakiiMindmap: 1,
  meta: WAKII_GOLDEN_META,
  nodes: WAKII_GOLDEN_NODES,
  edges: WAKII_GOLDEN_EDGES,
  evidence: WAKII_GOLDEN_EVIDENCE,
  decodeWarnings: WAKII_GOLDEN_DECODE_WARNINGS
}

/** Visible counts per mode (mode+filter rules in wakii-graph-layout.ts). */
export const GOLDEN_PROGRESS_NODE_COUNT = 16 // epic + 4 sf + 11 task
export const GOLDEN_PROGRESS_EDGE_COUNT = 19 // 15 contains + 4 depends-on
export const GOLDEN_LOGIC_NODE_COUNT = 13 // epic + 4 sf + 8 step
export const GOLDEN_LOGIC_EDGE_COUNT = 14 // 4 contains + 4 depends-on(faint) + 6 flows-to
export const GOLDEN_LOGIC_IMPACT_NODE_COUNT = 24 // logic + 4 area + 7 file
export const GOLDEN_LOGIC_IMPACT_EDGE_COUNT = 26 // logic + 5 impacts + 7 writes

export function wakiiGoldenPayload(
  path = 'docs/superpowers/mindmaps/VU-14-mindmap-viewer.wakii'
): WakiiFileOpenPayload {
  return { path, mindmap: WAKII_GOLDEN_MINDMAP }
}

export function wakiiGoldenErrorPayload(
  path = 'docs/superpowers/mindmaps/broken.wakii'
): WakiiFileOpenPayload {
  return {
    path,
    error: {
      code: 'schema',
      message:
        'Thiếu trường bắt buộc "wakiiMindmap" (magic + schema version) — decoder từ chối file.'
    }
  }
}
