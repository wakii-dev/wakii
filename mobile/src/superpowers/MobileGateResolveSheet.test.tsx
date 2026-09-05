// Sheet tests: option buttons vs free-text rendering, unconditional confirm Alert
// (cancel never sends), submitting guard/spinner, and the screen-level integration
// through the dynamic-import seam — including a gate removed from the store
// mid-dialog (the sheet's snapshot must keep the dialog alive and still submit;
// the server's pending guard decides).
import { createElement } from 'react'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removePendingGate, resetPendingGatesStoreForTests } from './pending-gates-store'
import type { PendingGateRow } from './pending-gates-store'
import { MobileGateResolveSheet, type MobileGateResolveSheetProps } from './MobileGateResolveSheet'

const deps = vi.hoisted(() => {
  const state: {
    alertCalls: {
      title: string
      body?: string
      buttons: { text?: string; onPress?: () => void }[]
    }[]
    calls: { method: string; params: unknown }[]
    client: { sendRequest: (method: string, params?: unknown) => Promise<unknown> } | null
    storyListResponse: () => unknown
    storyDetailResponse: (method: string, params: unknown) => unknown
    gateResolveResponse: () => unknown
  } = {
    alertCalls: [],
    calls: [],
    client: null,
    storyListResponse: () => {
      throw new Error('storyListResponse not scripted')
    },
    storyDetailResponse: () => {
      throw new Error('storyDetailResponse not scripted')
    },
    gateResolveResponse: () => {
      throw new Error('gateResolveResponse not scripted')
    }
  }
  return { state }
})

vi.mock('react-native', () => {
  return {
    ActivityIndicator: 'ActivityIndicator',
    Alert: {
      alert: (
        title: string,
        body?: string,
        buttons?: { text?: string; onPress?: () => void }[]
      ) => {
        deps.state.alertCalls.push({ title, body, buttons: buttons ?? [] })
      }
    },
    Pressable: 'Pressable',
    RefreshControl: 'RefreshControl',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    // The drawer tree under the sheet needs these bindings to exist at import time.
    Keyboard: { addListener: () => () => {}, dismiss: () => {} },
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
    Modal: 'Modal',
    Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
    useWindowDimensions: () => ({ width: 390, height: 844 })
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
  ArrowUp: 'ArrowUp',
  ChevronLeft: 'ChevronLeft',
  RefreshCw: 'RefreshCw'
}))

// Drawer mocked as a host element: children still render, so sheet content is
// testable without reanimated (which cannot evaluate under node test mocks).
vi.mock('../components/BottomDrawer', () => ({ BottomDrawer: 'BottomDrawer' }))

vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({
    client: deps.state.client,
    clientId: 'client-1',
    state: 'connected'
  })
}))

import { MobilePendingGatesScreen } from './MobilePendingGatesScreen'
import {
  gateResolveErrorGateNotPending,
  gateResolveSuccess,
  storyDetailResultNormal,
  storyListResultNormal
} from './gate-conformance-fixtures'

const OK_ENVELOPE = (result: unknown) => ({ id: 'r1', ok: true, result, _meta: { runtimeId: 'r' } })

function optionsGate(overrides: Partial<PendingGateRow> = {}): PendingGateRow {
  return {
    gateId: 'gate-options',
    title: 'Approve SF-1 contract snapshot',
    status: 'pending',
    resolution: null,
    options: ['approve', 'reject'],
    worktreeId: 'wt-1',
    createdAt: 0,
    storyLinked: true,
    storyId: 'brackets/fi305-superpowers-android.md',
    source: 'sweep',
    optionsKnown: true,
    ...overrides
  }
}

function optionButtons(root: { findAllByType: (type: string) => ReactTestInstance[] }) {
  return root
    .findAllByType('Pressable')
    .filter(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Resolve: ')
    )
}

function pressAlertButton(text: string): void {
  const call = deps.state.alertCalls[deps.state.alertCalls.length - 1]
  expect(call).toBeDefined()
  const button = call.buttons.find((candidate) => candidate.text === text)
  expect(button, `alert button "${text}"`).toBeDefined()
  act(() => {
    button?.onPress?.()
  })
}

async function flush(): Promise<void> {
  // Yield macrotasks (React scheduler ticks, dynamic import for the screen seam)
  // AND microtasks (the resolve chain) — microtask-only rounds can miss a commit
  // scheduled by the scheduler when earlier tests leave live roots queued.
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
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

describe('MobileGateResolveSheet', () => {
  beforeEach(() => {
    deps.state.alertCalls = []
  })

  function renderSheet(props: Partial<MobileGateResolveSheetProps> = {}) {
    const onResolve = vi.fn()
    const onClose = vi.fn()
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        createElement(MobileGateResolveSheet, {
          visible: true,
          gate: optionsGate(),
          onClose,
          onResolve,
          ...props
        })
      )
    })
    return { renderer, onResolve, onClose }
  }

  it('renders option buttons only (no free-text field) for known options', () => {
    const sheet = renderSheet()

    const buttons = optionButtons(sheet.renderer.root)
    expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual([
      'Resolve: approve',
      'Resolve: reject'
    ])
    expect(sheet.renderer.root.findAllByType('TextInput')).toHaveLength(0)
  })

  it('renders a multiline TextInput without buttons when options are unknown', () => {
    const sheet = renderSheet({ gate: optionsGate({ optionsKnown: false, options: [] }) })

    expect(optionButtons(sheet.renderer.root)).toHaveLength(0)
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    expect(input).toBeDefined()
    expect(input?.props.multiline).toBe(true)
  })

  it('renders a multiline TextInput without buttons when the options list is empty', () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })

    expect(optionButtons(sheet.renderer.root)).toHaveLength(0)
    expect(sheet.renderer.root.findAllByType('TextInput')).toHaveLength(1)
  })

  it('keeps submit disabled while the free text is empty or whitespace only', () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    const submit = sheet.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Submit resolution')
    expect(submit?.props.disabled).toBe(true)

    act(() => {
      input?.props.onChangeText('   ')
    })
    expect(submit?.props.disabled).toBe(true)

    act(() => {
      input?.props.onChangeText('ship it')
    })
    expect(submit?.props.disabled).toBe(false)
  })

  it('confirm Cancel sends nothing', async () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    act(() => {
      input?.props.onChangeText('ship it')
    })
    const submit = sheet.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Submit resolution')
    act(() => {
      submit?.props.onPress()
    })

    expect(deps.state.alertCalls).toHaveLength(1)
    expect(deps.state.alertCalls[0]?.title).toBe('Approve SF-1 contract snapshot')
    pressAlertButton('Cancel')
    await flush()

    expect(sheet.onResolve).not.toHaveBeenCalled()
  })

  it('confirm send fires onResolve with the typed resolution and closes on success', async () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })
    sheet.onResolve.mockResolvedValue({
      kind: 'success',
      gateId: 'gate-options',
      resolution: 'ship it'
    })
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    act(() => {
      input?.props.onChangeText('ship it')
    })
    const submit = sheet.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Submit resolution')
    act(() => {
      submit?.props.onPress()
    })
    expect(sheet.onResolve).not.toHaveBeenCalled() // confirm still pending
    pressAlertButton('Resolve')

    expect(sheet.onResolve).toHaveBeenCalledWith('gate-options', 'ship it')
    await flush()
    expect(sheet.onClose).toHaveBeenCalled()
  })

  it('an option tap confirms with the option value and submits it', async () => {
    const sheet = renderSheet()
    sheet.onResolve.mockResolvedValue({ kind: 'taxonomy', code: 'gate_not_pending' })
    act(() => {
      optionButtons(sheet.renderer.root)[0]?.props.onPress()
    })

    expect(deps.state.alertCalls).toHaveLength(1)
    expect(deps.state.alertCalls[0]?.body).toContain('approve')
    pressAlertButton('Resolve')

    expect(sheet.onResolve).toHaveBeenCalledWith('gate-options', 'approve')
  })

  it('shows the spinner and disables buttons while submitting, then exits on any outcome', async () => {
    let release: ((outcome: unknown) => void) | null = null
    const sheet = renderSheet()
    sheet.onResolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (outcome: unknown) => void
        })
    )
    act(() => {
      optionButtons(sheet.renderer.root)[0]?.props.onPress()
    })
    pressAlertButton('Resolve')
    await flush()

    expect(sheet.renderer.root.findAllByType('ActivityIndicator')).toHaveLength(1)
    expect(optionButtons(sheet.renderer.root)[0]?.props.disabled).toBe(true)

    await act(async () => {
      release?.({ kind: 'taxonomy', code: 'gate_not_pending' })
    })
    await flush()

    expect(sheet.renderer.root.findAllByType('ActivityIndicator')).toHaveLength(0)
    expect(optionButtons(sheet.renderer.root)[0]?.props.disabled).toBe(false)
    expect(textContent(sheet.renderer.root)).toContain('Gate error: gate_not_pending')
    expect(sheet.onClose).not.toHaveBeenCalled()
  })

  it('renders the generic failure message on a request-failed outcome', async () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })
    sheet.onResolve.mockResolvedValue({ kind: 'request-failed' })
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    act(() => {
      input?.props.onChangeText('ship it')
    })
    const submit = sheet.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Submit resolution')
    act(() => {
      submit?.props.onPress()
    })
    expect(deps.state.alertCalls, 'alert shown after submit press').toHaveLength(1)
    pressAlertButton('Resolve')
    expect(sheet.onResolve, 'onResolve after confirm').toHaveBeenCalledTimes(1)
    await flush()

    // toContain on an array is exact-element membership — assert the full message.
    expect(textContent(sheet.renderer.root)).toContain(
      'Resolve failed — check the connection and retry.'
    )
    expect(sheet.onClose).not.toHaveBeenCalled()
  })

  it('opens with a snapshot on the visible transition (not just at mount)', () => {
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        createElement(MobileGateResolveSheet, {
          visible: false,
          gate: optionsGate(),
          onClose: () => {},
          onResolve: () => Promise.resolve(null)
        })
      )
    })
    expect(renderer.root.findAllByType('TextInput')).toHaveLength(0)

    act(() => {
      renderer.update(
        createElement(MobileGateResolveSheet, {
          visible: true,
          gate: optionsGate(),
          onClose: () => {},
          onResolve: () => Promise.resolve(null)
        })
      )
    })
    expect(optionButtons(renderer.root).map((node) => node.props.accessibilityLabel)).toEqual([
      'Resolve: approve',
      'Resolve: reject'
    ])
  })

  it('surfaces the taxonomy code from gate_not_pending fixtures', async () => {
    const sheet = renderSheet({ gate: optionsGate({ options: [] }) })
    sheet.onResolve.mockResolvedValue({
      kind: 'taxonomy',
      code: gateResolveErrorGateNotPending.error
    })
    const input = sheet.renderer.root.findAllByType('TextInput')[0]
    act(() => {
      input?.props.onChangeText('ship it')
    })
    const submit = sheet.renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === 'Submit resolution')
    act(() => {
      submit?.props.onPress()
    })
    pressAlertButton('Resolve')
    await flush()

    expect(textContent(sheet.renderer.root)).toContain('Gate error: gate_not_pending')
  })
})

describe('MobilePendingGatesScreen resolve-sheet integration', () => {
  beforeEach(() => {
    deps.state.alertCalls = []
    deps.state.calls = []
    resetPendingGatesStoreForTests()
    deps.state.client = {
      sendRequest: (method: string, params?: unknown) => {
        deps.state.calls.push({ method, params })
        if (method === 'superpowers.storyList') {
          return Promise.resolve(deps.state.storyListResponse())
        }
        if (method === 'superpowers.gateResolve') {
          return Promise.resolve(deps.state.gateResolveResponse())
        }
        return Promise.resolve(deps.state.storyDetailResponse(method, params))
      }
    }
  })

  function renderScreen() {
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(createElement(MobilePendingGatesScreen, { hostId: 'host-a' }))
    })
    return renderer
  }

  function gateRow(renderer: ReturnType<typeof create>, label: string): ReactTestInstance {
    const row = renderer.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === label)
    expect(row, `gate row "${label}"`).toBeDefined()
    return row as ReactTestInstance
  }

  it('full flow: tap gate → confirm option → gateResolve request fired with right params', async () => {
    deps.state.storyListResponse = () => OK_ENVELOPE(storyListResultNormal)
    deps.state.storyDetailResponse = () => OK_ENVELOPE(storyDetailResultNormal)
    deps.state.gateResolveResponse = () => OK_ENVELOPE(gateResolveSuccess)
    const renderer = renderScreen()
    await flush()

    act(() => {
      gateRow(renderer, 'Approve SF-1 contract snapshot').props.onPress()
    })
    await flush()

    // Dynamic import seam landed the sheet with the gate's known options.
    const buttons = optionButtons(renderer.root)
    expect(buttons.map((node) => node.props.accessibilityLabel)).toContain('Resolve: approve')

    const resolveCallsBefore = deps.state.calls.filter(
      (call) => call.method === 'superpowers.gateResolve'
    ).length
    act(() => {
      buttons.find((node) => node.props.accessibilityLabel === 'Resolve: approve')?.props.onPress()
    })
    pressAlertButton('Resolve')
    await flush()

    const resolveCalls = deps.state.calls.filter(
      (call) => call.method === 'superpowers.gateResolve'
    )
    expect(resolveCalls.length).toBe(resolveCallsBefore + 1)
    expect(resolveCalls[resolveCalls.length - 1]?.params).toEqual({
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
    act(() => {
      renderer.unmount()
    })
  })

  it('gate removed from the store mid-dialog: sheet snapshot survives and submit still proceeds', async () => {
    deps.state.storyListResponse = () => OK_ENVELOPE(storyListResultNormal)
    deps.state.storyDetailResponse = () => OK_ENVELOPE(storyDetailResultNormal)
    deps.state.gateResolveResponse = () => OK_ENVELOPE(gateResolveSuccess)
    const renderer = renderScreen()
    await flush()

    act(() => {
      gateRow(renderer, 'Approve SF-1 contract snapshot').props.onPress()
    })
    await flush()
    expect(optionButtons(renderer.root).length).toBeGreaterThan(0)

    // Gate-closed-equivalent removal mid-dialog — the snapshot must keep the
    // dialog usable, not crash or blank.
    act(() => {
      removePendingGate('host-a', 'gate-fi305-approve-sf1')
    })
    await flush()
    expect(optionButtons(renderer.root).length).toBeGreaterThan(0)

    act(() => {
      optionButtons(renderer.root)
        .find((node) => node.props.accessibilityLabel === 'Resolve: approve')
        ?.props.onPress()
    })
    pressAlertButton('Resolve')
    await flush()

    const resolveCalls = deps.state.calls.filter(
      (call) => call.method === 'superpowers.gateResolve'
    )
    expect(resolveCalls[resolveCalls.length - 1]?.params).toEqual({
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
    act(() => {
      renderer.unmount()
    })
  })

  it('gate_not_pending outcome renders in the sheet without getting stuck', async () => {
    deps.state.storyListResponse = () => OK_ENVELOPE(storyListResultNormal)
    deps.state.storyDetailResponse = () => OK_ENVELOPE(storyDetailResultNormal)
    deps.state.gateResolveResponse = () => OK_ENVELOPE(gateResolveErrorGateNotPending)
    const renderer = renderScreen()
    await flush()

    act(() => {
      gateRow(renderer, 'Approve SF-1 contract snapshot').props.onPress()
    })
    await flush()
    act(() => {
      optionButtons(renderer.root)
        .find((node) => node.props.accessibilityLabel === 'Resolve: approve')
        ?.props.onPress()
    })
    pressAlertButton('Resolve')
    await flush()

    expect(textContent(renderer.root)).toContain('Gate error: gate_not_pending')
    expect(renderer.root.findAllByType('ActivityIndicator')).toHaveLength(0)
    act(() => {
      renderer.unmount()
    })
  })
})
