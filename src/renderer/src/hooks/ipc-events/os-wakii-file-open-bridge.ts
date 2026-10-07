import { toast } from 'sonner'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { selectFloatingWorkspacePanelVisible } from '@/store/floating-workspace-panel-selector'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'

/**
 * Opens a decoded `.wakii` payload as a mindmap viewer tab in the floating workspace,
 * enabling + revealing that panel when it is hidden. Shared by the OS-open bridge and
 * the file explorer's .wakii route — both are explicit asks for the file. Main has
 * already read, capped, and validated each file: payloads arrive decoded or carrying
 * a per-file error — the routed payload still renders the viewer's error card.
 */
export async function openWakiiFileRevealingFloatingWorkspace(
  payload: WakiiFileOpenPayload
): Promise<void> {
  // Why the runtime shape check: the payload crosses the preload boundary, so a stale or
  // mismatched preload can hand back a malformed object. The toast acknowledges the failure
  // up front; the routed payload still renders the viewer's error card.
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    const message =
      typeof payload.error.message === 'string' ? payload.error.message : 'unknown error'
    toast.error(
      translate(
        'auto.hooks.ipc.events.os.wakii.file.open.bridge.failed',
        'Failed to open the Wakii mindmap file: {{message}}',
        { message }
      )
    )
  }
  const store = useAppStore.getState()
  store.openWakiiViewerFile(payload)
  // Why enabled here: the user asked the OS for this file, and the tabs above are already in a
  // surface a disabled floating workspace never renders. Same enable-then-reveal as the markdown bridge.
  if (store.settings?.floatingTerminalEnabled !== true) {
    await store.updateSettings({ floatingTerminalEnabled: true })
  }
  // Why deferred a frame: the panel only honors the toggle once the enabled flag has reached React.
  requestAnimationFrame(() => {
    if (!selectFloatingWorkspacePanelVisible(useAppStore.getState())) {
      window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))
    }
  })
}

function reportOsRequestedWakiiFailure(error: unknown): void {
  console.error('Failed to open the .wakii file requested by the OS:', error)
  toast.error(
    translate(
      'auto.hooks.ipc.events.os.wakii.file.open.bridge.8b2c41de70',
      'Failed to open the mindmap file.'
    )
  )
}

export function registerOsWakiiFileOpenBridge(unsubs: (() => void)[]): void {
  // The push channel delivers one decoded payload per event; the pull drains the whole queue.
  const unsubscribe = window.api.ui.onOpenWakiiFile?.((payload) => {
    void openWakiiFileRevealingFloatingWorkspace(payload).catch(reportOsRequestedWakiiFailure)
  })
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }

  // Why: a cold-start double-click resolves before this listener attaches; drain what main queued.
  const pending = window.api.ui.consumePendingWakiiFileOpens?.()
  if (pending && typeof pending.then === 'function') {
    void pending
      .then((payloads) => {
        // Why the shape check: this payload crosses the preload boundary, so a stale or
        // mismatched preload can resolve with something that is not an array. Iterating that
        // throws inside the promise chain rather than failing loudly at the boundary.
        if (!Array.isArray(payloads) || payloads.length === 0) {
          return
        }
        for (const payload of payloads) {
          void openWakiiFileRevealingFloatingWorkspace(payload).catch(reportOsRequestedWakiiFailure)
        }
      })
      .catch(reportOsRequestedWakiiFailure)
  }
}
