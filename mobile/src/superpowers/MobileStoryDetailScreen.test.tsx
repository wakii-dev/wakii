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
  remove: vi.fn()
}))
// The real fetch write-throughs via saveStoryDetailSnapshot — both halves of the
// cache module must exist or the fetch's then-chain throws into 'unavailable'.
const cache = vi.hoisted(() => ({
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

  it('renders gates passively with a pending count and no tap targets', async () => {
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
    // Passive: no Pressable (and no button role) anywhere on the detail screen.
    expect(renderer!.root.findAllByType('Pressable')).toHaveLength(0)
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
    // Banner is T9 — no detail may be invented here, and the spinner must stop.
    expect(renderer!.root.findAllByType('ActivityIndicator')).toHaveLength(0)
    expect(texts()).not.toContain(storyDetailHappyPath.story.title)
  })

  it('mounts RefreshControl wired to the hook pull state', async () => {
    const sendRequest = vi.fn().mockResolvedValue({ ok: true, result: storyDetailHappyPath })
    await renderScreen(sendRequest)
    const refreshControl = renderer!.root.findByType('RefreshControl').props
    expect(refreshControl.refreshing).toBe(false)
    expect(typeof refreshControl.onRefresh).toBe('function')
    expect(sendRequest).toHaveBeenCalledTimes(1)
  })
})
