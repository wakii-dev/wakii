import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SuperpowersStoryDetailResult,
  SuperpowersStoryDetailSf
} from '../../../src/shared/superpowers/story-rpc-contract'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import { MobileStoryDetailScreen } from './MobileStoryDetailScreen'
import { storyDetailHappyPath } from './story-rpc-fixtures'
import {
  GATES_SECTION_TITLE,
  STALE_STORY_BANNER_TEXT,
  STALE_STORY_REFRESH_ACTION,
  UNTITLED_STORY_TITLE,
  gatePendingCountLabel,
  gateStatusLabel,
  sfStatusLabel,
  storyDependsLabel,
  storyProgressLabel,
  storyTierLabel
} from './story-screen-copy'
import { normalizeStoryDetailRouteParams } from './story-detail-route'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn(),
  colorScheme: 'dark' as string
}))
// The real fetch write-throughs via saveStoryDetailSnapshot — both halves of the
// cache module must exist or the fetch's then-chain throws into 'unavailable'.
const cache = vi.hoisted(() => ({
  loadStoryDetailSnapshot: vi.fn(),
  saveStoryDetailSnapshot: vi.fn()
}))

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
vi.mock('./story-screen-cache', () => ({
  loadStoryDetailSnapshot: cache.loadStoryDetailSnapshot,
  saveStoryDetailSnapshot: cache.saveStoryDetailSnapshot
}))

describe('MobileStoryDetailScreen', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    appState.currentState = 'active'
    appState.colorScheme = 'dark'
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

  // The single-flight fetch chain needs several microtask hops before setDetail lands.
  async function flushMicrotasks(hops = 10): Promise<void> {
    for (let i = 0; i < hops; i++) {
      await Promise.resolve()
    }
  }

  async function renderScreen(
    sendRequest: ReturnType<typeof vi.fn>,
    storyId = storyDetailHappyPath.story.storyId
  ): Promise<void> {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryDetailScreen, {
          client: fakeClient(sendRequest),
          hostId: 'host-1',
          storyId,
          bottomInset: 0
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

  function chipColor(testID: string): string | undefined {
    const text = renderer!.root.findByProps({ testID }).findByType('Text')
    const style = Array.isArray(text.props.style) ? text.props.style : [text.props.style]
    const colored = style.find((part) => part && typeof part === 'object' && 'color' in part)
    return (colored as { color?: string } | undefined)?.color
  }

  function textStyle(text: string): { color?: string } {
    const node = renderer!.root.findAllByType('Text').find((node) => node.children.includes(text))
    if (!node) {
      throw new Error(`no Text rendering "${text}"`)
    }
    const style = Array.isArray(node.props.style) ? node.props.style : [node.props.style]
    const colored = style.find((part) => part && typeof part === 'object' && 'color' in part)
    return (colored ?? {}) as { color?: string }
  }

  function containerStyle(): { backgroundColor?: string } {
    const style = renderer!.root.findAllByType('View')[0].props.style
    const flat = Array.isArray(style) ? style : [style]
    const filled = flat.find(
      (part) => part && typeof part === 'object' && 'backgroundColor' in part
    )
    return (filled ?? {}) as { backgroundColor?: string }
  }

  function detailWith(
    overrides: Partial<SuperpowersStoryDetailResult['story']>
  ): SuperpowersStoryDetailResult {
    return { ...storyDetailHappyPath, story: { ...storyDetailHappyPath.story, ...overrides } }
  }

  function sfOverride(
    name: string,
    overrides: Partial<SuperpowersStoryDetailSf>
  ): SuperpowersStoryDetailSf {
    const source = storyDetailHappyPath.story.sfs.find((sf) => sf.name === name)
    if (!source) {
      throw new Error(`no fixture sf named ${name}`)
    }
    return { ...source, ...overrides }
  }

  it('renders the header fields and hides the destination when null', async () => {
    await renderScreen(
      vi.fn().mockResolvedValue({ ok: true, result: detailWith({ destination: null }) })
    )
    const rendered = texts()
    expect(rendered).toContain(storyDetailHappyPath.story.title)
    expect(rendered).toContain('FI-307')
    expect(rendered).toContain('orca')
    expect(rendered).not.toContain('story/fi305-superpowers-android')
  })

  it('groups sfs by ascending tier with dependsOn and status chips', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath }))
    const rendered = texts()
    for (const tier of [0, 1, 2]) {
      expect(rendered).toContain(storyTierLabel(tier))
    }
    // Row order: SF-1 (tier 0) before SF-2/SF-3 (tier 1) before SF-4 (tier 2).
    // indexOf is exact-text match — the story title also contains 'SF-2' as a substring.
    const rowIndexes = ['SF-1', 'SF-2', 'SF-3', 'SF-4'].map((name) => rendered.indexOf(name))
    expect(rowIndexes.every((index) => index >= 0)).toBe(true)
    expect(rowIndexes).toEqual([...rowIndexes].sort((left, right) => left - right))
    // dependsOn shown when present (3 rows) and hidden when empty (SF-1).
    expect(rendered).toContain(storyDependsLabel(['SF-1']))
    expect(rendered).toContain(storyDependsLabel(['SF-2', 'SF-3']))
    expect(rendered.filter((text) => text.startsWith('depends:'))).toHaveLength(3)
    expect(rendered).toContain(sfStatusLabel('unknown'))
    expect(rendered).toContain(storyDetailHappyPath.story.destination)
  })

  it('computes overall progress from the detail sfs', async () => {
    // 2 done of 3 — differs from any list-side counter on purpose.
    const sfs = [
      sfOverride('SF-1', { status: 'done' }),
      sfOverride('SF-2', { status: 'done' }),
      sfOverride('SF-3', { status: 'todo' })
    ]
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: detailWith({ sfs }) }))
    expect(texts()).toContain(storyProgressLabel(2, 3))
    const fill = renderer!.root.findByProps({ testID: 'progress-fill' })
    expect(fill.props.style).toEqual([expect.anything(), { width: '67%' }])
  })

  it('renders the unknown status chip in a neutral color', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath }))
    const unknown = chipColor('sf-chip:SF-4')
    expect(unknown).toBe(colors.textMuted)
    for (const warnColor of [colors.statusAmber, colors.statusGreen, colors.statusRed]) {
      expect(unknown).not.toBe(warnColor)
    }
    // The known statuses stay distinct from each other.
    expect(chipColor('sf-chip:SF-1')).toBe(colors.statusGreen)
    expect(chipColor('sf-chip:SF-2')).toBe(colors.statusAmber)
  })

  it('renders gates with a pending count; only pending rows are pressable (T9)', async () => {
    await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath }))
    const rendered = texts()
    expect(rendered).toContain(GATES_SECTION_TITLE)
    expect(rendered).toContain(gatePendingCountLabel(1))
    for (const gate of storyDetailHappyPath.gates) {
      expect(rendered).toContain(gate.title)
      expect(rendered).toContain(gateStatusLabel(gate.status))
    }
    expect(chipColor('gate-chip:gate-orchestrate-001')).toBe(colors.statusAmber)
    expect(chipColor('gate-chip:gate-orchestrate-002')).toBe(colors.statusGreen)
    expect(chipColor('gate-chip:gate-orchestrate-003')).toBe(colors.textMuted)
    // Resolved/timeout rows stay read-only (spec §3b). Pin the full button
    // inventory: the pending gate row is the screen's ONLY pressable in this
    // state (the stale-banner refresh renders only under not-found).
    expect(
      renderer!.root.findAllByType('Pressable').map((node) => node.props.accessibilityLabel)
    ).toEqual([storyDetailHappyPath.gates[0].title])
  })

  it('falls back to the untitled title and hides progress and gates for a parseError detail', async () => {
    await renderScreen(
      vi.fn().mockResolvedValue({
        ok: true,
        result: { ...detailWith({ title: '', parseError: true, sfs: [] }), gates: [] }
      })
    )
    const rendered = texts()
    expect(rendered).toContain(UNTITLED_STORY_TITLE)
    expect(rendered).not.toContain(storyProgressLabel(0, 0))
    expect(rendered).not.toContain(GATES_SECTION_TITLE)
  })

  it('decodes a catch-all storyId segment array through the route contract', async () => {
    const route = normalizeStoryDetailRouteParams({
      hostId: 'host-1',
      storyId: ['brackets', 'fi307-sf2-mobile-story.md']
    })
    expect(route).toMatchObject({
      ok: true,
      hostId: 'host-1',
      storyId: 'brackets/fi307-sf2-mobile-story.md'
    })
    const sendRequest = vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })
    await renderScreen(sendRequest, 'brackets/fi307-sf2-mobile-story.md')
    expect(sendRequest).toHaveBeenCalledWith('superpowers.storyDetail', {
      storyId: 'brackets/fi307-sf2-mobile-story.md'
    })
    expect(texts()).toContain(storyDetailHappyPath.story.title)
  })

  it('renders the loading spinner before the first fetch settles', async () => {
    await renderScreen(
      vi.fn().mockImplementation(() => new Promise(() => {})),
      'brackets/never-settles.md'
    )
    expect(renderer!.root.findByType('ActivityIndicator')).toBeTruthy()
    expect(texts()).not.toContain(storyDetailHappyPath.story.title)
  })

  it('stays neutral when the host answers story_not_found with nothing cached', async () => {
    await renderScreen(
      vi.fn().mockResolvedValue({ ok: true, result: { error: 'story_not_found' } })
    )
    // No cached detail → no banner and nothing invented; the spinner must stop.
    expect(renderer!.root.findAllByType('ActivityIndicator')).toHaveLength(0)
    expect(texts()).not.toContain(STALE_STORY_BANNER_TEXT)
    expect(texts()).not.toContain(storyDetailHappyPath.story.title)
  })

  it('raises the not-found banner over the persisted seed and keeps the cached content', async () => {
    cache.loadStoryDetailSnapshot.mockResolvedValue({ detail: storyDetailHappyPath, savedAt: 7 })
    await renderScreen(
      vi.fn().mockResolvedValue({ ok: true, result: { error: 'story_not_found' } })
    )
    const rendered = texts()
    expect(rendered).toContain(STALE_STORY_BANNER_TEXT)
    // The cached story still renders underneath the banner — no blank screen.
    expect(rendered).toContain(storyDetailHappyPath.story.title)
    const action = renderer!.root.findByProps({ testID: 'stale-banner-refresh' })
    expect(action.props.accessibilityRole).toBe('button')
    expect(action.props.accessibilityLabel).toBe(STALE_STORY_REFRESH_ACTION)
  })

  it('refreshes from the not-found banner and recovers when the story returns', async () => {
    cache.loadStoryDetailSnapshot.mockResolvedValue({ detail: storyDetailHappyPath, savedAt: 7 })
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: { error: 'story_not_found' } })
      .mockResolvedValueOnce({ ok: true, result: storyDetailHappyPath })
    await renderScreen(sendRequest)
    expect(texts()).toContain(STALE_STORY_BANNER_TEXT)

    await act(async () => {
      renderer!.root.findByProps({ testID: 'stale-banner-refresh' }).props.onPress()
      await flushMicrotasks()
    })
    expect(sendRequest).toHaveBeenCalledTimes(2)
    const rendered = texts()
    expect(rendered).not.toContain(STALE_STORY_BANNER_TEXT)
    expect(rendered).toContain(storyDetailHappyPath.story.title)
  })

  it('mounts RefreshControl wired to the hook pull state', async () => {
    const sendRequest = vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })
    await renderScreen(sendRequest)
    const refreshControl = renderer!.root.findByType('RefreshControl').props
    expect(refreshControl.refreshing).toBe(false)
    expect(typeof refreshControl.onRefresh).toBe('function')
    expect(sendRequest).toHaveBeenCalledTimes(1)
  })

  // The app reads no scheme API — graphite tokens are static (dark-only by
  // design, app.json userInterfaceStyle: automatic). These pin that either OS
  // scheme renders the same key elements with the same token colors.
  it.each(['dark', 'light'] as const)(
    'renders the detail with static dark tokens under the %s OS scheme',
    async (scheme) => {
      appState.colorScheme = scheme
      await renderScreen(vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath }))
      const rendered = texts()
      expect(rendered).toContain(storyDetailHappyPath.story.title)
      expect(textStyle(storyDetailHappyPath.story.title).color).toBe(colors.textPrimary)
      expect(containerStyle().backgroundColor).toBe(colors.bgBase)
      // Status chips keep their token colors under either scheme.
      expect(chipColor('sf-chip:SF-1')).toBe(colors.statusGreen)
    }
  )
})
