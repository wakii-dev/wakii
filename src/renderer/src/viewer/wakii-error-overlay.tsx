import { translate } from '@/i18n/i18n'

/**
 * Full-canvas overlay for a payload main refused to decode — no partial render
 * (spec §8). `onClose` exists only for the dev "simulate error" toggle; a real
 * error payload leaves the card up until the tab is closed.
 */
export function WakiiErrorOverlay({
  code,
  message,
  path,
  onClose
}: {
  code: string
  message: string
  path: string
  onClose?: () => void
}): React.JSX.Element {
  return (
    <div className="wakii-errbox" data-testid="wakii-errbox">
      <div className="wakii-errcard">
        <div className="wakii-erricon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <div className="wakii-errh">
          {translate('auto.viewer.wakii-error-overlay.title.6f7a8b9c0d', 'Cannot open the file')}
        </div>
        <span className="wakii-errcode">{`error.code = ${code}`}</span>
        <div className="wakii-errmsg">{message}</div>
        <div className="wakii-errpath">{path}</div>
        <div className="wakii-errhint">
          {translate(
            'auto.viewer.wakii-error-overlay.hint.7a8b9c0d1e',
            'The file was rejected while decoding (main process) — nothing was rendered partially. Check the file content or reopen it from the app.'
          )}
        </div>
        {onClose ? (
          <div className="wakii-erractions">
            <button type="button" className="wakii-tbtn" onClick={onClose}>
              {translate('auto.viewer.wakii-error-overlay.close.8b9c0d1e2f', 'Close')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
