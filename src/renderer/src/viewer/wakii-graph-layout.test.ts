import { describe, expect, it } from 'vitest'
import {
  ORBIT_CENTER,
  RING_RADII,
  TIER_R,
  computeLayout,
  neighborSet,
  sfRingAngles
} from './wakii-graph-layout'
import { edgePathFor, wedgePathFor } from './wakii-graph-geometry'
import {
  GOLDEN_LOGIC_IMPACT_NODE_COUNT,
  GOLDEN_LOGIC_NODE_COUNT,
  GOLDEN_PROGRESS_NODE_COUNT,
  WAKII_GOLDEN_MINDMAP
} from './wakii-viewer-golden-fixture'

function dist(rect: { x: number; y: number }): number {
  return Math.hypot(rect.x - ORBIT_CENTER.x, rect.y - ORBIT_CENTER.y)
}

describe('sfRingAngles', () => {
  it('orders the golden SFs so every depends-on connects ring neighbors', () => {
    const ang = sfRingAngles(WAKII_GOLDEN_MINDMAP.nodes, WAKII_GOLDEN_MINDMAP.edges)
    expect([...ang.entries()]).toEqual([
      ['sf-1', -90],
      ['sf-2', 0],
      ['sf-4', 90],
      ['sf-3', 180]
    ])
  })

  it('keeps depends-on pairs adjacent for any payload shape (property, not fixture)', () => {
    const nodes = [
      { id: 'epic', kind: 'epic' as const, title: 'e' },
      { id: 'a', kind: 'sf' as const, title: 'a' },
      { id: 'b', kind: 'sf' as const, title: 'b' },
      { id: 'c', kind: 'sf' as const, title: 'c' }
    ]
    const edges = [
      { from: 'b', to: 'a', rel: 'depends-on' as const },
      { from: 'c', to: 'b', rel: 'depends-on' as const }
    ]
    const ang = sfRingAngles(nodes, edges)
    const order = [...ang.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)
    const at = (id: string): number => order.indexOf(id)
    expect(Math.abs(at('b') - at('a'))).toBe(1)
    expect(Math.abs(at('c') - at('b'))).toBe(1)
  })

  it('handles a single SF and an SF-free graph', () => {
    expect(sfRingAngles([{ id: 's', kind: 'sf', title: 's' }], []).get('s')).toBe(-90)
    expect(sfRingAngles([{ id: 'epic', kind: 'epic', title: 'e' }], []).size).toBe(0)
  })
})

describe('computeLayout progress', () => {
  const layout = computeLayout(WAKII_GOLDEN_MINDMAP, 'progress', false)

  it('places epic at the orbit center', () => {
    const epic = layout.pos.get('epic')
    expect(epic).toMatchObject({ x: ORBIT_CENTER.x, y: ORBIT_CENTER.y, w: 230, h: 230 })
  })

  it('sits each SF on its own tier radius at its ring angle', () => {
    expect(dist(layout.pos.get('sf-1')!)).toBeCloseTo(TIER_R[0], 6)
    expect(dist(layout.pos.get('sf-2')!)).toBeCloseTo(TIER_R[1], 6)
    expect(dist(layout.pos.get('sf-3')!)).toBeCloseTo(TIER_R[1], 6)
    expect(dist(layout.pos.get('sf-4')!)).toBeCloseTo(TIER_R[2], 6)
    // Prototype polar convention: 0° = top, ±90° = sides, 180° = bottom — sf-1 at -90° sits due west.
    expect(layout.pos.get('sf-1')!.y).toBeCloseTo(ORBIT_CENTER.y, 6)
    expect(layout.pos.get('sf-1')!.x).toBeLessThan(ORBIT_CENTER.x)
  })

  it('fans tasks around their SF and drops step/area/file', () => {
    expect(layout.pos.has('t-2.1')).toBe(true)
    expect(dist(layout.pos.get('t-2.1')!)).toBeGreaterThan(TIER_R[1])
    expect(layout.pos.has('s-1.1')).toBe(false)
    expect(layout.pos.has('area-kit')).toBe(false)
    expect(layout.pos.has('f-kit-bins')).toBe(false)
  })

  it('positions all 16 progress-visible nodes', () => {
    expect(layout.pos.size).toBe(GOLDEN_PROGRESS_NODE_COUNT)
  })
})

describe('computeLayout logic + impact', () => {
  it('hides tasks and fans steps along flows', () => {
    const layout = computeLayout(WAKII_GOLDEN_MINDMAP, 'logic', false)
    expect(layout.pos.size).toBe(GOLDEN_LOGIC_NODE_COUNT)
    expect(layout.pos.has('t-2.1')).toBe(false)
    expect(layout.pos.has('s-3.1')).toBe(true)
    const r0 = TIER_R[1]
    expect(dist(layout.pos.get('s-3.1')!)).toBeGreaterThan(r0)
  })

  it('impact on → areas at r0+95 and files at r0+210 around each SF', () => {
    const layout = computeLayout(WAKII_GOLDEN_MINDMAP, 'logic', true)
    expect(layout.pos.size).toBe(GOLDEN_LOGIC_IMPACT_NODE_COUNT)
    expect(dist(layout.pos.get('area-renderer')!)).toBeCloseTo(TIER_R[1] + 95, 6)
    expect(dist(layout.pos.get('f-viewer')!)).toBeCloseTo(TIER_R[1] + 210, 6)
    // Files (r0+210) sit strictly outside areas (r0+95) on the same SF axis.
    expect(dist(layout.pos.get('f-editor-slice')!)).toBeGreaterThan(
      dist(layout.pos.get('area-renderer')!)
    )
  })
})

describe('geometry helpers', () => {
  it('wedge path is a fan between the inner and outer radii', () => {
    const d = wedgePathFor(-90)
    expect(d).toMatch(/^M /)
    expect(d).toContain('A 60 60')
    expect(d).toContain('A 680 680')
  })

  it('contains edges are straight, depends-on edges bow outward', () => {
    const pa = { x: 700, y: 600, w: 205, h: 50 }
    const pb = { x: 860, y: 760, w: 178, h: 38 }
    expect(edgePathFor({ rel: 'contains' }, pa, pb)).not.toContain('Q')
    expect(edgePathFor({ rel: 'depends-on' }, pa, pb)).toContain('Q')
    expect(edgePathFor({ rel: 'writes' }, pa, pb)).toContain('Q')
  })
})

describe('neighborSet (hover, first degree)', () => {
  it('unions out/in edges, children and parent', () => {
    const byId = new Map(WAKII_GOLDEN_MINDMAP.nodes.map((n) => [n.id, n] as const))
    const sf1 = neighborSet('sf-1', byId, WAKII_GOLDEN_MINDMAP.nodes, WAKII_GOLDEN_MINDMAP.edges)
    expect(sf1.has('epic')).toBe(true)
    expect(sf1.has('t-1.1')).toBe(true)
    expect(sf1.has('s-1.1')).toBe(true)
    expect(sf1.has('sf-2')).toBe(true) // depends-on in
    expect(sf1.has('f-kit-bins')).toBe(true) // writes out
    expect(sf1.has('sf-4')).toBe(false)
    expect(sf1.has('sf-1')).toBe(false)

    const t11 = neighborSet('t-1.1', byId, WAKII_GOLDEN_MINDMAP.nodes, WAKII_GOLDEN_MINDMAP.edges)
    expect([...t11]).toEqual(['sf-1'])
  })
})

describe('ring radii', () => {
  it('matches the direction constants 200/385/500', () => {
    expect(RING_RADII).toEqual([200, 385, 500])
  })
})
