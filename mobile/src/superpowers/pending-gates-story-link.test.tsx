// T9 gates-screen-side cross-link: story-linked gate rows expose an affordance that
// navigates to the story detail route; 'khác' rows (storyId null) keep the inline
// resolve flow and carry no story link. Sheet not stubbed — never opened here.
import { createElement } from 'react'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { storyDetailResultNormal, storyListResultNormal } from './gate-conformance-fixtures'
import { MobilePendingGatesScreen } from './MobilePendingGatesScreen'
import { createStoryDetailHref } from './story-detail-route'
import { resetPendingGatesStoreForTests } from './pending-gates-store'

const deps = vi.hoisted(() => {
  const state: {
    client: {
      sendRequest: (method: string, params?: unknown) => Promise<unknown>
      subscribe: () => () => void
    } | null
    connState: string
  } = { client: null, connState: 'connected' }
  return { state }
})

const push = vi.hoisted(() => ({ routerPush: vi.fn() }))

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
  useRouter: () => ({ back: () => {}, push: push.routerPush })
}))

vi.mock('lucide-react-native', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  RefreshCw: 'RefreshCw'
}))

vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({
    client: deps.state.client,
    clientId: 'client-1',
    state: deps.state.connState
  })
}))

const OK_ENVELOPE = (result: unknown) => ({ id: 'r1', ok: true, result, _meta: { runtimeId: 'r' } })

const HOST_ID = 'host-a'
const STORY_ID = 'brackets/fi305-superpowers-android.md'
const KHAC_ROW_TITLE = 'Pick deploy window for story sync'

function renderScreen() {
  let renderer!: ReturnType<typeof create>
  act(() => {
    renderer = create(createElement(MobilePendingGatesScreen, { hostId: HOST_ID }))
  })
  return {
    renderer,
    async flush() {
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

function findByLabel(
  root: { findAllByType: (type: string) => ReactTestInstance[] },
  label: string
) {
  return root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label)
}

describe('MobilePendingGatesScreen story links (T9)', () => {
  beforeEach(() => {
    resetPendingGatesStoreForTests()
    push.routerPush.mockReset()
    deps.state.connState = 'connected'
    deps.state.client = {
      sendRequest: (method: string) =>
        Promise.resolve(
          method === 'superpowers.storyList'
            ? OK_ENVELOPE(storyListResultNormal)
            : OK_ENVELOPE(storyDetailResultNormal)
        ),
      subscribe: () => () => {}
    }
  })

  it('exposes a story affordance on the linked row that navigates to the story route', async () => {
    const screen = renderScreen()
    await screen.flush()

    const link = findByLabel(screen.renderer.root, 'Open story')
    expect(link).toBeDefined()
    const linkTexts = link!
      .findAllByType('Text')
      .flatMap((node) => node.props.children)
      .filter((child) => typeof child === 'string')
    expect(linkTexts).toContain('FI-305 superpowers android')

    await act(async () => {
      link!.props.onPress()
    })
    expect(push.routerPush).toHaveBeenCalledTimes(1)
    expect(push.routerPush).toHaveBeenCalledWith(
      createStoryDetailHref({ hostId: HOST_ID, storyId: STORY_ID })
    )
    screen.unmount()
  })

  it('gives khác rows (storyId null) no story affordance', async () => {
    const screen = renderScreen()
    await screen.flush()

    const openStoryLinks = screen.renderer.root
      .findAllByType('Pressable')
      .filter((node) => node.props.accessibilityLabel === 'Open story')
    expect(openStoryLinks).toHaveLength(1)

    const khacRow = findByLabel(screen.renderer.root, KHAC_ROW_TITLE)
    expect(khacRow).toBeDefined()
    // The row itself is the only pressable — no nested story link.
    expect(khacRow!.findAllByType('Pressable')).toHaveLength(1)
    screen.unmount()
  })
})
