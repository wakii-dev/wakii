import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import type { WakiiFileOpenPayload, WakiiMindmap } from '../../../../shared/wakii-mindmap-types'
import { registerOsWakiiFileOpenBridge } from './os-wakii-file-open-bridge'

const mocks = vi.hoisted(() => ({
  openWakiiViewerFile: vi.fn(),
  updateSettings: vi.fn(async () => {}),
  isFloatingWorkspacePanelVisible: vi.fn(() => false),
  toastError: vi.fn()
}))

let storeState: {
  openWakiiViewerFile: typeof mocks.openWakiiViewerFile
  updateSettings: typeof mocks.updateSettings
  settings: { floatingTerminalEnabled?: boolean } | undefined
}

vi.mock('../../store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('@/lib/floating-workspace-terminal-actions', () => ({
  isFloatingWorkspacePanelVisible: mocks.isFloatingWorkspacePanelVisible
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

type WakiiOpenListener = (payload: WakiiFileOpenPayload) => void

let frames: FrameRequestCallback[] = []
let dispatchEvent = vi.fn()

function wakiiPayload(overrides: Partial<WakiiMindmap> = {}): WakiiFileOpenPayload {
  return {
    path: '/repo/docs/superpowers/mindmaps/vu-14.wakii',
    mindmap: {
      wakiiMindmap: 1,
      meta: { story: 's', generatedAt: '2026-09-27T00:00:00Z', generator: 'story-mindmap 1.0.0' },
      nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
      edges: [],
      ...overrides
    }
  }
}

function stubPreload(ui: Record<string, unknown>): void {
  dispatchEvent = vi.fn()
  vi.stubGlobal('window', { api: { ui }, dispatchEvent })
}

function runFrames(): void {
  const pending = frames
  frames = []
  for (const frame of pending) {
    frame(0)
  }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('registerOsWakiiFileOpenBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    frames = []
    // clearAllMocks does not reset mockReturnValue — re-pin the default here.
    mocks.isFloatingWorkspacePanelVisible.mockReturnValue(false)
    storeState = {
      openWakiiViewerFile: mocks.openWakiiViewerFile,
      updateSettings: mocks.updateSettings,
      settings: { floatingTerminalEnabled: true }
    }
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a pushed payload through the editor slice and reveals the floating workspace', async () => {
    mocks.isFloatingWorkspacePanelVisible.mockReturnValue(true)
    let listener: WakiiOpenListener | undefined
    stubPreload({
      onOpenWakiiFile: (cb: WakiiOpenListener) => {
        listener = cb
        return () => {}
      }
    })
    const unsubs: (() => void)[] = []
    registerOsWakiiFileOpenBridge(unsubs)
    expect(listener).toBeDefined()
    listener!(wakiiPayload())
    await settle()
    runFrames()
    expect(mocks.openWakiiViewerFile).toHaveBeenCalledTimes(1)
    expect(mocks.openWakiiViewerFile.mock.calls[0][0]).toMatchObject({
      path: '/repo/docs/superpowers/mindmaps/vu-14.wakii'
    })
    expect(dispatchEvent).not.toHaveBeenCalled() // already visible
    expect(unsubs).toHaveLength(1)
  })

  it('enables the floating workspace first when it is disabled', async () => {
    storeState.settings = { floatingTerminalEnabled: false }
    let listener: WakiiOpenListener | undefined
    stubPreload({
      onOpenWakiiFile: (cb: WakiiOpenListener) => {
        listener = cb
        return () => {}
      }
    })
    registerOsWakiiFileOpenBridge([])
    listener!(wakiiPayload())
    await settle()
    expect(mocks.updateSettings).toHaveBeenCalledWith({ floatingTerminalEnabled: true })
    runFrames()
    expect(dispatchEvent.mock.calls[0][0].type).toBe(TOGGLE_FLOATING_TERMINAL_EVENT)
  })

  it('drains opens queued before the listener attached', async () => {
    stubPreload({
      consumePendingWakiiFileOpens: () =>
        Promise.resolve([wakiiPayload(), { ...wakiiPayload(), path: '/b.wakii' }])
    })
    registerOsWakiiFileOpenBridge([])
    await settle()
    runFrames()
    expect(mocks.openWakiiViewerFile).toHaveBeenCalledTimes(2)
    expect(mocks.openWakiiViewerFile.mock.calls[1][0]).toMatchObject({ path: '/b.wakii' })
  })

  it('survives a preload without the wakii api (SF-2 not merged yet)', () => {
    stubPreload({})
    expect(() => registerOsWakiiFileOpenBridge([])).not.toThrow()
    expect(mocks.openWakiiViewerFile).not.toHaveBeenCalled()
  })

  it('reports failures through the error toast', async () => {
    mocks.openWakiiViewerFile.mockImplementation(() => {
      throw new Error('boom')
    })
    let listener: WakiiOpenListener | undefined
    stubPreload({
      onOpenWakiiFile: (cb: WakiiOpenListener) => {
        listener = cb
        return () => {}
      }
    })
    registerOsWakiiFileOpenBridge([])
    listener!(wakiiPayload())
    await settle()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
