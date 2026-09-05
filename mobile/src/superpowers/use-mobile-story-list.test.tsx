import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { StoryListFetchOutcome } from './story-list-host-fetch'
import { storyListHappyPath, storyListWithParseError } from './story-rpc-fixtures'
import { useMobileStoryList, type MobileStoryList } from './use-mobile-story-list'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn()
}))
const cache = vi.hoisted(() => ({ loadStoryListSnapshot: vi.fn() }))
const fetch = vi.hoisted(() => ({ fetchStoryList: vi.fn() }))

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
vi.mock('./story-screen-cache', () => ({ loadStoryListSnapshot: cache.loadStoryListSnapshot }))
vi.mock('./story-list-host-fetch', () => ({ fetchStoryList: fetch.fetchStoryList }))

const HOST_A = 'host-a'
const HOST_B = 'host-b'
const SEEDED = storyListHappyPath.stories
const FRESH = storyListWithParseError.stories

describe('useMobileStoryList', () => {
  let resolvers: ((outcome: StoryListFetchOutcome) => void)[]
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
    cache.loadStoryListSnapshot.mockReset()
    cache.loadStoryListSnapshot.mockResolvedValue(null)
    fetch.fetchStoryList.mockReset()
    fetch.fetchStoryList.mockImplementation(
      () =>
        new Promise<StoryListFetchOutcome>((resolve) => {
          resolvers.push(resolve)
        })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountStoryList(hostId: string): {
    state: MobileStoryList
    flush: () => Promise<void>
    settle: (index: number, outcome: StoryListFetchOutcome) => Promise<void>
    fetchCalls: () => string[]
    rebind: (hostId: string) => void
    unmount: () => void
  } {
    let latest: MobileStoryList | null = null
    function Probe({ probeHostId }: { probeHostId: string }) {
      latest = useMobileStoryList({ client, hostId: probeHostId })
      return null
    }
    let renderer!: ReturnType<typeof create>
    act(() => {
      // A leaked previous-test renderer keeps polling into this test's clock.
      lastRenderer?.unmount()
      renderer = create(createElement(Probe, { probeHostId: hostId }))
      lastRenderer = renderer
    })
    return {
      get state(): MobileStoryList {
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
      fetchCalls: () => fetch.fetchStoryList.mock.calls.map((call) => call[1] as string),
      rebind(hostId: string) {
        act(() => {
          renderer.update(createElement(Probe, { probeHostId: hostId }))
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
    cache.loadStoryListSnapshot.mockResolvedValue({ stories: SEEDED, savedAt: 7 })
    const screen = mountStoryList(HOST_A)

    await screen.flush()
    // Cache-first paint happens while the RPC is still in flight.
    expect(screen.state.stories).toEqual(SEEDED)
    expect(screen.state.loading).toBe(true)

    await screen.settle(0, { kind: 'ok', stories: FRESH })
    expect(screen.state.stories).toEqual(FRESH)
    expect(screen.state.loading).toBe(false)
    expect(screen.state.stale).toBe(false)
    expect(cache.loadStoryListSnapshot).toHaveBeenCalledWith(HOST_A)
  })

  it('does not let a successful fetch clobber a younger persisted seed', async () => {
    // Reversed settle order: fetch answers before the AsyncStorage read resolves.
    cache.loadStoryListSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ stories: FRESH, savedAt: 7 }), 100)
        })
    )
    const screen = mountStoryList(HOST_A)

    await screen.settle(0, { kind: 'ok', stories: SEEDED })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.state.stories).toEqual(SEEDED)
  })

  it('does not resurrect the seed when the fetch legitimately returns an empty list', async () => {
    cache.loadStoryListSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ stories: SEEDED, savedAt: 7 }), 100)
        })
    )
    const screen = mountStoryList(HOST_A)

    await screen.settle(0, { kind: 'ok', stories: [] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.state.stories).toEqual([])
    expect(screen.state.stale).toBe(false)
  })

  it('renders empty and flags stale when nothing is persisted and the fetch fails', async () => {
    const screen = mountStoryList(HOST_A)

    expect(screen.state.loading).toBe(true)
    await screen.settle(0, { kind: 'unavailable' })

    expect(screen.state.stories).toEqual([])
    expect(screen.state.stale).toBe(true)
    expect(screen.state.loading).toBe(false)
  })

  it('keeps the last good list and flags stale when a refresh fails, then recovers', async () => {
    const screen = mountStoryList(HOST_A)
    await screen.settle(0, { kind: 'ok', stories: SEEDED })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.fetchCalls()).toHaveLength(2)
    await screen.settle(1, { kind: 'unavailable' })
    expect(screen.state.stories).toEqual(SEEDED)
    expect(screen.state.stale).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await screen.settle(2, { kind: 'ok', stories: FRESH })
    expect(screen.state.stories).toEqual(FRESH)
    expect(screen.state.stale).toBe(false)
  })

  it('polls every 60s while foregrounded, pauses in background, refreshes on foreground return', async () => {
    const screen = mountStoryList(HOST_A)
    expect(screen.fetchCalls()).toEqual([HOST_A])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(screen.fetchCalls()).toEqual([HOST_A, HOST_A, HOST_A])

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
    const screen = mountStoryList(HOST_A)
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
    const screen = mountStoryList(HOST_A)
    await screen.settle(0, { kind: 'ok', stories: SEEDED })

    await act(async () => {
      screen.state.refresh()
    })
    expect(screen.state.refreshing).toBe(true)
    expect(screen.fetchCalls()).toHaveLength(2)

    await screen.settle(1, { kind: 'unavailable' })
    expect(screen.state.refreshing).toBe(false)
    expect(screen.state.stories).toEqual(SEEDED)
    expect(screen.state.stale).toBe(true)
  })

  it('clears state on host switch and seeds the new host from its snapshot', async () => {
    cache.loadStoryListSnapshot.mockImplementation(async (hostId: string) =>
      hostId === HOST_B ? { stories: FRESH, savedAt: 9 } : null
    )
    const screen = mountStoryList(HOST_A)
    await screen.settle(0, { kind: 'ok', stories: SEEDED })
    expect(screen.state.stories).toEqual(SEEDED)

    screen.rebind(HOST_B)
    expect(screen.state.stories).toEqual([])
    expect(screen.state.loading).toBe(true)
    const callsAfterRebind = screen.fetchCalls().slice(-1)
    expect(callsAfterRebind).toEqual([HOST_B])

    await screen.flush()
    expect(screen.state.stories).toEqual(FRESH)
  })

  it('does not fetch and settles loading without a host', () => {
    const screen = mountStoryList('')

    expect(screen.fetchCalls()).toEqual([])
    expect(screen.state.loading).toBe(false)
    expect(screen.state.stories).toEqual([])
  })

  it('tears down the poll, AppState listener, and subscription on unmount', async () => {
    const screen = mountStoryList(HOST_A)
    screen.unmount()

    expect(unsubscribe).toHaveBeenCalled()
    expect(appState.remove).toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(screen.fetchCalls()).toHaveLength(1)
  })
})
