import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'
import { MobileStoryListScreen } from './MobileStoryListScreen'
import { storyRowKey } from './story-list-groups'
import {
  PARSE_ERROR_ENTRY_LABEL,
  REFRESH_HINT,
  STORY_LIST_TITLE,
  storyProgressLabel
} from './story-screen-copy'
import {
  storyListDuplicateStoryIdAcrossWorktrees,
  storyListHappyPath,
  storyListWithParseError,
  storyListItemParseError
} from './story-rpc-fixtures'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn()
}))
// The real fetch module write-throughs via saveStoryListSnapshot — both halves of
// the cache module must exist or the fetch's then-chain throws into 'unavailable'.
const cache = vi.hoisted(() => ({
  loadStoryListSnapshot: vi.fn(),
  saveStoryListSnapshot: vi.fn()
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AppState: {
    get currentState() {
      return appState.currentState
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listener = listener
      return { remove: appState.remove }
    }
  },
  Pressable: 'Pressable',
  RefreshControl: (props: { refreshing: boolean; onRefresh: () => void }) =>
    createElement('RefreshControl', props),
  SectionList: ({
    sections,
    renderItem,
    renderSectionHeader,
    refreshControl,
    ListEmptyComponent
  }: {
    sections: { key: string; data: SuperpowersStoryListItem[] }[]
    renderItem: (info: { item: SuperpowersStoryListItem }) => ReactElement
    renderSectionHeader: (info: { section: { key: string } }) => ReactElement
    refreshControl?: ReactElement
    ListEmptyComponent?: ReactElement
  }) =>
    createElement(
      'SectionList',
      null,
      refreshControl ?? null,
      sections.length === 0 ? ListEmptyComponent : null,
      sections.flatMap((section) => [
        createElement(
          'SectionHeader',
          { key: `header:${section.key}` },
          renderSectionHeader({ section })
        ),
        ...section.data.map((item) =>
          createElement('SectionRow', { key: storyRowKey(item) }, renderItem({ item }))
        )
      ])
    ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ Bell: 'Bell' }))
vi.mock('./story-screen-cache', () => ({
  loadStoryListSnapshot: cache.loadStoryListSnapshot,
  saveStoryListSnapshot: cache.saveStoryListSnapshot
}))

describe('MobileStoryListScreen', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    cache.loadStoryListSnapshot.mockReset()
    cache.loadStoryListSnapshot.mockResolvedValue(null)
    cache.saveStoryListSnapshot.mockReset()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function fakeClient(sendRequest: ReturnType<typeof vi.fn>): RpcClient {
    return { sendRequest, subscribe: vi.fn(() => () => {}) } as unknown as RpcClient
  }

  // The single-flight fetch chain needs several microtask hops before setStories lands.
  async function flushMicrotasks(hops = 10): Promise<void> {
    for (let i = 0; i < hops; i++) {
      await Promise.resolve()
    }
  }

  async function renderScreen(
    sendRequest: ReturnType<typeof vi.fn>,
    onOpenStory: (storyId: string) => void = () => {}
  ): Promise<void> {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryListScreen, {
          client: fakeClient(sendRequest),
          hostId: 'host-1',
          bottomInset: 0,
          onOpenStory
        })
      )
      await flushMicrotasks()
    })
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

  function rowPressable(story: SuperpowersStoryListItem): {
    disabled?: boolean
    onPress: () => void
  } {
    return renderer!.root.findByProps({ testID: `story-row:${storyRowKey(story)}` }).props
  }

  it('renders one section per worktree with progress for healthy rows', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyListHappyPath }))
    const rendered = texts()
    expect(rendered).toContain(STORY_LIST_TITLE)
    expect(rendered).toContain('orca')
    expect(rendered).toContain('atlas')
    const first = storyListHappyPath.stories[0]
    expect(rendered).toContain(first.title)
    expect(rendered).toContain(first.epicId)
    expect(rendered).toContain(storyProgressLabel(first.sfDone, first.sfTotal))
  })

  it('flags a parseError row, disables its tap, and keeps healthy rows tappable', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyListWithParseError }))
    expect(texts()).toContain(PARSE_ERROR_ENTRY_LABEL)
    expect(rowPressable(storyListItemParseError).disabled).toBe(true)
    const healthy = storyListHappyPath.stories[0]
    expect(rowPressable(healthy).disabled).toBe(false)
    // The broken bracket's meaningless 0/0 progress is replaced by the flag.
    expect(texts()).not.toContain(storyProgressLabel(0, 0))
  })

  it('renders the same bracket name in two worktrees as two distinct rows', async () => {
    await renderScreen(
      vi.fn().mockResolvedValue({ ok: true, result: storyListDuplicateStoryIdAcrossWorktrees })
    )
    // Same storyId in both groups: worktree-scoped keys must keep both rows renderable.
    const [first, second] = storyListDuplicateStoryIdAcrossWorktrees.stories
    expect(rowPressable(first).disabled).toBe(false)
    expect(rowPressable(second).disabled).toBe(false)
    const rendered = texts()
    expect(rendered).toContain('orca')
    expect(rendered).toContain('atlas')
  })

  it('tapping a healthy row hands the raw storyId to the route layer', async () => {
    const onOpenStory = vi.fn()
    await renderScreen(
      vi.fn().mockResolvedValue({ ok: true, result: storyListHappyPath }),
      onOpenStory
    )
    const story = storyListHappyPath.stories[0]
    act(() => {
      rowPressable(story).onPress()
    })
    expect(onOpenStory).toHaveBeenCalledTimes(1)
    expect(onOpenStory).toHaveBeenCalledWith(story.storyId)
  })

  it('drives RefreshControl from the hook pull state', async () => {
    let releasePull: ((response: unknown) => void) | null = null
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: storyListHappyPath })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releasePull = () => resolve({ ok: true, result: storyListHappyPath })
          })
      )
    await renderScreen(sendRequest)
    const refreshControl = () => renderer!.root.findByType('RefreshControl').props
    expect(refreshControl().refreshing).toBe(false)

    await act(async () => {
      refreshControl().onRefresh()
      await flushMicrotasks()
    })
    expect(refreshControl().refreshing).toBe(true)

    await act(async () => {
      releasePull?.(undefined)
      await flushMicrotasks()
    })
    expect(refreshControl().refreshing).toBe(false)
    expect(sendRequest).toHaveBeenCalledTimes(2)
  })

  it('keeps pull-to-refresh available on the empty list path', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: { stories: [] } }))
    expect(texts()).toContain(REFRESH_HINT)
    // Cold start / first-fetch-fail must still offer the pull gesture.
    expect(renderer!.root.findByType('RefreshControl').props.refreshing).toBe(false)
  })
})
