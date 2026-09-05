import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { StoryDetailFetchOutcome } from './story-detail-host-fetch'
import { storyDetailHappyPath } from './story-rpc-fixtures'
import { useMobileStoryDetail, type MobileStoryDetail } from './use-mobile-story-detail'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn()
}))
const cache = vi.hoisted(() => ({ loadStoryDetailSnapshot: vi.fn() }))
const fetch = vi.hoisted(() => ({ fetchStoryDetail: vi.fn() }))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState.currentState
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listener = listener
      return { remove: appState.remove }
    }
  }
}))
vi.mock('./story-screen-cache', () => ({ loadStoryDetailSnapshot: cache.loadStoryDetailSnapshot }))
vi.mock('./story-detail-host-fetch', () => ({ fetchStoryDetail: fetch.fetchStoryDetail }))

const HOST_A = 'host-a'
const STORY_A = 'brackets/story-a.md'
const STORY_B = 'brackets/story-b.md'
const SEEDED = storyDetailHappyPath

const FRESH = {
  ...storyDetailHappyPath,
  story: { ...storyDetailHappyPath.story, title: 'SF-2 (renamed)' }
}

describe('useMobileStoryDetail', () => {
  let resolvers: ((outcome: StoryDetailFetchOutcome) => void)[]
  let eventListener: ((payload: unknown) => void) | null
  let unsubscribe: ReturnType<typeof vi.fn>
  let client: RpcClient
  let lastRenderer: ReturnType<typeof create> | null

  beforeEach(() => {
    vi.useFakeTimers()
    appState.currentState = 'active'
    appState.listener = null
    appState.remove.mockClear()
    resolvers = []
    eventListener = null
    lastRenderer = null
    unsubscribe = vi.fn()
    client = {
      subscribe: vi.fn(
        (_method: string, _params: unknown, listener: (payload: unknown) => void) => {
          eventListener = listener
          return unsubscribe
        }
      )
    } as unknown as RpcClient
    cache.loadStoryDetailSnapshot.mockReset()
    cache.loadStoryDetailSnapshot.mockResolvedValue(null)
    fetch.fetchStoryDetail.mockReset()
    fetch.fetchStoryDetail.mockImplementation(
      () =>
        new Promise<StoryDetailFetchOutcome>((resolve) => {
          resolvers.push(resolve)
        })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountStoryDetail(
    storyId: string,
    hostId = HOST_A
  ): {
    state: MobileStoryDetail
    flush: () => Promise<void>
    settle: (index: number, outcome: StoryDetailFetchOutcome) => Promise<void>
    fetchCalls: () => { hostId: string; storyId: string }[]
    rebind: (storyId: string, hostId?: string) => void
    unmount: () => void
  } {
    let latest: MobileStoryDetail | null = null
    function Probe({ probeHostId, probeStoryId }: { probeHostId: string; probeStoryId: string }) {
      latest = useMobileStoryDetail({ client, hostId: probeHostId, storyId: probeStoryId })
      return null
    }
    let renderer!: ReturnType<typeof create>
    let mountedHostId = hostId
    let mountedStoryId = storyId
    act(() => {
      // A leaked previous-test renderer keeps polling into this test's clock.
      lastRenderer?.unmount()
      renderer = create(createElement(Probe, { probeHostId: hostId, probeStoryId: storyId }))
      lastRenderer = renderer
    })
    return {
      get state(): MobileStoryDetail {
        if (!latest) {
          throw new Error('probe never rendered')
        }
        return latest
      },
      async flush() {
        await act(async () => {
          await Promise.resolve()
          await Promise.resolve()
        })
      },
      async settle(index, outcome) {
        await act(async () => {
          resolvers[index]?.(outcome)
          await Promise.resolve()
        })
      },
      fetchCalls: () =>
        fetch.fetchStoryDetail.mock.calls.map((call) => ({
          hostId: call[1] as string,
          storyId: call[2] as string
        })),
      rebind(nextStoryId: string, nextHostId?: string) {
        mountedHostId = nextHostId ?? mountedHostId
        mountedStoryId = nextStoryId
        act(() => {
          renderer.update(
            createElement(Probe, { probeHostId: mountedHostId, probeStoryId: mountedStoryId })
          )
        })
      },
      unmount() {
        act(() => {
          renderer.unmount()
        })
      }
    }
  }

  it('seeds from the persisted snapshot before the first fetch answers', async () => {
    cache.loadStoryDetailSnapshot.mockResolvedValue({ detail: SEEDED, savedAt: 7 })
    const screen = mountStoryDetail(STORY_A)

    await screen.flush()
    // Cache-first paint happens while the RPC is still in flight.
    expect(screen.state.detail).toEqual(SEEDED)
    expect(screen.state.loading).toBe(true)

    await screen.settle(0, { kind: 'ok', detail: FRESH })
    expect(screen.state.detail).toEqual(FRESH)
    expect(screen.state.loading).toBe(false)
    expect(screen.state.stale).toBe(false)
    expect(screen.state.notFound).toBe(false)
    expect(cache.loadStoryDetailSnapshot).toHaveBeenCalledWith(HOST_A, STORY_A)
  })

  it('does not let a successful fetch clobber a younger persisted seed', async () => {
    // Reversed settle order: fetch answers before the AsyncStorage read resolves.
    cache.loadStoryDetailSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ detail: FRESH, savedAt: 7 }), 100)
        })
    )
    const screen = mountStoryDetail(STORY_A)

    await screen.settle(0, { kind: 'ok', detail: SEEDED })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.state.detail).toEqual(SEEDED)
  })

  it('paints the persisted seed under the not-found banner when the fetch answers first', async () => {
    // not-found is an answer, not a failed fetch — the cached copy still paints (T9).
    cache.loadStoryDetailSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ detail: SEEDED, savedAt: 7 }), 100)
        })
    )
    const screen = mountStoryDetail(STORY_A)

    await screen.settle(0, { kind: 'not-found' })
    expect(screen.state.notFound).toBe(true)
    expect(screen.state.loading).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(screen.state.detail).toEqual(SEEDED)
    expect(screen.state.notFound).toBe(true)
    expect(screen.state.stale).toBe(false)
  })

  it('renders notFound without stale when nothing is persisted and the host answers not-found', async () => {
    const screen = mountStoryDetail(STORY_A)

    expect(screen.state.loading).toBe(true)
    await screen.settle(0, { kind: 'not-found' })

    expect(screen.state.detail).toBeNull()
    expect(screen.state.notFound).toBe(true)
    expect(screen.state.stale).toBe(false)
    expect(screen.state.loading).toBe(false)
  })

  it('keeps the last good detail and flags stale when a refresh fails, then recovers', async () => {
    const screen = mountStoryDetail(STORY_A)
    await screen.settle(0, { kind: 'ok', detail: SEEDED })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.fetchCalls()).toHaveLength(2)
    await screen.settle(1, { kind: 'unavailable' })
    expect(screen.state.detail).toEqual(SEEDED)
    expect(screen.state.stale).toBe(true)
    expect(screen.state.notFound).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await screen.settle(2, { kind: 'ok', detail: FRESH })
    expect(screen.state.detail).toEqual(FRESH)
    expect(screen.state.stale).toBe(false)
  })

  it('raises the not-found banner mid-poll, keeps the cached detail, and recovers when the story returns', async () => {
    const screen = mountStoryDetail(STORY_A)
    await screen.settle(0, { kind: 'ok', detail: SEEDED })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await screen.settle(1, { kind: 'not-found' })
    expect(screen.state.detail).toEqual(SEEDED)
    expect(screen.state.notFound).toBe(true)
    expect(screen.state.stale).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await screen.settle(2, { kind: 'ok', detail: FRESH })
    expect(screen.state.detail).toEqual(FRESH)
    expect(screen.state.notFound).toBe(false)
  })

  it('polls every 60s while foregrounded, pauses in background, refreshes on foreground return', async () => {
    const screen = mountStoryDetail(STORY_A)
    expect(screen.fetchCalls()).toEqual([{ hostId: HOST_A, storyId: STORY_A }])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(screen.fetchCalls()).toHaveLength(3)

    appState.currentState = 'background'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
    })
    expect(screen.fetchCalls()).toHaveLength(3)

    appState.currentState = 'active'
    await act(async () => {
      appState.listener?.('active')
    })
    expect(screen.fetchCalls()).toHaveLength(4)
  })

  it('refetches only after the event stream replays on reconnect', async () => {
    const screen = mountStoryDetail(STORY_A)
    expect(screen.fetchCalls()).toHaveLength(1)

    await act(async () => {
      eventListener?.({ type: 'ready', subscriptionId: 'events-1' })
    })
    expect(screen.fetchCalls()).toHaveLength(1)

    await act(async () => {
      eventListener?.({ type: 'ready', subscriptionId: 'events-2' })
    })
    expect(screen.fetchCalls()).toHaveLength(2)

    // After the stream errors, the next ready is a fresh subscription, not a replay.
    await act(async () => {
      eventListener?.({ type: 'error' })
      eventListener?.({ type: 'ready', subscriptionId: 'events-3' })
    })
    expect(screen.fetchCalls()).toHaveLength(2)
  })

  it('exposes pull-to-refresh: sets refreshing, keeps data and flags stale on failure', async () => {
    const screen = mountStoryDetail(STORY_A)
    await screen.settle(0, { kind: 'ok', detail: SEEDED })

    await act(async () => {
      screen.state.refresh()
    })
    expect(screen.state.refreshing).toBe(true)
    expect(screen.fetchCalls()).toHaveLength(2)

    await screen.settle(1, { kind: 'unavailable' })
    expect(screen.state.refreshing).toBe(false)
    expect(screen.state.detail).toEqual(SEEDED)
    expect(screen.state.stale).toBe(true)
  })

  it('clears state on story switch and seeds the new story from its snapshot', async () => {
    cache.loadStoryDetailSnapshot.mockImplementation(async (_hostId: string, storyId: string) =>
      storyId === STORY_B ? { detail: FRESH, savedAt: 9 } : null
    )
    const screen = mountStoryDetail(STORY_A)
    await screen.settle(0, { kind: 'ok', detail: SEEDED })
    expect(screen.state.detail).toEqual(SEEDED)

    screen.rebind(STORY_B)
    expect(screen.state.detail).toBeNull()
    expect(screen.state.loading).toBe(true)
    expect(screen.state.notFound).toBe(false)
    const callsAfterRebind = screen.fetchCalls().slice(-1)
    expect(callsAfterRebind).toEqual([{ hostId: HOST_A, storyId: STORY_B }])

    await screen.flush()
    expect(screen.state.detail).toEqual(FRESH)
  })

  it('clears state on host switch for the same storyId', async () => {
    cache.loadStoryDetailSnapshot.mockImplementation(async (hostId: string) =>
      hostId === 'host-b' ? { detail: FRESH, savedAt: 9 } : null
    )
    const screen = mountStoryDetail(STORY_A)
    await screen.settle(0, { kind: 'ok', detail: SEEDED })

    screen.rebind(STORY_A, 'host-b')
    expect(screen.state.detail).toBeNull()
    const callsAfterRebind = screen.fetchCalls().slice(-1)
    expect(callsAfterRebind).toEqual([{ hostId: 'host-b', storyId: STORY_A }])

    await screen.flush()
    expect(screen.state.detail).toEqual(FRESH)
  })

  it('does not fetch and settles loading without a host or story', () => {
    const noStory = mountStoryDetail('')
    expect(noStory.fetchCalls()).toEqual([])
    expect(noStory.state.loading).toBe(false)
    expect(noStory.state.detail).toBeNull()

    const noHost = mountStoryDetail(STORY_A, '')
    expect(noHost.fetchCalls()).toEqual([])
    expect(noHost.state.loading).toBe(false)
  })

  it('tears down the poll, AppState listener, and subscription on unmount', async () => {
    const screen = mountStoryDetail(STORY_A)
    screen.unmount()

    expect(unsubscribe).toHaveBeenCalled()
    expect(appState.remove).toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(screen.fetchCalls()).toHaveLength(1)
  })
})
