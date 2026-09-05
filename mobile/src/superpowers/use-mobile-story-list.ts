import { useCallback, useEffect, useRef, useState } from 'react'
import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'
import type { RpcClient } from '../transport/rpc-client'
import { fetchStoryList, type StoryListFetchOutcome } from './story-list-host-fetch'
import { loadStoryListSnapshot } from './story-screen-cache'
import { startStoryScreenRefresh } from './story-screen-refresh'

export type MobileStoryList = {
  /** Last known stories — persisted seed or last successful fetch; never cleared by a failure. */
  stories: SuperpowersStoryListItem[]
  /** The most recent fetch attempt failed; `stories` may be the last good list. */
  stale: boolean
  /** True until the first fetch attempt after mount or host switch settles. */
  loading: boolean
  /** Pull-to-refresh in flight. */
  refreshing: boolean
  /** Pull-to-refresh handler for the list's RefreshControl. */
  refresh: () => void
}

/** Cache-first story list data: seeds the persisted snapshot immediately, then
 *  fetches over RPC and keeps the list fresh via `startStoryScreenRefresh`. */
export function useMobileStoryList(args: {
  client: RpcClient | null
  hostId: string | undefined
}): MobileStoryList {
  const { client, hostId } = args
  const [stories, setStories] = useState<SuperpowersStoryListItem[]>([])
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const attemptRef = useRef<(options: { pull?: boolean }) => Promise<void>>(async () => {})

  useEffect(() => {
    if (!client || !hostId) {
      setLoading(false)
      return
    }
    let disposed = false
    let firstAttemptSettled = false
    let okSettled = false
    // A host/client swap must never show the previous host's list, not even while re-seeding.
    setStories([])
    setStale(false)
    setLoading(true)

    const apply = (outcome: StoryListFetchOutcome): void => {
      if (outcome.kind === 'ok') {
        okSettled = true
        setStories(outcome.stories)
        setStale(false)
      } else {
        // Keep the last good list — only flag it as no longer live (markUnavailable pattern).
        setStale(true)
      }
    }

    const attempt = async (options: { pull?: boolean }): Promise<void> => {
      if (options.pull) {
        setRefreshing(true)
      }
      // fetchStoryList always settles with an outcome (never rejects), so no try/finally.
      const outcome = await fetchStoryList(client, hostId, () => disposed)
      if (disposed) {
        return
      }
      apply(outcome)
      if (!firstAttemptSettled) {
        firstAttemptSettled = true
        setLoading(false)
      }
      if (options.pull) {
        setRefreshing(false)
      }
    }
    attemptRef.current = attempt

    // Cache-first: paint the persisted snapshot before the first RPC answers — but never
    // over a fetch that already settled ok (a genuinely empty list must stay empty).
    void loadStoryListSnapshot(hostId).then((snapshot) => {
      if (disposed || okSettled || !snapshot) {
        return
      }
      setStories(snapshot.stories)
    })

    const stopRefresh = startStoryScreenRefresh({ client, refresh: () => void attempt({}) })
    return () => {
      disposed = true
      stopRefresh()
    }
  }, [client, hostId])

  const refresh = useCallback(() => {
    if (!client || !hostId) {
      return
    }
    void attemptRef.current({ pull: true })
  }, [client, hostId])

  return { stories, stale, loading, refreshing, refresh }
}
