import type { RefObject } from 'react'
import type { WakiiMindmapEdge, WakiiMindmapNode } from '../../../shared/wakii-mindmap-types'
import type { ViewerMode, WakiiLayout } from './wakii-graph-layout'
import { WakiiGraphEdges } from './wakii-graph-edges'
import { WakiiNodeLayer } from './wakii-graph-nodes'
import { WakiiLegendOverlay } from './wakii-legend-overlay'
import { translate } from '@/i18n/i18n'

/** Canvas surface: camera viewport (edges SVG + node layer) + hint/legend overlays. */
export function ViewerCanvas({
  canvasRef,
  viewportRef,
  visibleNodes,
  visibleEdges,
  layout,
  mode,
  impactOn,
  selectedId,
  hoveredId,
  neighborIds,
  wedgePath,
  sfStats,
  epicMeta,
  generatorMetaLine,
  onSelect,
  onHover,
  onHoverEnd,
  onBackgroundClick
}: {
  canvasRef: RefObject<HTMLDivElement | null>
  viewportRef: RefObject<HTMLDivElement | null>
  visibleNodes: WakiiMindmapNode[]
  visibleEdges: WakiiMindmapEdge[]
  layout: WakiiLayout
  mode: ViewerMode
  impactOn: boolean
  selectedId: string | null
  hoveredId: string | null
  neighborIds: Set<string> | null
  wedgePath: string | null
  sfStats: Map<string, { done: number; total: number }>
  epicMeta: string
  generatorMetaLine: string
  onSelect: (id: string) => void
  onHover: (id: string) => void
  onHoverEnd: () => void
  onBackgroundClick: () => void
}): React.JSX.Element {
  return (
    <div
      ref={canvasRef}
      className="wakii-canvas"
      onClick={onBackgroundClick}
      data-testid="wakii-canvas"
    >
      <div ref={viewportRef} className="wakii-viewport">
        <WakiiGraphEdges
          edges={visibleEdges}
          pos={layout.pos}
          mode={mode}
          hoveredId={hoveredId}
          neighborIds={neighborIds}
          wedgePath={wedgePath}
        />
        <WakiiNodeLayer
          nodes={visibleNodes}
          pos={layout.pos}
          selectedId={selectedId}
          neighborIds={neighborIds}
          sfStats={sfStats}
          epicMeta={epicMeta}
          onSelect={onSelect}
          onHover={onHover}
          onHoverEnd={onHoverEnd}
        />
      </div>
      <div className="wakii-legend-slot">
        <WakiiLegendOverlay mode={mode} impactOn={impactOn} />
      </div>
      <div className="wakii-hint">
        {translate(
          'auto.viewer.viewer-canvas.hint.a2b3c4d5e6',
          'Scroll: zoom · Drag background: pan · Click node: details · Hover: neighbors + tier fan'
        )}
        <br />
        <span>{generatorMetaLine}</span>
      </div>
    </div>
  )
}
