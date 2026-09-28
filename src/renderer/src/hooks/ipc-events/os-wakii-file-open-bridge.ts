import { toast } from 'sonner'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-mindmap-types'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { isFloatingWorkspacePanelVisible } from '@/lib/floating-workspace-terminal-actions'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'

/**
 * Opens `.wakii` files the OS shell handed to Wakii ("Open With" / double-click) in
 * the floating workspace as mindmap viewer tabs. Payloads are already decoded by
 * main — this glue only routes them into the editor slice.
 */
async function openOsRequestedWakiiFile(payload: WakiiFileOpenPayload): Promise<void> {
  const store = useAppStore.getState()
  store.openWakiiViewerFile(payload)
  // Why enabled here: the user asked the OS for this file, and the tabs above are already in a
  // surface a disabled floating workspace never renders. Same enable-then-reveal as the markdown bridge.
  if (store.settings?.floatingTerminalEnabled !== true) {
    await store.updateSettings({ floatingTerminalEnabled: true })
  }
  // Why deferred a frame: the panel only honors the toggle once the enabled flag has reached React.
  requestAnimationFrame(() => {
    if (!isFloatingWorkspacePanelVisible()) {
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
  const unsubscribe = window.api.ui.onOpenWakiiFile?.((payload) => {
    void openOsRequestedWakiiFile(payload).catch(reportOsRequestedWakiiFailure)
  })
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }

  // Why: a cold-start "Open With" resolves before this listener attaches; drain what main queued.
  const pending = window.api.ui.consumePendingWakiiFileOpens?.()
  if (pending && typeof pending.then === 'function') {
    void pending
      .then((payloads) => {
        for (const payload of payloads ?? []) {
          void openOsRequestedWakiiFile(payload).catch(reportOsRequestedWakiiFailure)
        }
      })
      .catch(reportOsRequestedWakiiFailure)
  }
}
