import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'
import { registerOsWakiiFileOpenBridge } from './os-wakii-file-open-bridge'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  consoleInfo: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
// Mirrors i18next interpolation so toast copy assertions stay honest.
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>): string =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''))
}))

type WakiiFileOpenListener = (payloads: WakiiFileOpenPayload[]) => void

let unhandledRejections: unknown[] = []
const recordUnhandledRejection = (reason: unknown): void => void unhandledRejections.push(reason)

function validPayload(overrides: Partial<{ path: string }> = {}): WakiiFileOpenPayload {
  return { path: overrides.path ?? '/maps/story.wakii', mindmap: { wakiiMindmap: 1 } }
}

function errorPayload(code: 'io' | 'schema' | 'too-large'): WakiiFileOpenPayload {
  return { path: '/maps/broken.wakii', error: { code, message: `boom (${code})` } }
}

function stubPreload(ui: Record<string, unknown>): void {
  vi.stubGlobal('window', { api: { ui } })
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('registerOsWakiiFileOpenBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unhandledRejections = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(mocks.consoleInfo)
    process.on('unhandledRejection', recordUnhandledRejection)
  })

  afterEach(() => {
    process.off('unhandledRejection', recordUnhandledRejection)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('receives every payload main queued before the listener attached', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () =>
        Promise.resolve([validPayload(), validPayload({ path: '/maps/other.wakii' })])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.consoleInfo).toHaveBeenCalledTimes(2)
    expect(mocks.consoleInfo.mock.calls[0][0]).toContain('/maps/story.wakii')
    expect(mocks.consoleInfo.mock.calls[1][0]).toContain('/maps/other.wakii')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('receives payloads pushed after startup and hands back the unsubscribe', async () => {
    const listeners: WakiiFileOpenListener[] = []
    const unsubscribe = vi.fn()
    stubPreload({
      onOpenWakiiFile: (next: WakiiFileOpenListener) => {
        listeners.push(next)
        return unsubscribe
      },
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    const unsubs: (() => void)[] = []
    registerOsWakiiFileOpenBridge(unsubs)
    expect(unsubs).toEqual([unsubscribe])

    // The push channel delivers one decoded payload per event (the pull drains a batch).
    listeners[0](validPayload({ path: '/maps/live.wakii' }))
    await settle()

    expect(mocks.consoleInfo).toHaveBeenCalledTimes(1)
    expect(mocks.consoleInfo.mock.calls[0][0]).toContain('/maps/live.wakii')

    unsubs.forEach((teardown) => teardown())
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('surfaces a per-file error payload as a toast instead of a success marker', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.resolve([errorPayload('schema'), validPayload()])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Failed to open the Wakii mindmap file: boom (schema)'
    )
    // The valid sibling still lands: one bad file must not cost the rest of the batch.
    expect(mocks.consoleInfo).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected pending drain without leaking an unhandled rejection', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.reject(new Error('ipc unavailable'))
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Failed to open the Wakii mindmap file: ipc unavailable'
    )
    // Why: App.tsx awaits hydration around this registration and treats any throw as
    // "session restore failed", so the bridge must swallow its own failures.
    expect(unhandledRejections).toEqual([])
  })

  it('survives a throwing listener callback without leaking the rejection', async () => {
    mocks.consoleInfo.mockImplementation(() => {
      throw new Error('console exploded')
    })
    const listeners: WakiiFileOpenListener[] = []
    stubPreload({
      onOpenWakiiFile: (next: WakiiFileOpenListener) => {
        listeners.push(next)
        return () => {}
      },
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    registerOsWakiiFileOpenBridge([])
    expect(() => listeners[0]([validPayload()])).not.toThrow()
    await settle()

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Failed to open the Wakii mindmap file: console exploded'
    )
    expect(unhandledRejections).toEqual([])
  })

  it('ignores an empty batch', async () => {
    stubPreload({
      onOpenWakiiFile: () => () => {},
      consumePendingWakiiFileOpens: () => Promise.resolve([])
    })

    registerOsWakiiFileOpenBridge([])
    await settle()

    expect(mocks.consoleInfo).not.toHaveBeenCalled()
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

    expect(mocks.consoleInfo).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(unhandledRejections).toEqual([])
  })

  it('tolerates a preload without the wakii open channels', async () => {
    stubPreload({})

    const unsubs: (() => void)[] = []
    expect(() => registerOsWakiiFileOpenBridge(unsubs)).not.toThrow()
    await settle()

    expect(unsubs).toEqual([])
    expect(mocks.consoleInfo).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
