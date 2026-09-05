import { useCallback, useEffect, useRef, useState } from 'react'
import type { SuperpowersStoryDetailResult } from '../../../src/shared/superpowers/story-rpc-contract'
import type { RpcClient } from '../transport/rpc-client'
import { fetchStoryDetail, type StoryDetailFetchOutcome } from './story-detail-host-fetch'
import { loadStoryDetailSnapshot } from './story-screen-cache'
import { startStoryScreenRefresh } from './story-screen-refresh'

export type MobileStoryDetail = {
  /** Last known detail — persisted seed or last successful fetch; never cleared by a failure. */
  detail: SuperpowersStoryDetailResult | null
  /** The host most recently answered story_not_found — the story is gone/renamed;
   *  `detail` may still hold the cached copy to render under the banner (T9). */
  notFound: boolean
  /** The most recent fetch attempt failed to answer; `detail` may be the last good detail. */
  stale: boolean
  /** True until the first fetch attempt after mount or host/story switch settles. */
  loading: boolean
  /** Pull-to-refresh in flight. */
  refreshing: boolean
  /** Pull-to-refresh handler for the screen's RefreshControl. */
  refresh: () => void
}

/** Cache-first story detail data: seeds the persisted snapshot immediately, then
 *  fetches over RPC and keeps the detail fresh via `startStoryScreenRefresh`. */
export function useMobileStoryDetail(args: {
  client: RpcClient | null
  hostId: string | undefined
  storyId: string | undefined
}): MobileStoryDetail {
  const { client, hostId, storyId } = args
  const [detail, setDetail] = useState<SuperpowersStoryDetailResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const attemptRef = useRef<(options: { pull?: boolean }) => Promise<void>>(async () => {})

  useEffect(() => {
    if (!client || !hostId || !storyId) {
      setLoading(false)
      return
    }
    let disposed = false
    let firstAttemptSettled = false
    let okSettled = false
    // A host/story swap must never show the previous story's detail, not even while re-seeding.
    setDetail(null)
    setNotFound(false)
    setStale(false)
    setLoading(true)

    const apply = (outcome: StoryDetailFetchOutcome): void => {
      if (outcome.kind === 'ok') {
        okSettled = true
        setDetail(outcome.detail)
        setNotFound(false)
        setStale(false)
      } else if (outcome.kind === 'not-found') {
        // The host answered: the story is gone. Keep any cached detail under the banner;
        // this is an answer, not a failed refresh, so stale clears.
        setNotFound(true)
        setStale(false)
      } else {
        // Keep the last good detail — only flag it as no longer live (markUnavailable
        // pattern). A network failure is not evidence the story exists again, so
        // notFound stays as-is.
        setStale(true)
      }
    }

    const attempt = async (options: { pull?: boolean }): Promise<void> => {
      if (options.pull) {
        setRefreshing(true)
      }
      // fetchStoryDetail always settles with an outcome (never rejects), so no try/finally.
      const outcome = await fetchStoryDetail(client, hostId, storyId, () => disposed)
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
    // over a fetch that already settled ok (a genuinely changed detail must stay fresh).
    void loadStoryDetailSnapshot(hostId, storyId).then((snapshot) => {
      if (disposed || okSettled || !snapshot) {
        return
      }
      setDetail(snapshot.detail)
    })

    const stopRefresh = startStoryScreenRefresh({ client, refresh: () => void attempt({}) })
    return () => {
      disposed = true
      stopRefresh()
    }
  }, [client, hostId, storyId])

  const refresh = useCallback(() => {
    if (!client || !hostId || !storyId) {
      return
    }
    void attemptRef.current({ pull: true })
  }, [client, hostId, storyId])

  return { detail, notFound, stale, loading, refreshing, refresh }
}
