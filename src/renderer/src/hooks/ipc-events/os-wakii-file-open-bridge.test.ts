import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import type { WakiiMindmap } from '../../../../shared/wakii-mindmap-types'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'
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
vi.mock('@/store/floating-workspace-panel-selector', () => ({
  selectFloatingWorkspacePanelVisible: () => mocks.isFloatingWorkspacePanelVisible()
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
// Mirrors i18next interpolation so toast copy assertions stay honest.
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>): string =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''))
}))

type WakiiOpenListener = (payload: WakiiFileOpenPayload) => void

let frames: FrameRequestCallback[] = []
let dispatchEvent = vi.fn()

let unhandledRejections: unknown[] = []
const recordUnhandledRejection = (reason: unknown): void => void unhandledRejections.push(reason)

function wakiiPayload(
  overrides: Partial<WakiiMindmap> = {},
  path = '/maps/story.wakii'
): WakiiFileOpenPayload {
  return {
    path,
    mindmap: {
      wakiiMindmap: 1,
      meta: { story: 's', generatedAt: '2026-09-27T00:00:00Z', generator: 'story-mindmap 1.0.0' },
      nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
      edges: [],
      ...overrides
    }
  }
}

function errorPayload(code: 'io' | 'schema' | 'too-large'): WakiiFileOpenPayload {
  return { path: '/maps/broken.wakii', error: { code, message: `boom (${code})` } }
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
    unhandledRejections = []
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.on('unhandledRejection', recordUnhandledRejection)
  })

  afterEach(() => {
    process.off('unhandledRejection', recordUnhandledRejection)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens every payload main queued before the listener attached', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () =>
        Promise.resolve([wakiiPayload(), wakiiPayload({}, '/maps/other.wakii')])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()
    runFrames()

    expect(mocks.openWakiiViewerFile).toHaveBeenCalledTimes(2)
    expect(mocks.openWakiiViewerFile.mock.calls[0][0]).toMatchObject({ path: '/maps/story.wakii' })
    expect(mocks.openWakiiViewerFile.mock.calls[1][0]).toMatchObject({ path: '/maps/other.wakii' })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('receives payloads pushed after startup and hands back the unsubscribe', async () => {
    const listeners: WakiiOpenListener[] = []
    const unsubscribe = vi.fn()
    stubPreload({
      onOpenWakiiFile: (next: WakiiOpenListener) => {
        listeners.push(next)
        return unsubscribe
      },
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    const unsubs: (() => void)[] = []
    registerOsWakiiFileOpenBridge(unsubs)
    expect(unsubs).toEqual([unsubscribe])

    // The push channel delivers one decoded payload per event (the pull drains a batch).
    listeners[0](wakiiPayload({}, '/maps/live.wakii'))
    await settle()
    runFrames()

    expect(mocks.openWakiiViewerFile).toHaveBeenCalledTimes(1)
    expect(mocks.openWakiiViewerFile.mock.calls[0][0]).toMatchObject({ path: '/maps/live.wakii' })

    unsubs.forEach((teardown) => teardown())
    expect(unsubscribe).toHaveBeenCalledOnce()
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
    expect(mocks.openWakiiViewerFile.mock.calls[0][0]).toMatchObject({ path: '/maps/story.wakii' })
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

  it('surfaces a per-file error payload as a toast and still routes it for the error card', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.resolve([errorPayload('schema'), wakiiPayload()])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()
    runFrames()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Failed to open the Wakii mindmap file: boom (schema)'
    )
    // One bad file must not cost the batch: both verdicts reach the editor slice, where the
    // error half renders the viewer's error card instead of a partial graph.
    expect(mocks.openWakiiViewerFile).toHaveBeenCalledTimes(2)
    expect(mocks.openWakiiViewerFile.mock.calls[0][0]).toMatchObject({ path: '/maps/broken.wakii' })
    expect(mocks.openWakiiViewerFile.mock.calls[1][0]).toMatchObject({ path: '/maps/story.wakii' })
  })

  it('reports a rejected pending drain without leaking an unhandled rejection', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.reject(new Error('ipc unavailable'))
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Failed to open the mindmap file.')
    // Why: App.tsx awaits hydration around this registration and treats any throw as
    // "session restore failed", so the bridge must swallow its own failures.
    expect(unhandledRejections).toEqual([])
  })

  it('survives a throwing listener callback without leaking the rejection', async () => {
    mocks.openWakiiViewerFile.mockImplementation(() => {
      throw new Error('slice exploded')
    })
    const listeners: WakiiOpenListener[] = []
    stubPreload({
      onOpenWakiiFile: (next: WakiiOpenListener) => {
        listeners.push(next)
        return () => {}
      },
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    registerOsWakiiFileOpenBridge([])
    expect(() => listeners[0](wakiiPayload())).not.toThrow()
    await settle()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Failed to open the mindmap file.')
    expect(unhandledRejections).toEqual([])
  })

  it('ignores an empty batch', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.openWakiiViewerFile).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('ignores a non-array payload from a mismatched preload', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      // Why: the payload crosses the preload boundary, so a stale preload can resolve with
      // something that is not an array. Iterating it would throw inside the promise chain.
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mismatched-preload case is only expressible by lying about the wire type.
      consumePendingWakiiFileOpens: () => Promise.resolve(null as unknown as WakiiFileOpenPayload[])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.openWakiiViewerFile).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(unhandledRejections).toEqual([])
  })

  it('tolerates a preload without the wakii open channels', async () => {
    stubPreload({})

    const unsubs: (() => void)[] = []
    expect(() => registerOsWakiiFileOpenBridge(unsubs)).not.toThrow()
    await settle()

    expect(unsubs).toEqual([])
    expect(mocks.openWakiiViewerFile).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
