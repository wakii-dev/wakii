import type {
  WakiiMindmap,
  WakiiMindmapEdge,
  WakiiMindmapNode
} from '../../../shared/wakii-mindmap-types'

/**
 * Direction C layout — orbital: epic disc at the center, SFs on concentric tier
 * rings, tasks/steps/impact fanned around their SF. Pure math ported from
 * docs/superpowers/prototypes/vu-14-mindmap/c.html (computeLayout/polar/TIER_R/
 * SF_RING/SIZES); no DOM here. Memoize per (payload, mode, impactOn).
 */

export type ViewerMode = 'progress' | 'logic'

export type WakiiNodeRect = { x: number; y: number; w: number; h: number }

export type WakiiLayout = {
  pos: Map<string, WakiiNodeRect>
  /** SF id → ring angle (degrees, -90 = top), also the wedge spotlight axis. */
  sfAng: Map<string, number>
}

export const WORLD = { w: 1560, h: 1360 }
export const ORBIT_CENTER = { x: 780, y: 680 }
export const TIER_R: Record<number, number> = { 0: 200, 1: 385, 2: 500 }
export const RING_RADII = [TIER_R[0], TIER_R[1], TIER_R[2]]
export const WEDGE_INNER_R = 60
export const WEDGE_OUTER_R = 680
export const WEDGE_HALF_ANGLE = 24

// [w, h] per kind — SIZES in the prototype.
const SIZES: Record<WakiiMindmapNode['kind'], [number, number]> = {
  epic: [230, 230],
  sf: [205, 50],
  task: [178, 38],
  step: [188, 40],
  area: [110, 32],
  file: [225, 36]
}

export function polar(angDeg: number, r: number): { x: number; y: number } {
  const rad = (angDeg * Math.PI) / 180
  return { x: ORBIT_CENTER.x + Math.sin(rad) * r, y: ORBIT_CENTER.y - Math.cos(rad) * r }
}

/** Max SF count for the exact adjacent-depends permutation search (8! is trivial). */
const SF_PERMUTATION_CAP = 8

/**
 * Ring order so every depends-on edge connects ring-neighbors (direction C's
 * signature). Brute-forces the order maximizing adjacent depends-on pairs with a
 * lexicographic tie-break (reproduces the prototype ring for the golden fixture);
 * larger graphs fall back to tier+id ordering.
 */
export function sfRingAngles(
  nodes: WakiiMindmapNode[],
  edges: WakiiMindmapEdge[]
): Map<string, number> {
  const sfs = nodes.filter((n) => n.kind === 'sf')
  const ang = new Map<string, number>()
  if (sfs.length === 0) {
    return ang
  }
  const depPairs = new Set<string>()
  for (const e of edges) {
    if (e.rel === 'depends-on') {
      depPairs.add(`${e.to}¦${e.from}`)
    }
  }
  let order: WakiiMindmapNode[]
  if (sfs.length <= SF_PERMUTATION_CAP) {
    const idByKey = new Map(sfs.map((s) => [s.id, s] as const))
    const ids = sfs.map((s) => s.id).sort()
    let best: string[] | null = null
    let bestScore = -1
    for (const perm of permutations(ids)) {
      const score = ringScore(perm, depPairs)
      // permutations() yields in lexicographic order, so > keeps the first optimum.
      if (score > bestScore) {
        bestScore = score
        best = perm
      }
    }
    order = (best ?? ids)
      .map((id) => idByKey.get(id))
      .filter((sf): sf is WakiiMindmapNode => Boolean(sf))
  } else {
    order = [...sfs].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.id.localeCompare(b.id))
  }
  order.forEach((sf, i) => ang.set(sf.id, -90 + (i * 360) / order.length))
  return ang
}

function ringScore(order: string[], depPairs: Set<string>): number {
  let score = 0
  const n = order.length
  for (let i = 0; i < n; i++) {
    const a = order[i]
    const b = order[(i + 1) % n]
    if (depPairs.has(`${a}¦${b}`) || depPairs.has(`${b}¦${a}`)) {
      score += 1
    }
  }
  return score
}

function* permutations(items: string[]): Generator<string[]> {
  if (items.length <= 1) {
    yield [...items]
    return
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const tail of permutations(rest)) {
      yield [items[i], ...tail]
    }
  }
}

/** Nodes an SF reaches via impacts/writes (the impact layer). */
export function impactTargets(
  sfId: string,
  byId: Map<string, WakiiMindmapNode>,
  outEdges: Map<string, WakiiMindmapEdge[]>
): WakiiMindmapNode[] {
  return (outEdges.get(sfId) ?? [])
    .filter((e) => e.rel === 'impacts' || e.rel === 'writes')
    .map((e) => byId.get(e.to))
    .filter((n): n is WakiiMindmapNode => Boolean(n))
}

/** First-neighbors for hover: union of out/in edges + children + parent. */
export function neighborSet(
  id: string,
  byId: Map<string, WakiiMindmapNode>,
  nodes: WakiiMindmapNode[],
  edges: WakiiMindmapEdge[]
): Set<string> {
  const set = new Set<string>()
  for (const e of edges) {
    if (e.from === id) {
      set.add(e.to)
    }
    if (e.to === id) {
      set.add(e.from)
    }
  }
  for (const n of nodes) {
    if (n.parent === id) {
      set.add(n.id)
    }
  }
  const me = byId.get(id)
  if (me?.parent) {
    set.add(me.parent)
  }
  set.delete(id)
  return set
}

/** Visibility per mode before kind filter (spec slice 3 + direction behavior 1/2). */
export function nodeModeHidden(n: WakiiMindmapNode, mode: ViewerMode, impactOn: boolean): boolean {
  if (mode === 'progress') {
    return n.kind === 'step' || n.kind === 'area' || n.kind === 'file'
  }
  if (n.kind === 'task') {
    return true
  }
  if ((n.kind === 'area' || n.kind === 'file') && !impactOn) {
    return true
  }
  return false
}

export function edgeModeHidden(e: WakiiMindmapEdge, mode: ViewerMode): boolean {
  if (mode === 'progress') {
    return e.rel === 'flows-to' || e.rel === 'impacts' || e.rel === 'writes'
  }
  return false
}

export function computeLayout(
  mindmap: WakiiMindmap,
  mode: ViewerMode,
  impactOn: boolean
): WakiiLayout {
  const { nodes, edges } = mindmap
  const byId = new Map(nodes.map((n) => [n.id, n] as const))
  const outEdges = new Map<string, WakiiMindmapEdge[]>()
  for (const e of edges) {
    const list = outEdges.get(e.from)
    if (list) {
      list.push(e)
    } else {
      outEdges.set(e.from, [e])
    }
  }
  const sfAng = sfRingAngles(nodes, edges)
  const pos = new Map<string, WakiiNodeRect>()
  pos.set('epic', { x: ORBIT_CENTER.x, y: ORBIT_CENTER.y, ...size('epic') })
  const childrenOf = (id: string): WakiiMindmapNode[] => nodes.filter((n) => n.parent === id)

  for (const [sfId, ang] of sfAng) {
    const sf = byId.get(sfId)
    if (!sf) {
      continue
    }
    const r0 = TIER_R[sf.tier ?? 0]
    pos.set(sfId, { ...polar(ang, r0), ...size('sf') })
    if (mode === 'progress') {
      const tasks = childrenOf(sfId).filter((n) => n.kind === 'task')
      tasks.forEach((t, j) => {
        pos.set(t.id, {
          ...polar(ang + (j - (tasks.length - 1) / 2) * 13, r0 + 100 + j * 52),
          ...size('task')
        })
      })
    } else {
      const steps = childrenOf(sfId).filter((n) => n.kind === 'step')
      steps.forEach((st, j) => {
        pos.set(st.id, {
          ...polar(ang + (j - (steps.length - 1) / 2) * 12, r0 + 90 + j * 56),
          ...size('step')
        })
      })
      if (impactOn) {
        const targets = impactTargets(sfId, byId, outEdges).filter((n) => !pos.has(n.id))
        const areas = targets.filter((n) => n.kind === 'area')
        const files = targets.filter((n) => n.kind === 'file')
        const place = (n: WakiiMindmapNode, i: number, count: number, r: number): void => {
          let half: number
          if (count === 1) {
            half = n.kind === 'area' ? (files.length ? -18 : 0) : areas.length ? 18 : 0
          } else {
            const spread =
              n.kind === 'area' ? (count > 2 ? 30 : 20) : Math.min(50, Math.max(24, count * 16))
            half = -spread + 2 * spread * (i / (count - 1))
          }
          pos.set(n.id, { ...polar(ang + half, r), ...size(n.kind) })
        }
        areas.forEach((a, i) => place(a, i, areas.length, r0 + 95))
        files.forEach((f, i) => place(f, i, files.length, r0 + 210))
      }
    }
  }
  return { pos, sfAng }
}

function size(kind: WakiiMindmapNode['kind']): { w: number; h: number } {
  const [w, h] = SIZES[kind]
  return { w, h }
}

/** Adjacency + lookup index shared by the panel, hover and SF progress bars. */
export type WakiiGraphIndex = {
  byId: Map<string, WakiiMindmapNode>
  outEdges: Map<string, WakiiMindmapEdge[]>
  inEdges: Map<string, WakiiMindmapEdge[]>
  childrenOf: (id: string) => WakiiMindmapNode[]
}

export function buildGraphIndex(mindmap: WakiiMindmap): WakiiGraphIndex {
  const byId = new Map(mindmap.nodes.map((n) => [n.id, n] as const))
  const outEdges = new Map<string, WakiiMindmapEdge[]>()
  const inEdges = new Map<string, WakiiMindmapEdge[]>()
  for (const e of mindmap.edges) {
    const out = outEdges.get(e.from)
    if (out) {
      out.push(e)
    } else {
      outEdges.set(e.from, [e])
    }
    const inc = inEdges.get(e.to)
    if (inc) {
      inc.push(e)
    } else {
      inEdges.set(e.to, [e])
    }
  }
  return {
    byId,
    outEdges,
    inEdges,
    childrenOf: (id) => mindmap.nodes.filter((n) => n.parent === id)
  }
}
