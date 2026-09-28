import { toast } from 'sonner'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'
import { translate } from '@/i18n/i18n'

const WAKII_OPEN_MARKER = '[wakii-open]'

function reportOsRequestedWakiiFailure(error: unknown): void {
  console.error('Failed to receive .wakii files requested by the OS:', error)
  toast.error(
    translate(
      'auto.hooks.ipc.events.os.wakii.file.open.bridge.failed',
      'Failed to open the Wakii mindmap file: {{message}}',
      { message: error instanceof Error ? error.message : String(error) }
    )
  )
}

/**
 * Receipt surface for `.wakii` files the OS shell handed to Orca (double-click / "Open With").
 * Main has already read, capped, and validated each file: payloads arrive decoded or carrying
 * a per-file error. The viewer tab replaces the success marker in SF-3; the toast is the
 * error surface until then.
 */
async function handleOsRequestedWakiiPayloads(payloads: WakiiFileOpenPayload[]): Promise<void> {
  // Why the shape check: this payload crosses the preload boundary, so a stale or mismatched
  // preload can hand back something that is not an array. Iterating that throws inside the
  // promise chain rather than failing loudly at the boundary.
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return
  }
  for (const payload of payloads) {
    if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
      const message =
        typeof payload.error.message === 'string' ? payload.error.message : 'unknown error'
      console.error(`${WAKII_OPEN_MARKER} failed: ${payload.path} (${payload.error.code})`)
      toast.error(
        translate(
          'auto.hooks.ipc.events.os.wakii.file.open.bridge.failed',
          'Failed to open the Wakii mindmap file: {{message}}',
          { message }
        )
      )
      continue
    }
    // Why logged: until SF-3's viewer tab, receiving a valid mindmap is observable here.
    console.info(`${WAKII_OPEN_MARKER} received mindmap: ${payload.path}`)
  }
}

export function registerOsWakiiFileOpenBridge(unsubs: (() => void)[]): void {
  // Why the push is singular while the pull is a batch: main pushes one decoded file per
  // event (spec contract), and the cold-start pull drains the whole queue at once.
  const unsubscribe = window.api.ui.onOpenWakiiFile?.((payload) => {
    void handleOsRequestedWakiiPayloads([payload]).catch(reportOsRequestedWakiiFailure)
  })
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }

  // Why: a cold-start double-click resolves before this listener attaches; drain what main queued.
  const pending = window.api.ui.consumePendingWakiiFileOpens?.()
  if (pending && typeof pending.then === 'function') {
    void pending.then(handleOsRequestedWakiiPayloads).catch(reportOsRequestedWakiiFailure)
  }
}
