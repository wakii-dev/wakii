// T9 detail-side cross-link: pending gate rows open the reused SF-3 resolve sheet;
// resolved/timeout rows stay read-only; submitting through the sheet hits the
// resolve path and refetches the detail. Sheet is stubbed (real one pulls reanimated).
import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { MobileStoryDetailScreen } from './MobileStoryDetailScreen'
import { storyDetailHappyPath } from './story-rpc-fixtures'

const appState = vi.hoisted(() => ({
  currentState: 'active',
  listener: null as ((state: string) => void) | null,
  remove: vi.fn(),
  colorScheme: 'dark' as string
}))
const cache = vi.hoisted(() => ({
  loadStoryDetailSnapshot: vi.fn(),
  saveStoryDetailSnapshot: vi.fn()
}))
const sheet = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))

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
vi.mock('expo-router', () => ({ useRouter: () => ({ back: () => {} }) }))
vi.mock('lucide-react-native', () => ({ ChevronLeft: 'ChevronLeft' }))
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 })
}))
vi.mock('./story-screen-cache', () => ({
  loadStoryDetailSnapshot: cache.loadStoryDetailSnapshot,
  saveStoryDetailSnapshot: cache.saveStoryDetailSnapshot
}))
vi.mock('./MobileGateResolveSheet', () => ({
  MobileGateResolveSheet: (props: Record<string, unknown>) => {
    sheet.props = props
    return null
  }
}))

const PENDING = storyDetailHappyPath.gates.find((gate) => gate.status === 'pending')!
const READ_ONLY = storyDetailHappyPath.gates.filter((gate) => gate.status !== 'pending')
const HOST_ID = 'host-1'

describe('MobileStoryDetailScreen gate resolve (T9)', () => {
  let renderer: ReactTestRenderer | null = null
  let sendRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    appState.currentState = 'active'
    cache.loadStoryDetailSnapshot.mockReset()
    cache.loadStoryDetailSnapshot.mockResolvedValue(null)
    cache.saveStoryDetailSnapshot.mockReset()
    sheet.props = null
    sendRequest = vi.fn((method: string) => {
      if (method === 'superpowers.gateResolve') {
        return Promise.resolve({
          ok: true,
          result: { gateId: PENDING.gateId, status: 'resolved', resolution: 'approve' }
        })
      }
      return Promise.resolve({ ok: true, result: storyDetailHappyPath })
    })
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  async function renderScreen(): Promise<void> {
    await act(async () => {
      renderer = create(
        createElement(MobileStoryDetailScreen, {
          client: {
            sendRequest,
            subscribe: vi.fn(() => () => {})
          } as unknown as RpcClient,
          hostId: HOST_ID,
          storyId: storyDetailHappyPath.story.storyId
        })
      )
      for (let hop = 0; hop < 10; hop += 1) {
        await Promise.resolve()
      }
    })
  }

  function pressables(): { label: unknown; node: ReactTestInstance }[] {
    return renderer!.root
      .findAllByType('Pressable')
      .map((node) => ({ label: node.props.accessibilityLabel, node }))
  }

  async function openSheet(): Promise<void> {
    const row = pressables().find(({ label }) => label === PENDING.title)
    expect(row).toBeDefined()
    await act(async () => {
      row!.node.props.onPress()
      for (let hop = 0; hop < 6; hop += 1) {
        await Promise.resolve()
      }
    })
  }

  it('opens the resolve sheet for the pending gate with a store-shaped row', async () => {
    await renderScreen()
    await openSheet()

    expect(sheet.props?.visible).toBe(true)
    expect(sheet.props?.gate).toMatchObject({
      gateId: PENDING.gateId,
      title: PENDING.title,
      status: 'pending',
      storyId: storyDetailHappyPath.story.storyId,
      source: 'sweep',
      optionsKnown: true
    })
  })

  it('keeps resolved and timeout rows read-only', async () => {
    await renderScreen()
    const labels = pressables().map(({ label }) => label)
    for (const gate of READ_ONLY) {
      expect(labels).not.toContain(gate.title)
    }
    // The pending row is the only gate row wired as a button.
    expect(labels.filter((label) => label === PENDING.title)).toHaveLength(1)
  })

  it('submits through the sheet and refetches the detail on success', async () => {
    await renderScreen()
    expect(sendRequest).toHaveBeenCalledTimes(1)
    await openSheet()

    await act(async () => {
      await sheet.props!.onResolve(PENDING.gateId, 'approve')
    })

    expect(sendRequest).toHaveBeenCalledWith(
      'superpowers.gateResolve',
      {
        gateId: PENDING.gateId,
        resolution: 'approve'
      },
      { timeoutMs: 15000 }
    )
    // Mount + resolve + the detail refetch that flips the row (sheet close itself
    // is the sheet's own behavior — covered by MobileGateResolveSheet.test.tsx).
    expect(sendRequest).toHaveBeenCalledTimes(3)
    expect(sendRequest).toHaveBeenLastCalledWith('superpowers.storyDetail', {
      storyId: storyDetailHappyPath.story.storyId
    })
  })

  it('surfaces a screen notice when a failed outcome lands after the sheet was dismissed', async () => {
    sendRequest = vi.fn((method: string) => {
      if (method === 'superpowers.gateResolve') {
        return Promise.resolve({ ok: true, result: { error: 'gate_not_pending' } })
      }
      return Promise.resolve({ ok: true, result: storyDetailHappyPath })
    })
    await renderScreen()
    await openSheet()

    // Drag-dismiss (ref flips in onClose) before the outcome settles — the sheet
    // can no longer show it, so the screen must (gates-screen parity).
    await act(async () => {
      sheet.props!.onClose()
      await sheet.props!.onResolve(PENDING.gateId, 'approve')
    })

    const rendered = renderer!.root
      .findAllByType('Text')
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string')
    expect(rendered).toContain('This gate was already handled elsewhere.')
  })
})
