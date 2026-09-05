// T10 back affordances: the story list carries the Gates-screen-style header row
// (back button + heading) and the detail a minimal back row — both pop the route
// through expo-router. Real hooks over a scripted client, mirroring the
// colocated screen tests.
import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { MobileStoryDetailScreen } from './MobileStoryDetailScreen'
import { MobileStoryListScreen } from './MobileStoryListScreen'
import { storyDetailHappyPath, storyListHappyPath } from './story-rpc-fixtures'
import { STORY_LIST_TITLE } from './story-screen-copy'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn(),
  colorScheme: 'dark' as string
}))
const cache = vi.hoisted(() => ({
  loadStoryListSnapshot: vi.fn(),
  saveStoryListSnapshot: vi.fn(),
  loadStoryDetailSnapshot: vi.fn(),
  saveStoryDetailSnapshot: vi.fn()
}))
const router = vi.hoisted(() => ({ back: vi.fn() }))

vi.mock('expo-router', () => ({ useRouter: () => ({ back: router.back }) }))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Appearance: {
    getColorScheme: () => appState.colorScheme,
    addChangeListener: () => ({ remove: () => {} })
  },
  AppState: {
    get currentState() {
      return appState.currentState
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listener = listener
      return { remove: appState.remove }
    }
  },
  useColorScheme: () => appState.colorScheme,
  Pressable: 'Pressable',
  RefreshControl: (props: { refreshing: boolean; onRefresh: () => void }) =>
    createElement('RefreshControl', props),
  // Section content is out of scope here — only the header row and back button
  // are under test.
  SectionList: (): null => null,
  ScrollView: ({
    children,
    refreshControl
  }: {
    children?: ReactElement
    refreshControl?: ReactElement
  }) => createElement('ScrollView', null, refreshControl ?? null, children),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 })
}))
vi.mock('lucide-react-native', () => ({ Bell: 'Bell', ChevronLeft: 'ChevronLeft' }))
vi.mock('./story-screen-cache', () => ({
  loadStoryListSnapshot: cache.loadStoryListSnapshot,
  saveStoryListSnapshot: cache.saveStoryListSnapshot,
  loadStoryDetailSnapshot: cache.loadStoryDetailSnapshot,
  saveStoryDetailSnapshot: cache.saveStoryDetailSnapshot
}))

describe('story screens back affordances (T10)', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    router.back.mockReset()
    cache.loadStoryListSnapshot.mockReset()
    cache.loadStoryListSnapshot.mockResolvedValue(null)
    cache.saveStoryListSnapshot.mockReset()
    cache.loadStoryDetailSnapshot.mockReset()
    cache.loadStoryDetailSnapshot.mockResolvedValue(null)
    cache.saveStoryDetailSnapshot.mockReset()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function fakeClient(sendRequest: ReturnType<typeof vi.fn>): RpcClient {
    return { sendRequest, subscribe: vi.fn(() => () => {}) } as unknown as RpcClient
  }

  // The single-flight fetch chains need several microtask hops to settle.
  async function flushMicrotasks(hops = 10): Promise<void> {
    for (let i = 0; i < hops; i++) {
      await Promise.resolve()
    }
  }

  function findBack() {
    return renderer!.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Back')
  }

  function texts(): string[] {
    return (
      renderer?.root
        .findAllByType('Text')
        .flatMap((node) =>
          node.children.filter((child): child is string => typeof child === 'string')
        ) ?? []
    )
  }

  it('story list renders the header with a back button that pops the route', async () => {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryListScreen, {
          client: fakeClient(vi.fn().mockResolvedValue({ ok: true, result: storyListHappyPath })),
          hostId: 'host-1',
          bottomInset: 0,
          onOpenStory: () => {}
        })
      )
      await flushMicrotasks()
    })
    expect(texts()).toContain(STORY_LIST_TITLE)
    const back = findBack()
    expect(back).toBeDefined()
    expect(back!.props.accessibilityRole).toBe('button')
    act(() => {
      back!.props.onPress()
    })
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it('story detail renders a back button that pops the route', async () => {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryDetailScreen, {
          client: fakeClient(vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })),
          hostId: 'host-1',
          storyId: storyDetailHappyPath.story.storyId,
          bottomInset: 0
        })
      )
      await flushMicrotasks()
    })
    const back = findBack()
    expect(back).toBeDefined()
    act(() => {
      back!.props.onPress()
    })
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  // Owner symptom: a pending/failed first fetch (uncached deep-link, unreachable
  // host) lands on the early-return branch — the back affordance must survive it.
  it('story list keeps the header and back button visible while the fetch is pending', async () => {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryListScreen, {
          client: fakeClient(vi.fn().mockImplementation(() => new Promise(() => {}))),
          hostId: 'host-1',
          bottomInset: 0,
          onOpenStory: () => {}
        })
      )
      await flushMicrotasks()
    })
    expect(texts()).toContain(STORY_LIST_TITLE)
    expect(findBack()).toBeDefined()
  })

  it('story detail keeps the back button visible while the fetch is pending', async () => {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryDetailScreen, {
          client: fakeClient(vi.fn().mockImplementation(() => new Promise(() => {}))),
          hostId: 'host-1',
          storyId: storyDetailHappyPath.story.storyId,
          bottomInset: 0
        })
      )
      await flushMicrotasks()
    })
    expect(findBack()).toBeDefined()
  })
})
