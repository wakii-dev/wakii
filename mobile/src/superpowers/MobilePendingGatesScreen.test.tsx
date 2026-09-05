// Screen tests for MobilePendingGatesScreen: renders the two groups (story +
// 'Khác'), empty/unavailable states, the T3 onPress seam, and pull-to-refresh.
// Integration: the real store singleton + real hook run against a scripted client.
import { createElement } from 'react'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPendingGatesStoreForTests, type PendingGateRow } from './pending-gates-store'
import { MobilePendingGatesScreen } from './MobilePendingGatesScreen'

const deps = vi.hoisted(() => {
  const state: {
    calls: { method: string; params: unknown }[]
    connState: string
    // Stable identity across renders — a fresh object per call would re-fire the
    // screen's sweep effect forever (the hang this mock exists to avoid).
    client: { sendRequest: (method: string, params?: unknown) => Promise<unknown> } | null
    storyListResponse: () => unknown
    storyDetailResponse: (method: string, params: unknown) => unknown
  } = {
    calls: [],
    connState: 'connected',
    client: null,
    storyListResponse: () => {
      throw new Error('storyListResponse not scripted')
    },
    storyDetailResponse: () => {
      throw new Error('storyDetailResponse not scripted')
    }
  }
  return { state }
})

vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    ActivityIndicator: 'ActivityIndicator',
    Pressable: 'Pressable',
    RefreshControl: 'RefreshControl',
    // Render the refreshControl prop so tests can reach the RefreshControl node.
    ScrollView: (props: { children?: React.ReactNode; refreshControl?: React.ReactNode }) =>
      React.createElement('ScrollView', null, props.refreshControl, props.children),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: 'Text',
    View: 'View'
  }
})

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 })
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: () => {} })
}))

vi.mock('lucide-react-native', () => ({
  ChevronLeft: 'ChevronLeft',
  RefreshCw: 'RefreshCw'
}))

vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({
    client: deps.state.client,
    clientId: 'client-1',
    state: deps.state.connState
  })
}))

import { storyDetailResultNormal, storyListResultNormal } from './gate-conformance-fixtures'

const OK_ENVELOPE = (result: unknown) => ({ id: 'r1', ok: true, result, _meta: { runtimeId: 'r' } })
const METHOD_NOT_FOUND_ENVELOPE = {
  id: 'r2',
  ok: false,
  error: { code: 'method_not_found', message: 'Unknown method: superpowers.storyList' },
  _meta: { runtimeId: 'r' }
}

function scriptResponses(
  storyList: () => unknown,
  storyDetail: (method: string, params: unknown) => unknown = () =>
    OK_ENVELOPE(storyDetailResultNormal)
) {
  deps.state.storyListResponse = storyList
  deps.state.storyDetailResponse = storyDetail
}

function renderScreen(props: { onGatePress?: (gate: PendingGateRow) => void } = {}) {
  let renderer!: ReturnType<typeof create>
  act(() => {
    renderer = create(createElement(MobilePendingGatesScreen, { hostId: 'host-a', ...props }))
  })
  return {
    renderer,
    async flush() {
      // The sweep chain is several awaits deep (storyList → storyDetail → reconcile);
      // drain enough microtask rounds for it to fully settle.
      for (let round = 0; round < 8; round += 1) {
        await act(async () => {
          await Promise.resolve()
        })
      }
    },
    unmount() {
      act(() => {
        renderer.unmount()
      })
    }
  }
}

function textContent(root: { findAllByType: (type: string) => ReactTestInstance[] }): string[] {
  const texts: string[] = []
  for (const node of root.findAllByType('Text')) {
    const children = node.props.children
    if (typeof children === 'string') {
      texts.push(children)
    } else if (Array.isArray(children)) {
      const joined = children.filter((child) => typeof child === 'string').join('')
      if (joined) {
        texts.push(joined)
      }
    }
  }
  return texts
}

describe('MobilePendingGatesScreen', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
    deps.state.calls = []
    deps.state.connState = 'connected'
    deps.state.client = {
      sendRequest: (method: string, params?: unknown) => {
        deps.state.calls.push({ method, params })
        if (method === 'superpowers.storyList') {
          return Promise.resolve(deps.state.storyListResponse())
        }
        return Promise.resolve(deps.state.storyDetailResponse(method, params))
      }
    }
  })

  it('renders the story group and the fixed Khác group with gate rows', async () => {
    scriptResponses(() => OK_ENVELOPE(storyListResultNormal))
    const screen = renderScreen()
    await screen.flush()

    const texts = textContent(screen.renderer.root)
    expect(texts).toContain('FI-305 superpowers android')
    expect(texts).toContain('Khác')
    expect(texts).toContain('Approve SF-1 contract snapshot')
    expect(texts).toContain('Pick deploy window for story sync')
    expect(texts).not.toContain('Confirm force-push to destination') // timeout → closed
    screen.unmount()
  })

  it('shows the empty state when a connected host has no pending gates', async () => {
    scriptResponses(() => OK_ENVELOPE({ stories: [] }))
    const screen = renderScreen()
    await screen.flush()

    expect(textContent(screen.renderer.root)).toContain('No pending gates')
    screen.unmount()
  })

  it('shows the degraded banner on the pre-SF-1 method_not_found envelope', async () => {
    scriptResponses(() => METHOD_NOT_FOUND_ENVELOPE)
    const screen = renderScreen()
    await screen.flush()

    const texts = textContent(screen.renderer.root)
    expect(texts.some((text) => text.startsWith('Gate list unavailable'))).toBe(true)
    expect(texts).not.toContain('No pending gates')
    screen.unmount()
  })

  it('invokes the onGatePress seam with the tapped gate row', async () => {
    scriptResponses(() => OK_ENVELOPE(storyListResultNormal))
    const onGatePress = vi.fn()
    const screen = renderScreen({ onGatePress })
    await screen.flush()

    const gateRow = screen.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Approve SF-1 contract snapshot')
    expect(gateRow).toBeDefined()
    act(() => {
      gateRow?.props.onPress()
    })
    expect(onGatePress).toHaveBeenCalledTimes(1)
    expect(onGatePress.mock.calls[0]?.[0]).toMatchObject({
      gateId: 'gate-fi305-approve-sf1',
      source: 'sweep',
      optionsKnown: true
    })
    screen.unmount()
  })

  it('pull-to-refresh re-runs the sweep through RefreshControl', async () => {
    scriptResponses(() => OK_ENVELOPE(storyListResultNormal))
    const screen = renderScreen()
    await screen.flush()
    const sweepCallsAfterMount = deps.state.calls.length
    expect(sweepCallsAfterMount).toBeGreaterThan(0)

    const refreshControl = screen.renderer.root.findAllByType('RefreshControl')[0]
    await act(async () => {
      refreshControl?.props.onRefresh()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(deps.state.calls.length).toBeGreaterThan(sweepCallsAfterMount)
    screen.unmount()
  })
})
