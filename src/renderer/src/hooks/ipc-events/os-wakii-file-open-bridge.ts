import { toast } from 'sonner'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-mindmap-types'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { isFloatingWorkspacePanelVisible } from '@/lib/floating-workspace-terminal-actions'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'

/**
 * Opens a decoded `.wakii` payload as a mindmap viewer tab in the floating workspace,
 * enabling + revealing that panel when it is hidden. Shared by the OS-open bridge and
 * the file explorer's .wakii route — both are explicit asks for the file.
 */
export async function openWakiiFileRevealingFloatingWorkspace(
  payload: WakiiFileOpenPayload
): Promise<void> {
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
    void openWakiiFileRevealingFloatingWorkspace(payload).catch(reportOsRequestedWakiiFailure)
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
          void openWakiiFileRevealingFloatingWorkspace(payload).catch(reportOsRequestedWakiiFailure)
        }
      })
      .catch(reportOsRequestedWakiiFailure)
  }
}
