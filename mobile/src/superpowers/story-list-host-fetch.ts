// Why: one coalesced storyList read per client+host with the relay↔direct cutover
// retry cap, writing through to the persisted snapshot only on a proven response
// (pattern home-host-worktree-fetch). Failures never touch the cache.
import type {
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from '../../../src/shared/superpowers/story-rpc-contract'
import { sendSingleFlightRequest } from '../transport/request-single-flight'
import type { RpcClient } from '../transport/rpc-client'
import { isLogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import { saveStoryListSnapshot } from './story-screen-cache'

// Why: a relay↔direct cutover rejects in-flight reads without ever leaving 'connected',
// so the read was interrupted, not answered — re-issue on the replacement session, capped.
const CUTOVER_RETRY_LIMIT = 2

export type StoryListFetchOutcome =
  | { kind: 'ok'; stories: SuperpowersStoryListItem[] }
  | { kind: 'unavailable' }

export function fetchStoryList(
  client: RpcClient,
  hostId: string,
  disposed: () => boolean
): Promise<StoryListFetchOutcome> {
  const attempt = (cutoverRetriesLeft: number): Promise<StoryListFetchOutcome> =>
    sendSingleFlightRequest(client, hostId, 'superpowers.storyList', {})
      .then((response) => {
        if (disposed()) {
          return { kind: 'unavailable' } as const
        }
        if (!response.ok) {
          // Not-ok (every error kind) is a failed refresh — the last good list stays cached.
          return { kind: 'unavailable' } as const
        }
        const result = response.result as SuperpowersStoryListResult
        // parseError entries stay in — they are valid data; the UI decides rendering (T5).
        const stories = Array.isArray(result.stories) ? result.stories : []
        saveStoryListSnapshot(hostId, stories)
        return { kind: 'ok', stories } as const
      })
      .catch((error: unknown) => {
        if (disposed()) {
          return { kind: 'unavailable' }
        }
        if (cutoverRetriesLeft > 0 && isLogicalClientCutoverError(error)) {
          return attempt(cutoverRetriesLeft - 1)
        }
        return { kind: 'unavailable' }
      })

  return attempt(CUTOVER_RETRY_LIMIT)
}
