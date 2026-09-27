import { translate } from '@/i18n/i18n'
import type {
  WakiiMindmap,
  WakiiMindmapNode,
  WakiiNodeState
} from '../../../shared/wakii-mindmap-types'
import type { WakiiGraphIndex } from './wakii-graph-layout'
import { WakiiPanelListSection } from './wakii-panel-list-section'
import { STATE_COLOR } from './wakii-graph-nodes'

const KIND_LABEL: Record<WakiiMindmapNode['kind'], { key: string; fallback: string }> = {
  epic: { key: 'auto.viewer.wakii-side-panel.kindEpic.9c0d1e2f3a', fallback: 'Epic' },
  sf: { key: 'auto.viewer.wakii-side-panel.kindSf.0d1e2f3a4b', fallback: 'SF' },
  task: { key: 'auto.viewer.wakii-side-panel.kindTask.1e2f3a4b5c', fallback: 'Task' },
  step: { key: 'auto.viewer.wakii-side-panel.kindStep.2f3a4b5c6d', fallback: 'Step' },
  area: { key: 'auto.viewer.wakii-side-panel.kindArea.3a4b5c6d7e', fallback: 'Area' },
  file: { key: 'auto.viewer.wakii-side-panel.kindFile.4b5c6d7e8f', fallback: 'File' }
}

const STATE_LABEL: Record<WakiiNodeState, { key: string; fallback: string }> = {
  done: { key: 'auto.viewer.wakii-side-panel.stateDone.5c6d7e8f9a', fallback: 'Done' },
  'in-progress': {
    key: 'auto.viewer.wakii-side-panel.stateInProgress.6d7e8f9a0b',
    fallback: 'In progress'
  },
  pending: { key: 'auto.viewer.wakii-side-panel.statePending.7e8f9a0b1c', fallback: 'Pending' },
  blocked: { key: 'auto.viewer.wakii-side-panel.stateBlocked.8f9a0b1c2d', fallback: 'Blocked' },
  complete: { key: 'auto.viewer.wakii-side-panel.stateComplete.9a0b1c2d3e', fallback: 'Complete' }
}

function kindChipLabel(node: WakiiMindmapNode): string {
  const kind = KIND_LABEL[node.kind]
  const base = `${translate(kind.key, kind.fallback)}${node.kind === 'sf' && node.tier != null ? ` · tier ${node.tier}` : ''}`
  return base
}

function PanelRow({ k, v, mono }: { k: string; v: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="wakii-p-row">
      <span className="wakii-p-rowk">{k}</span>
      <span className={mono ? 'wakii-p-rowv wakii-mono' : 'wakii-p-rowv'}>{v}</span>
    </div>
  )
}

/** Left floating panel for the selected node — identity, context, evidence, knowledge arrays. */
export function WakiiSidePanel({
  node,
  mindmap,
  index,
  onClose
}: {
  node: WakiiMindmapNode
  mindmap: WakiiMindmap
  index: WakiiGraphIndex
  onClose: () => void
}): React.JSX.Element {
  const evidence = (mindmap.evidence ?? []).filter((ev) => ev.node === node.id)
  const state = node.state ? STATE_LABEL[node.state] : null
  const sfWrites =
    node.kind === 'file'
      ? (index.inEdges.get(node.id) ?? [])
          .filter((e) => e.rel === 'writes')
          .map((e) => index.byId.get(e.from))
          .filter((n): n is WakiiMindmapNode => Boolean(n))
      : []
  const knowledge: [string, { key: string; fallback: string }, string[] | undefined][] = [
    [
      'acceptance',
      { key: 'auto.viewer.wakii-side-panel.sectionAcceptance.a0b1c2d3e4', fallback: 'ACCEPTANCE' },
      node.acceptance
    ],
    [
      'tests',
      { key: 'auto.viewer.wakii-side-panel.sectionTests.b1c2d3e4f5', fallback: 'TESTS' },
      node.tests
    ],
    [
      'notes',
      { key: 'auto.viewer.wakii-side-panel.sectionNotes.c2d3e4f5a6', fallback: 'NOTES' },
      node.notes
    ]
  ]

  return (
    <div className="wakii-panel" data-testid="wakii-panel" onClick={(e) => e.stopPropagation()}>
      <div className="wakii-p-head">
        <span className="wakii-p-kind">{kindChipLabel(node)}</span>
        <button type="button" className="wakii-p-close" onClick={onClose} aria-label="close">
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="wakii-p-title">{node.title}</div>
      {state && node.state ? (
        <span
          className="wakii-p-state"
          style={{
            color: STATE_COLOR[node.state],
            borderColor: `color-mix(in srgb, ${STATE_COLOR[node.state]} 40%, transparent)`,
            background: `color-mix(in srgb, ${STATE_COLOR[node.state]} 10%, transparent)`
          }}
        >
          {translate(state.key, state.fallback)}
        </span>
      ) : null}
      {node.kind === 'epic' && mindmap.meta.summary ? (
        <p className="wakii-p-summary">{mindmap.meta.summary}</p>
      ) : null}
      {node.summary ? <p className="wakii-p-summary">{node.summary}</p> : null}
      {node.linear ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowLinear.d3e4f5a6b7', 'Linear')}
          v={node.linear}
          mono
        />
      ) : null}
      {node.kind === 'epic' && mindmap.meta.dest ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowDest.e4f5a6b7c8', 'Target branch')}
          v={mindmap.meta.dest}
          mono
        />
      ) : null}
      {node.kind === 'file' && node.path ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowPath.f5a6b7c8d9', 'Path')}
          v={node.path}
          mono
        />
      ) : null}
      {node.kind === 'file' ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowSource.a6b7c8d9e0', 'Source')}
          v={
            node.computed
              ? translate(
                  'auto.viewer.wakii-side-panel.sourceComputed.b7c8d9e0f1',
                  'story-impact (computed)'
                )
              : translate(
                  'auto.viewer.wakii-side-panel.sourceCurated.c8d9e0f1a2',
                  'Touch map (curated)'
                )
          }
        />
      ) : null}
      {node.kind === 'file' && sfWrites.length ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowSfs.d9e0f1a2b3', 'SFs touching')}
          v={sfWrites.map((sf) => sf.linear ?? sf.title).join(', ')}
        />
      ) : null}
      {node.kind === 'step' && node.detail ? (
        <PanelRow
          k={translate('auto.viewer.wakii-side-panel.rowMechanism.e0f1a2b3c4', 'Mechanism')}
          v={node.detail}
        />
      ) : null}
      {evidence.length ? (
        <div className="wakii-p-ev">
          <div className="wakii-p-evh">
            {translate('auto.viewer.wakii-side-panel.evidenceHeading.f1a2b3c4d5', 'EVIDENCE')}
          </div>
          {evidence.map((ev) => (
            <div key={`${ev.node}:${ev.summary}`} className="wakii-p-evi">
              {ev.summary}
              <div className="wakii-p-evr">{ev.ref}</div>
            </div>
          ))}
        </div>
      ) : null}
      {knowledge.map(([section, label, items]) =>
        items && items.length ? (
          <WakiiPanelListSection
            key={`${node.id}:${section}`}
            label={translate(label.key, label.fallback)}
            items={items}
            defaultOpen={items.length <= 3}
          />
        ) : null
      )}
    </div>
  )
}
