// Why: one coalesced storyDetail read per client+host+story with the relay↔direct
// cutover retry cap, writing through to the persisted snapshot only on a proven
// response (pattern home-host-worktree-fetch + story-list-host-fetch). Failures
// never touch the cache.
import type {
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult
} from '../../../src/shared/superpowers/story-rpc-contract'
import { sendSingleFlightRequest } from '../transport/request-single-flight'
import type { RpcClient } from '../transport/rpc-client'
import { isLogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import { saveStoryDetailSnapshot } from './story-screen-cache'

// Why: a relay↔direct cutover rejects in-flight reads without ever leaving 'connected',
// so the read was interrupted, not answered — re-issue on the replacement session, capped.
const CUTOVER_RETRY_LIMIT = 2

export type StoryDetailFetchOutcome =
  | { kind: 'ok'; detail: SuperpowersStoryDetailResult }
  // Distinct from 'unavailable': the host answered that this storyId is gone — the
  // hook keeps the cached detail and raises a separate not-found state (T9 banner).
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

export function fetchStoryDetail(
  client: RpcClient,
  hostId: string,
  storyId: string,
  disposed: () => boolean
): Promise<StoryDetailFetchOutcome> {
  const attempt = (cutoverRetriesLeft: number): Promise<StoryDetailFetchOutcome> =>
    sendSingleFlightRequest(client, hostId, 'superpowers.storyDetail', { storyId })
      .then((response) => {
        if (disposed()) {
          return { kind: 'unavailable' } as const
        }
        if (!response.ok) {
          // Not-ok (every transport/other error kind) is a failed refresh — the last
          // good detail stays cached.
          return { kind: 'unavailable' } as const
        }
        // The desktop method answers story_not_found inside an ok response (never throws).
        const result = response.result as SuperpowersStoryDetailResult | SuperpowersStoryDetailError
        if ('error' in result) {
          return { kind: 'not-found' } as const
        }
        // parseError stories still arrive as a detail with empty sfs — the data layer
        // does not filter; the UI renders the flag (T6).
        saveStoryDetailSnapshot(hostId, storyId, result)
        return { kind: 'ok', detail: result } as const
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
