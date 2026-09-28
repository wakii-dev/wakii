import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { WakiiNodeKind } from '../../../shared/wakii-mindmap-types'
import type { ViewerMode } from './wakii-graph-layout'

const CHIP_KINDS: { kind: WakiiNodeKind; key: string; fallback: string }[] = [
  { kind: 'epic', key: 'auto.viewer.viewer-toolbar.kindEpic.a1b2c3d4e5', fallback: 'Epic' },
  { kind: 'sf', key: 'auto.viewer.viewer-toolbar.kindSf.b2c3d4e5f6', fallback: 'SF' },
  { kind: 'task', key: 'auto.viewer.viewer-toolbar.kindTask.c3d4e5f6a7', fallback: 'Task' },
  { kind: 'step', key: 'auto.viewer.viewer-toolbar.kindStep.d4e5f6a7b8', fallback: 'Step' },
  { kind: 'area', key: 'auto.viewer.viewer-toolbar.kindArea.e5f6a7b8c9', fallback: 'Area' },
  { kind: 'file', key: 'auto.viewer.viewer-toolbar.kindFile.f6a7b8c9d0', fallback: 'File' }
]

/** Kinds a mode never shows have their chip disabled (direction behavior 5). */
export function kindChipDisabled(kind: WakiiNodeKind, mode: ViewerMode): boolean {
  if (mode === 'progress') {
    return kind === 'step' || kind === 'area' || kind === 'file'
  }
  return kind === 'task'
}

/** Stateless toolbar: mode segment, kind chips, impact toggle, warn badge, fit. */
export function ViewerToolbar({
  mode,
  onModeChange,
  impactOn,
  onToggleImpact,
  kindFilter,
  onToggleKind,
  warningsCount,
  warnOpen,
  onToggleWarn,
  onFit
}: {
  mode: ViewerMode
  onModeChange: (mode: ViewerMode) => void
  impactOn: boolean
  onToggleImpact: () => void
  kindFilter: Set<WakiiNodeKind>
  onToggleKind: (kind: WakiiNodeKind) => void
  warningsCount: number
  warnOpen: boolean
  onToggleWarn: () => void
  onFit: () => void
}): React.JSX.Element {
  return (
    <div className="wakii-toolbar">
      <div className="wakii-seg" role="tablist">
        <button
          type="button"
          className={cn(mode === 'progress' && 'wakii-on')}
          onClick={() => onModeChange('progress')}
          data-testid="wakii-mode-progress"
        >
          {translate('auto.viewer.viewer-toolbar.modeProgress.a7b8c9d0e1', 'Progress')}
        </button>
        <button
          type="button"
          className={cn(mode === 'logic' && 'wakii-on')}
          onClick={() => onModeChange('logic')}
          data-testid="wakii-mode-logic"
        >
          {translate('auto.viewer.viewer-toolbar.modeLogic.b8c9d0e1f2', 'Logic & Impact')}
        </button>
      </div>
      <div className="wakii-chips">
        {CHIP_KINDS.map(({ kind, key, fallback }) => (
          <button
            key={kind}
            type="button"
            className={cn('wakii-chip', kindFilter.has(kind) && 'wakii-on')}
            disabled={kindChipDisabled(kind, mode)}
            onClick={() => onToggleKind(kind)}
            data-kind={kind}
          >
            {translate(key, fallback)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={cn('wakii-tbtn', impactOn && 'wakii-on')}
        style={{ display: mode === 'logic' ? undefined : 'none' }}
        onClick={onToggleImpact}
        data-testid="wakii-impact-toggle"
      >
        {translate('auto.viewer.viewer-toolbar.impactLayer.c9d0e1f2a3', 'Impact layer')}
      </button>
      <div className="wakii-spacer" />
      {warningsCount > 0 ? (
        <button
          type="button"
          className={cn('wakii-tbtn', 'wakii-tbtn-warn', warnOpen && 'wakii-on')}
          onClick={onToggleWarn}
          data-testid="wakii-warn-badge"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span>
            {translate('auto.viewer.viewer-toolbar.warnings.d0e1f2a3b4', 'decode warnings')}{' '}
            {`(${warningsCount})`}
          </span>
        </button>
      ) : null}
      <button type="button" className="wakii-tbtn" onClick={onFit} data-testid="wakii-fit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        {translate('auto.viewer.viewer-toolbar.fit.e1f2a3b4c5', 'Fit view')}
      </button>
    </div>
  )
}
