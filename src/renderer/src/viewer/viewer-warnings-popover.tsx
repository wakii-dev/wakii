import { translate } from '@/i18n/i18n'

/**
 * Decode-warnings popover — the list box shown next to the toolbar badge.
 * `decodeWarnings[]` rides the decoded payload; the valid remainder still renders.
 */
export function ViewerWarningsPopover({
  warnings,
  open
}: {
  warnings: string[]
  open: boolean
}): React.JSX.Element {
  return (
    <div
      className={open ? 'wakii-warnbox wakii-warnbox-show' : 'wakii-warnbox'}
      data-testid="wakii-warnbox"
    >
      {warnings.map((warning, i) => (
        <div key={`${warning}:${i}`}>{warning}</div>
      ))}
      {warnings.length === 0 ? (
        <div>
          {translate('auto.viewer.viewer-warnings-popover.empty.5e6f7a8b9c', 'No decode warnings.')}
        </div>
      ) : null}
    </div>
  )
}
