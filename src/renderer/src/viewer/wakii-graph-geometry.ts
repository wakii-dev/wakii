import type { WakiiEdgeRel } from '../../../shared/wakii-mindmap-types'
import {
  ORBIT_CENTER,
  WEDGE_HALF_ANGLE,
  WEDGE_INNER_R,
  WEDGE_OUTER_R,
  polar
} from './wakii-graph-layout'
import type { WakiiNodeRect } from './wakii-graph-layout'

/**
 * SVG geometry for direction C — wedge spotlight path and edge paths
 * (port of the prototype's wedgePath/arcCtrl/pullback/pathFor; arcs orbit
 * the center). Pure math, no DOM.
 */

/** Wedge spotlight path — ±WEDGE_HALF_ANGLE fan around a SF ring angle. */
export function wedgePathFor(angDeg: number): string {
  const i1 = polar(angDeg - WEDGE_HALF_ANGLE, WEDGE_INNER_R)
  const i2 = polar(angDeg + WEDGE_HALF_ANGLE, WEDGE_INNER_R)
  const o2 = polar(angDeg + WEDGE_HALF_ANGLE, WEDGE_OUTER_R)
  const o1 = polar(angDeg - WEDGE_HALF_ANGLE, WEDGE_OUTER_R)
  return [
    `M ${i1.x} ${i1.y}`,
    `A ${WEDGE_INNER_R} ${WEDGE_INNER_R} 0 0 1 ${i2.x} ${i2.y}`,
    `L ${o2.x} ${o2.y}`,
    `A ${WEDGE_OUTER_R} ${WEDGE_OUTER_R} 0 0 0 ${o1.x} ${o1.y}`,
    'Z'
  ].join(' ')
}

/** Edge path — contains is a straight line; the rest bow outward around the center. */
export function edgePathFor(
  e: { rel: WakiiEdgeRel },
  pa: WakiiNodeRect,
  pb: WakiiNodeRect
): string {
  if (e.rel === 'contains') {
    return `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`
  }
  if (e.rel === 'depends-on') {
    const cp = arcCtrl(pa, pb, 70)
    const t = pullback(cp, pb, pb.w / 2 + 8)
    return `M ${pa.x} ${pa.y} Q ${cp.x} ${cp.y} ${t.x} ${t.y}`
  }
  if (e.rel === 'flows-to') {
    const mx = (pa.x + pb.x) / 2
    const my = (pa.y + pb.y) / 2
    const dx = mx - ORBIT_CENTER.x
    const dy = my - ORBIT_CENTER.y
    const len = Math.hypot(dx, dy) || 1
    const cp = { x: mx + (dx / len) * 46, y: my + (dy / len) * 46 }
    const t = pullback(cp, pb, pb.w / 2 + 8)
    return `M ${pa.x} ${pa.y} Q ${cp.x} ${cp.y} ${t.x} ${t.y}`
  }
  const cp = arcCtrl(pa, pb, 50)
  return `M ${pa.x} ${pa.y} Q ${cp.x} ${cp.y} ${pb.x} ${pb.y}`
}

function arcCtrl(pa: WakiiNodeRect, pb: WakiiNodeRect, extra: number): { x: number; y: number } {
  const aa = Math.atan2(pa.y - ORBIT_CENTER.y, pa.x - ORBIT_CENTER.x)
  const ab = Math.atan2(pb.y - ORBIT_CENTER.y, pb.x - ORBIT_CENTER.x)
  let d = ab - aa
  while (d > Math.PI) {
    d -= 2 * Math.PI
  }
  while (d < -Math.PI) {
    d += 2 * Math.PI
  }
  const am = aa + d / 2
  const rm =
    (Math.hypot(pa.x - ORBIT_CENTER.x, pa.y - ORBIT_CENTER.y) +
      Math.hypot(pb.x - ORBIT_CENTER.x, pb.y - ORBIT_CENTER.y)) /
      2 +
    extra
  return { x: ORBIT_CENTER.x + Math.cos(am) * rm, y: ORBIT_CENTER.y + Math.sin(am) * rm }
}

function pullback(
  cp: { x: number; y: number },
  pb: WakiiNodeRect,
  m: number
): { x: number; y: number } {
  const dx = pb.x - cp.x
  const dy = pb.y - cp.y
  const len = Math.hypot(dx, dy) || 1
  return { x: pb.x - (dx / len) * m, y: pb.y - (dy / len) * m }
}

/** Rel → static edge class (repo bans computed className strings). */
export const REL_CLASS: Record<WakiiEdgeRel, string> = {
  contains: 'wakii-e-contains',
  'depends-on': 'wakii-e-depends-on',
  'flows-to': 'wakii-e-flows-to',
  impacts: 'wakii-e-impacts',
  writes: 'wakii-e-writes'
}
