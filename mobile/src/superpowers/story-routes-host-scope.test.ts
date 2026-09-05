import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'
import type { RpcClient } from '../transport/rpc-client'
import { MobileStoryDetailScreen } from './MobileStoryDetailScreen'
import { MobileStoryListScreen } from './MobileStoryListScreen'
import { storyDetailHappyPath, storyListHappyPath } from './story-rpc-fixtures'

// T2 boundary: story routes must live under app/h/[hostId]/stories* and both
// story screens must take their host from route params — never a host singleton.

const appDirectory = fileURLToPath(new URL('../../app', import.meta.url))
const hostSegment = join('h', '[hostId]')
const scanExcludedDirs = new Set(['node_modules', '.git', '.expo'])

function appEntries(directory: string = appDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (scanExcludedDirs.has(entry.name)) {
        return []
      }
      const path = join(directory, entry.name)
      return [path, ...appEntries(path)]
    }
    return [join(directory, entry.name)]
  })
}

// Story routes are host-scoped only under the exact h/[hostId]/ segment —
// anything else (app/stories.tsx, app/stories/, a sibling host segment) is a leak.
const hostSegmentPrefix = hostSegment + sep

function leaksHostScope(relativePath: string): boolean {
  if (relativePath.startsWith(hostSegmentPrefix)) {
    return false
  }
  // Any 'stor*' segment counts: it catches stories.tsx as well as bracket files
  // inside a stray stories/ directory (whose own basename starts with '[').
  return relativePath.split(sep).some((segment) => /^stor/i.test(segment))
}

describe('story routes stay host-scoped on disk', () => {
  it('mounts the story list and detail routes under h/[hostId]/stories', () => {
    expect(existsSync(join(appDirectory, hostSegment, 'stories.tsx'))).toBe(true)
    expect(existsSync(join(appDirectory, hostSegment, 'stories', '[...storyId].tsx'))).toBe(true)
  })

  it('flags story-named entries anywhere outside the h/[hostId] segment', () => {
    expect(leaksHostScope('stories.tsx')).toBe(true)
    expect(leaksHostScope(join('stories', '[storyId].tsx'))).toBe(true)
    expect(leaksHostScope(join(hostSegment, 'stories.tsx'))).toBe(false)
    expect(leaksHostScope(join(hostSegment, 'stories', '[...storyId].tsx'))).toBe(false)
    // A sibling segment whose name merely contains the host segment is not the host scope.
    expect(leaksHostScope(join(`${hostSegment}-other`, 'stories.tsx'))).toBe(true)
  })

  it('finds no story route outside the host scope in the real app tree', () => {
    expect(existsSync(join(appDirectory, 'stories.tsx'))).toBe(false)
    expect(existsSync(join(appDirectory, 'stories'))).toBe(false)
    const leaks = appEntries()
      .map((path) => relative(appDirectory, path))
      .filter(leaksHostScope)
    expect(leaks).toEqual([])
  })

  it('reads the host from route params in both story route files', () => {
    for (const route of ['stories.tsx', join('stories', '[...storyId].tsx')]) {
      const source = readFileSync(join(appDirectory, hostSegment, route), 'utf8')
      // useLocalSearchParams = the host comes from the URL segment, not a singleton.
      expect(source).toMatch(/useLocalSearchParams\s*[<(]/)
      // Thin wrapper: story UI lives in src/superpowers screen modules.
      expect(source).toContain('superpowers/')
    }
  })
})

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn()
}))
// The fetch write-throughs go through the cache module — both halves must exist
// or the fetch's then-chain throws into 'unavailable'. Cache calls are also the
// observable proof that hostId (not a singleton) scopes each screen's data.
const cache = vi.hoisted(() => ({
  loadStoryListSnapshot: vi.fn(),
  saveStoryListSnapshot: vi.fn(),
  loadStoryDetailSnapshot: vi.fn(),
  saveStoryDetailSnapshot: vi.fn()
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
  ScrollView: ({
    children,
    refreshControl
  }: {
    children?: ReactElement
    refreshControl?: ReactElement
  }) => createElement('ScrollView', null, refreshControl ?? null, children),
  SectionList: ({
    sections,
    renderItem,
    refreshControl,
    ListEmptyComponent
  }: {
    sections: { data: SuperpowersStoryListItem[] }[]
    renderItem: (info: { item: SuperpowersStoryListItem }) => ReactElement
    refreshControl?: ReactElement
    ListEmptyComponent?: ReactElement
  }) =>
    createElement(
      'SectionList',
      null,
      refreshControl ?? null,
      sections.length === 0 ? ListEmptyComponent : null,
      sections.flatMap((section, sectionIndex) =>
        section.data.map((item, index) =>
          createElement('SectionRow', { key: `${sectionIndex}:${index}` }, renderItem({ item }))
        )
      )
    ),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ Bell: 'Bell' }))
vi.mock('./story-screen-cache', () => ({
  loadStoryListSnapshot: cache.loadStoryListSnapshot,
  saveStoryListSnapshot: cache.saveStoryListSnapshot,
  loadStoryDetailSnapshot: cache.loadStoryDetailSnapshot,
  saveStoryDetailSnapshot: cache.saveStoryDetailSnapshot
}))

describe('story screens follow the hostId prop, not a host singleton', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    appState.currentState = 'active'
    for (const load of [cache.loadStoryListSnapshot, cache.loadStoryDetailSnapshot]) {
      load.mockReset()
      load.mockResolvedValue(null)
    }
    for (const save of [cache.saveStoryListSnapshot, cache.saveStoryDetailSnapshot]) {
      save.mockReset()
    }
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function fakeClient(sendRequest: ReturnType<typeof vi.fn>): RpcClient {
    return { sendRequest, subscribe: vi.fn(() => () => {}) } as unknown as RpcClient
  }

  // The single-flight fetch chain needs several microtask hops before state lands.
  async function flushMicrotasks(hops = 10): Promise<void> {
    for (let i = 0; i < hops; i++) {
      await Promise.resolve()
    }
  }

  async function renderHostScreen(
    kind: 'list' | 'detail',
    hostId: string,
    client: RpcClient
  ): Promise<void> {
    await act(async () => {
      renderer = create(
        kind === 'list'
          ? createElement(MobileStoryListScreen, {
              client,
              hostId,
              bottomInset: 0,
              onOpenStory: () => {}
            })
          : createElement(MobileStoryDetailScreen, {
              client,
              hostId,
              storyId: storyDetailHappyPath.story.storyId,
              bottomInset: 0
            })
      )
      await flushMicrotasks()
    })
  }

  it('fetches the list through the client of the rendered host and re-scopes on host switch', async () => {
    const sendA = vi.fn().mockResolvedValue({ ok: true, result: storyListHappyPath })
    const sendB = vi.fn().mockResolvedValue({ ok: true, result: storyListHappyPath })
    await renderHostScreen('list', 'host-a', fakeClient(sendA))
    expect(sendA).toHaveBeenCalledWith('superpowers.storyList', {})
    expect(cache.loadStoryListSnapshot).toHaveBeenCalledWith('host-a')
    expect(sendB).not.toHaveBeenCalled()

    // Host switch: the previous renderer must unmount before the next host mounts.
    act(() => renderer?.unmount())
    renderer = null

    await renderHostScreen('list', 'host-b', fakeClient(sendB))
    expect(sendB).toHaveBeenCalledWith('superpowers.storyList', {})
    expect(cache.loadStoryListSnapshot).toHaveBeenLastCalledWith('host-b')
    // A host switch never fires new requests through the previous host's client.
    expect(sendA).toHaveBeenCalledTimes(1)
  })

  it('fetches the detail through the client of the rendered host and re-scopes on host switch', async () => {
    const storyId = storyDetailHappyPath.story.storyId
    const sendA = vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })
    const sendB = vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })
    await renderHostScreen('detail', 'host-a', fakeClient(sendA))
    expect(sendA).toHaveBeenCalledWith('superpowers.storyDetail', { storyId })
    expect(cache.loadStoryDetailSnapshot).toHaveBeenCalledWith('host-a', storyId)
    expect(sendB).not.toHaveBeenCalled()

    act(() => renderer?.unmount())
    renderer = null

    await renderHostScreen('detail', 'host-b', fakeClient(sendB))
    expect(sendB).toHaveBeenCalledWith('superpowers.storyDetail', { storyId })
    expect(cache.loadStoryDetailSnapshot).toHaveBeenLastCalledWith('host-b', storyId)
    expect(sendA).toHaveBeenCalledTimes(1)
  })
})
