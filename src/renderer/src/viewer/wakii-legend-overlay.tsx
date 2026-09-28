import { translate } from '@/i18n/i18n'
import type { ViewerMode } from './wakii-graph-layout'
import { STATE_COLOR } from './wakii-graph-nodes'

function StateLegend(): React.JSX.Element {
  // `complete` is the decoder's derived epic state — same color as done, skipped like the prototype.
  // Literal fallbacks per row: the localization extraction reads string literals.
  return (
    <>
      <div className="wakii-lg">
        <span className="wakii-dot" style={{ background: STATE_COLOR.done }} />
        {translate('auto.viewer.wakii-legend-overlay.stateDone.1a2b3c4d5e', 'Done')}
      </div>
      <div className="wakii-lg">
        <span className="wakii-dot" style={{ background: STATE_COLOR['in-progress'] }} />
        {translate('auto.viewer.wakii-legend-overlay.stateInProgress.2b3c4d5e6f', 'In progress')}
      </div>
      <div className="wakii-lg">
        <span className="wakii-dot" style={{ background: STATE_COLOR.pending }} />
        {translate('auto.viewer.wakii-legend-overlay.statePending.3c4d5e6f7a', 'Pending')}
      </div>
      <div className="wakii-lg">
        <span className="wakii-dot" style={{ background: STATE_COLOR.blocked }} />
        {translate('auto.viewer.wakii-legend-overlay.stateBlocked.4d5e6f7a8b', 'Blocked')}
      </div>
    </>
  )
}

const SAMPLE_CLASS: Record<string, string> = {
  solid: 'wakii-lg',
  dash: 'wakii-lg wakii-dash',
  dotd: 'wakii-lg wakii-dotd'
}

/** Bottom-right legend, mode-aware (state dots + rel samples + computed/curated). */
export function WakiiLegendOverlay({
  mode,
  impactOn
}: {
  mode: ViewerMode
  impactOn: boolean
}): React.JSX.Element {
  return (
    <div className="wakii-legend">
      <StateLegend />
      {(mode === 'progress'
        ? [
            ['solid', 'contains'],
            ['dash', 'depends-on']
          ]
        : [
            ['solid', 'flows-to'],
            ['dotd', 'impacts'],
            ['dash', 'writes']
          ]
      ).map(([sample, rel]) => (
        <div key={rel} className={SAMPLE_CLASS[sample]}>
          <span className="wakii-lgsample" />
          {rel}
        </div>
      ))}
      {mode === 'logic' && impactOn ? (
        <>
          <div className="wakii-lg wakii-dash">
            <span className="wakii-lgsample" />
            {translate('auto.viewer.wakii-legend-overlay.computedFile.5e6f7a8b9c', 'computed file')}
          </div>
          <div className="wakii-lg">
            <span className="wakii-lgsample" />
            {translate('auto.viewer.wakii-legend-overlay.curatedFile.6f7a8b9c0d', 'curated file')}
          </div>
        </>
      ) : null}
    </div>
  )
}
