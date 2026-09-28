import { memo } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { WakiiMindmapNode } from '../../../shared/wakii-mindmap-types'
import type { WakiiNodeRect } from './wakii-graph-layout'

/** Kind → static class (repo bans computed className strings). */
const KIND_CLASS: Record<WakiiMindmapNode['kind'], string> = {
  epic: 'wakii-kind-epic',
  sf: 'wakii-kind-sf',
  task: 'wakii-kind-task',
  step: 'wakii-kind-step',
  area: 'wakii-kind-area',
  file: 'wakii-kind-file'
}

/** state → token color (the only color source; no raw values). */
export const STATE_COLOR: Record<string, string> = {
  done: 'var(--status-success)',
  'in-progress': 'var(--workspace-status-progress)',
  pending: 'var(--muted-foreground)',
  blocked: 'var(--destructive)',
  complete: 'var(--status-success)'
}

const TAG_BY_KIND: Record<WakiiMindmapNode['kind'], string> = {
  epic: 'EPIC',
  sf: 'SF',
  task: 'T',
  step: 'S',
  area: 'A',
  file: 'F'
}

export type WakiiNodeStats = { done: number; total: number }

const ViewerNode = memo(function ViewerNode({
  node,
  rect,
  selected,
  dimmed,
  sfProgress,
  epicMeta,
  onSelect,
  onHover,
  onHoverEnd
}: {
  node: WakiiMindmapNode
  rect: WakiiNodeRect
  selected: boolean
  dimmed: boolean
  sfProgress?: WakiiNodeStats
  epicMeta?: string
  onSelect: (id: string) => void
  onHover: (id: string) => void
  onHoverEnd: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'wakii-node',
        KIND_CLASS[node.kind],
        node.kind === 'file' && node.computed && 'wakii-computed',
        selected && 'wakii-sel',
        dimmed && 'wakii-dim'
      )}
      style={{
        left: rect.x - rect.w / 2,
        top: rect.y - rect.h / 2,
        width: rect.w,
        minHeight: rect.h
      }}
      data-node-id={node.id}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={onHoverEnd}
    >
      {node.kind === 'epic' ? (
        <>
          <span
            className="wakii-dot wakii-dot-epic"
            style={{ background: node.state ? STATE_COLOR[node.state] : undefined }}
          />
          <div className="wakii-ntitle wakii-epic-title">{node.title}</div>
          <div className="wakii-nmeta">{epicMeta}</div>
        </>
      ) : (
        <>
          <div className="wakii-nrow">
            {node.state ? (
              <span className="wakii-dot" style={{ background: STATE_COLOR[node.state] }} />
            ) : null}
            <span className="wakii-tag">
              {node.kind === 'sf' ? `SF·T${node.tier ?? '?'}` : TAG_BY_KIND[node.kind]}
            </span>
            <span className="wakii-ntitle">{node.title}</span>
          </div>
          {node.kind === 'sf' ? (
            <>
              <div className="wakii-nmeta">
                {`${node.linear ?? '—'} · ${sfProgress?.done ?? 0}/${sfProgress?.total ?? 0} ${translate('auto.viewer.wakii-graph-nodes.1a2b3c4d5e', 'tasks')}`}
              </div>
              <div className="wakii-nbar">
                <i
                  style={{
                    width: `${sfProgress?.total ? ((sfProgress.done ?? 0) / sfProgress.total) * 100 : 0}%`
                  }}
                />
              </div>
            </>
          ) : null}
          {node.kind === 'file' ? <div className="wakii-nmeta">{node.path}</div> : null}
        </>
      )}
    </div>
  )
})

/** Absolute-positioned node layer; every text is a React child (auto-escaped). */
export function WakiiNodeLayer({
  nodes,
  pos,
  selectedId,
  neighborIds,
  sfStats,
  epicMeta,
  onSelect,
  onHover,
  onHoverEnd
}: {
  nodes: WakiiMindmapNode[]
  pos: Map<string, WakiiNodeRect>
  selectedId: string | null
  neighborIds: Set<string> | null
  sfStats: Map<string, WakiiNodeStats>
  epicMeta: string
  onSelect: (id: string) => void
  onHover: (id: string) => void
  onHoverEnd: () => void
}): React.JSX.Element {
  return (
    <div className="wakii-nodelayer">
      {nodes.map((node) => {
        const rect = pos.get(node.id)
        if (!rect) {
          return null
        }
        const dimmed = neighborIds !== null && !neighborIds.has(node.id)
        return (
          <ViewerNode
            key={node.id}
            node={node}
            rect={rect}
            selected={selectedId === node.id}
            dimmed={dimmed}
            sfProgress={node.kind === 'sf' ? sfStats.get(node.id) : undefined}
            epicMeta={node.kind === 'epic' ? epicMeta : undefined}
            onSelect={onSelect}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
          />
        )
      })}
    </div>
  )
}
