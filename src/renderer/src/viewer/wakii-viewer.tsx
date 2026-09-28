import { useCallback, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type {
  WakiiFileOpenPayload,
  WakiiMindmap,
  WakiiNodeKind
} from '../../../shared/wakii-mindmap-types'
import {
  buildGraphIndex,
  computeLayout,
  edgeModeHidden,
  neighborSet,
  nodeModeHidden,
  type ViewerMode
} from './wakii-graph-layout'
import { wedgePathFor } from './wakii-graph-geometry'
import { useWakiiCamera } from './use-wakii-camera'
import { ViewerToolbar } from './viewer-toolbar'
import { ViewerCanvas } from './viewer-canvas'
import { WakiiSidePanel } from './wakii-side-panel'
import { ViewerWarningsPopover } from './viewer-warnings-popover'
import { WakiiErrorOverlay } from './wakii-error-overlay'

const ALL_KINDS: WakiiNodeKind[] = ['epic', 'sf', 'task', 'step', 'area', 'file']

/**
 * Root of the `.wakii` mindmap viewer (direction C · Quỹ đạo). Owns all viewer
 * state; camera stays in a ref. Payload arrives decoded — error payloads render
 * the error card and nothing else (spec §8: no partial render).
 */
export default function WakiiViewer({
  payload
}: {
  payload: WakiiFileOpenPayload
}): React.JSX.Element {
  return 'error' in payload ? (
    <WakiiErrorOverlay
      code={payload.error.code}
      message={payload.error.message}
      path={payload.path}
    />
  ) : (
    <WakiiViewerGraph mindmap={payload.mindmap} path={payload.path} />
  )
}

function WakiiViewerGraph({
  mindmap,
  path
}: {
  mindmap: WakiiMindmap
  path: string
}): React.JSX.Element {
  const [mode, setModeRaw] = useState<ViewerMode>('progress')
  const [impactOn, setImpactOn] = useState(false)
  const [kindFilter, setKindFilter] = useState<Set<WakiiNodeKind>>(() => new Set(ALL_KINDS))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [warnOpen, setWarnOpen] = useState(false)
  const [devErrorOpen, setDevErrorOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const camRef = useWakiiCamera(canvasRef, viewportRef)

  const index = useMemo(() => buildGraphIndex(mindmap), [mindmap])
  const layout = useMemo(() => computeLayout(mindmap, mode, impactOn), [mindmap, mode, impactOn])
  const warnings = mindmap.decodeWarnings ?? []

  const visibleNodes = useMemo(
    () =>
      mindmap.nodes.filter(
        (n) => layout.pos.has(n.id) && !nodeModeHidden(n, mode, impactOn) && kindFilter.has(n.kind)
      ),
    [mindmap, layout, mode, impactOn, kindFilter]
  )
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () =>
      mindmap.edges.filter(
        (e) => !edgeModeHidden(e, mode) && visibleIds.has(e.from) && visibleIds.has(e.to)
      ),
    [mindmap, visibleIds, mode]
  )

  // Hover neighborhood includes the node itself (prototype `nb.add(id)`).
  const neighborIds = useMemo(() => {
    if (!hoveredId) {
      return null
    }
    const set = neighborSet(hoveredId, index.byId, mindmap.nodes, mindmap.edges)
    set.add(hoveredId)
    return set
  }, [hoveredId, index, mindmap])

  const wedgePath = useMemo(() => {
    const ang = hoveredId ? layout.sfAng.get(hoveredId) : undefined
    if (mode !== 'logic' || ang === undefined) {
      return null
    }
    return wedgePathFor(ang)
  }, [mode, hoveredId, layout])

  const sfStats = useMemo(() => {
    const stats = new Map<string, { done: number; total: number }>()
    for (const [sfId] of layout.sfAng) {
      const tasks = index.childrenOf(sfId).filter((n) => n.kind === 'task')
      stats.set(sfId, { done: tasks.filter((t) => t.state === 'done').length, total: tasks.length })
    }
    return stats
  }, [layout, index])

  const setMode = useCallback((next: ViewerMode): void => {
    setModeRaw(next)
    // Back to progress resets the impact layer (direction behavior 2).
    if (next === 'progress') {
      setImpactOn(false)
    }
  }, [])

  const toggleKind = useCallback((kind: WakiiNodeKind): void => {
    setKindFilter((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }, [])

  const selectedNode = selectedId ? (index.byId.get(selectedId) ?? null) : null
  const epicNode = index.byId.get('epic')
  const epicMeta = epicNode ? `${epicNode.linear ?? ''} · ${mindmap.meta.dest ?? ''}` : ''
  const generatorMetaLine = `${mindmap.meta.generator} · ${mindmap.nodes.length} ${translate('auto.viewer.wakii-viewer.nodes.b3c4d5e6f7', 'nodes')} · ${mindmap.edges.length} ${translate('auto.viewer.wakii-viewer.edges.c4d5e6f7a8', 'edges')} · ${translate('auto.viewer.wakii-viewer.generatedAt.d5e6f7a8b9', 'generated')} ${mindmap.meta.generatedAt.slice(0, 16).replace('T', ' ')}`

  const selectNode = useCallback((id: string): void => setSelectedId(id), [])
  const hoverNode = useCallback((id: string): void => setHoveredId(id), [])
  const unhover = useCallback((): void => setHoveredId(null), [])
  const closePanel = useCallback((): void => setSelectedId(null), [])

  if (devErrorOpen) {
    return (
      <div className="wakii-viewer">
        <ViewerToolbar
          mode={mode}
          onModeChange={setMode}
          impactOn={impactOn}
          onToggleImpact={() => setImpactOn((v) => !v)}
          kindFilter={kindFilter}
          onToggleKind={toggleKind}
          warningsCount={warnings.length}
          warnOpen={warnOpen}
          onToggleWarn={() => setWarnOpen((v) => !v)}
          onFit={() => camRef.current?.fit()}
        />
        <div className="wakii-viewer-body">
          <WakiiErrorOverlay
            code="schema"
            message={translate(
              'auto.viewer.wakii-viewer.simulatedError.e6f7a8b9c0',
              'Simulated decode failure (dev only).'
            )}
            path={path}
            onClose={() => setDevErrorOpen(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="wakii-viewer">
      <ViewerToolbar
        mode={mode}
        onModeChange={setMode}
        impactOn={impactOn}
        onToggleImpact={() => setImpactOn((v) => !v)}
        kindFilter={kindFilter}
        onToggleKind={toggleKind}
        warningsCount={warnings.length}
        warnOpen={warnOpen}
        onToggleWarn={() => setWarnOpen((v) => !v)}
        onFit={() => camRef.current?.fit()}
      />
      <div className="wakii-viewer-body">
        <ViewerCanvas
          canvasRef={canvasRef}
          viewportRef={viewportRef}
          visibleNodes={visibleNodes}
          visibleEdges={visibleEdges}
          layout={layout}
          mode={mode}
          impactOn={impactOn}
          selectedId={selectedId}
          hoveredId={hoveredId}
          neighborIds={neighborIds}
          wedgePath={wedgePath}
          sfStats={sfStats}
          epicMeta={epicMeta}
          generatorMetaLine={generatorMetaLine}
          onSelect={selectNode}
          onHover={hoverNode}
          onHoverEnd={unhover}
          onBackgroundClick={closePanel}
        />
        {selectedNode ? (
          <WakiiSidePanel
            node={selectedNode}
            mindmap={mindmap}
            index={index}
            onClose={closePanel}
          />
        ) : null}
        <ViewerWarningsPopover warnings={warnings} open={warnOpen} />
        {import.meta.env.DEV ? (
          <button
            type="button"
            className="wakii-tbtn wakii-dev-error-btn"
            onClick={() => setDevErrorOpen(true)}
          >
            {translate('auto.viewer.wakii-viewer.simulate.f7a8b9c0d1', 'Simulate error')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
