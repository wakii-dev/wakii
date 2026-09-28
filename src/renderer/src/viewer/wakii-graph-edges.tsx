import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { WakiiMindmapEdge } from '../../../shared/wakii-mindmap-types'
import {
  ORBIT_CENTER,
  RING_RADII,
  WORLD,
  polar,
  type ViewerMode,
  type WakiiNodeRect
} from './wakii-graph-layout'
import { REL_CLASS, edgePathFor } from './wakii-graph-geometry'

/** Static ring guides + tier labels — never changes for a given payload. */
function RingGuides(): React.JSX.Element {
  return useMemo(
    () => (
      <g>
        {RING_RADII.map((r, i) => {
          const lp = polar(-45, r)
          return (
            <g key={r}>
              <circle className="wakii-ringguide" cx={ORBIT_CENTER.x} cy={ORBIT_CENTER.y} r={r} />
              <text className="wakii-ringlabel" x={lp.x + 8} y={lp.y - 8}>
                {`tier ${i}`}
              </text>
            </g>
          )
        })}
      </g>
    ),
    []
  )
}

/**
 * SVG edge stack: ring guides → wedge spotlight → edge paths. Edge `d` comes from
 * the layout; class + arrow marker come from `rel` via the static REL_CLASS map.
 */
export function WakiiGraphEdges({
  edges,
  pos,
  mode,
  hoveredId,
  neighborIds,
  wedgePath
}: {
  edges: WakiiMindmapEdge[]
  pos: Map<string, WakiiNodeRect>
  mode: ViewerMode
  hoveredId: string | null
  neighborIds: Set<string> | null
  wedgePath: string | null
}): React.JSX.Element {
  const markerId = useId()
  return (
    <svg className="wakii-edges" width={WORLD.w} height={WORLD.h}>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="var(--muted-foreground)" />
        </marker>
      </defs>
      <RingGuides />
      <path
        className={cn('wakii-wedge', wedgePath && 'wakii-wedge-show')}
        d={wedgePath ?? ''}
        data-testid="wakii-wedge"
      />
      <g>
        {edges.map((e) => {
          const pa = pos.get(e.from)
          const pb = pos.get(e.to)
          if (!pa || !pb) {
            return null
          }
          const key = `${e.from}->${e.to}:${e.rel}`
          const touchesHover = hoveredId !== null && (e.from === hoveredId || e.to === hoveredId)
          const inNeighborPath =
            neighborIds !== null && neighborIds.has(e.from) && neighborIds.has(e.to)
          return (
            <path
              key={key}
              className={cn(
                'wakii-edge',
                REL_CLASS[e.rel],
                mode === 'logic' &&
                  (e.rel === 'contains' || e.rel === 'depends-on') &&
                  'wakii-faint',
                neighborIds !== null && !inNeighborPath && 'wakii-dim',
                inNeighborPath && touchesHover && 'wakii-hot'
              )}
              d={edgePathFor(e, pa, pb)}
              markerEnd={
                e.rel === 'depends-on' || e.rel === 'flows-to' ? `url(#${markerId})` : undefined
              }
            />
          )
        })}
      </g>
    </svg>
  )
}
