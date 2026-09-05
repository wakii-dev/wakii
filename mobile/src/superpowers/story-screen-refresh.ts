import { AppState } from 'react-native'
import type { RuntimeClientEventStreamMessage } from '../../../src/shared/runtime-client-events'
import type { RpcClient } from '../transport/rpc-client'

// Why 60s: same cadence as REPO_METADATA_REFRESH_MS — storyList/storyDetail answers
// ride the desktop's Linear reads behind a 30s TTL. Do NOT copy the 3s worktree poll
// (WORKTREE_REFRESH_MS): it would multiply Linear reads and burn rate limit.
export const STORY_SCREEN_REFRESH_MS = 60_000

/** AppState-gated foreground poll + reconnect refetch for one story screen.
 *  Shared by the list and detail hooks. */
export function startStoryScreenRefresh(args: {
  client: RpcClient
  refresh: () => void
}): () => void {
  const { client, refresh } = args
  let disposed = false
  let eventStreamReady = false

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      refresh()
    }
  })
  const interval = setInterval(() => {
    if (AppState.currentState !== 'active') {
      return
    }
    refresh()
  }, STORY_SCREEN_REFRESH_MS)
  const unsubscribe = client.subscribe(
    'runtime.clientEvents.subscribe',
    null,
    (payload: unknown) => {
      if (disposed || !payload || typeof payload !== 'object') {
        return
      }
      const event = payload as RuntimeClientEventStreamMessage | { type: 'error' }
      if (event.type === 'ready') {
        const replayedAfterReconnect = eventStreamReady
        eventStreamReady = true
        // Why: client events are not queued while disconnected — re-read after replay.
        if (replayedAfterReconnect) {
          refresh()
        }
        return
      }
      if (event.type === 'end' || event.type === 'error') {
        eventStreamReady = false
      }
    }
  )

  refresh()

  return () => {
    disposed = true
    clearInterval(interval)
    appStateSubscription.remove()
    unsubscribe()
  }
}
