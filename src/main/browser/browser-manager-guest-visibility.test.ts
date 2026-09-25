import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserMocks = vi.hoisted(() => ({
  appGetPathMock: vi.fn(() => '/downloads'),
  shellOpenExternalMock: vi.fn(),
  browserWindowFromWebContentsMock: vi.fn(),
  menuBuildFromTemplateMock: vi.fn(),
  guestOffMock: vi.fn(),
  guestOnMock: vi.fn(),
  guestSetBackgroundThrottlingMock: vi.fn(),
  guestSetWindowOpenHandlerMock: vi.fn(),
  guestOpenDevToolsMock: vi.fn(),
  webContentsFromIdMock: vi.fn(),
  screenGetCursorScreenPointMock: vi.fn(() => ({ x: 0, y: 0 })),
  openPopupWithOriginBarMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: browserMocks.appGetPathMock
  },
  BrowserWindow: {
    fromWebContents: browserMocks.browserWindowFromWebContentsMock
  },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: browserMocks.shellOpenExternalMock },
  Menu: {
    buildFromTemplate: browserMocks.menuBuildFromTemplateMock
  },
  screen: {
    getCursorScreenPoint: browserMocks.screenGetCursorScreenPointMock
  },
  webContents: {
    fromId: browserMocks.webContentsFromIdMock
  }
}))

vi.mock('./popup-origin-bar-window', () => ({
  openPopupWithOriginBar: browserMocks.openPopupWithOriginBarMock
}))

import { browserManager } from './browser-manager'
import {
  rendererWebContentsId,
  resetBrowserManagerMocks,
  resetBrowserManagerState
} from './browser-manager-test-harness'

const {
  guestOffMock,
  guestOnMock,
  guestSetBackgroundThrottlingMock,
  guestSetWindowOpenHandlerMock,
  guestOpenDevToolsMock,
  webContentsFromIdMock
} = browserMocks

describe('browserManager', () => {
  beforeEach(() => {
    resetBrowserManagerMocks(browserMocks)
    resetBrowserManagerState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds capture paint one-way and keeps the renderer unthrottled until the last release', () => {
    const guest = {
      id: 1707,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: vi.fn(() => new Promise(() => {})),
      send: vi.fn(),
      setBackgroundThrottling: vi.fn()
    }
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })
    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-capture',
      workspaceId: 'workspace-1',
      worktreeId: 'wt-1',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    // Synchronous: a capture never waits on the desktop renderer.
    const releaseFirst = browserManager.holdPaintForCapture(guest.id)
    const releaseSecond = browserManager.holdPaintForCapture(guest.id)

    expect(renderer.executeJavaScript).not.toHaveBeenCalled()
    expect(renderer.send.mock.calls).toEqual([
      ['browser:capturePaintHold', { browserPageId: 'page-capture', held: true }]
    ])
    expect(renderer.setBackgroundThrottling.mock.calls).toEqual([[false]])

    releaseFirst()
    releaseFirst()
    expect(renderer.send).toHaveBeenCalledTimes(1)
    expect(renderer.setBackgroundThrottling.mock.calls).toEqual([[false]])

    releaseSecond()
    expect(renderer.send.mock.calls.at(-1)).toEqual([
      'browser:capturePaintHold',
      { browserPageId: 'page-capture', held: false }
    ])
    expect(renderer.setBackgroundThrottling.mock.calls).toEqual([[false], [true]])
  })

  it('returns a no-op automation visibility restore when renderer acquire hangs', async () => {
    vi.useFakeTimers()

    const rendererExecuteJavaScriptMock = vi.fn().mockReturnValueOnce(new Promise(() => {}))
    const guest = {
      id: 1708,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-hung-acquire',
      workspaceId: 'workspace-1',
      worktreeId: 'wt-1',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    const restorePromise = browserManager.acquireAutomationVisibility(guest.id)
    await vi.advanceTimersByTimeAsync(2_000)
    const restore = await restorePromise

    restore()

    expect(rendererExecuteJavaScriptMock).toHaveBeenCalledTimes(1)
  })

  it('releases a delayed automation visibility token after acquire timeout', async () => {
    vi.useFakeTimers()

    let resolveAcquire: (token: string) => void = () => {}
    const acquirePromise = new Promise<string>((resolve) => {
      resolveAcquire = resolve
    })
    const rendererExecuteJavaScriptMock = vi
      .fn()
      .mockReturnValueOnce(acquirePromise)
      .mockResolvedValueOnce(true)
    const guest = {
      id: 1709,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-delayed-acquire',
      workspaceId: 'workspace-1',
      worktreeId: 'wt-1',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    const restorePromise = browserManager.acquireAutomationVisibility(guest.id)
    await vi.advanceTimersByTimeAsync(2_000)
    const restore = await restorePromise

    restore()
    expect(rendererExecuteJavaScriptMock).toHaveBeenCalledTimes(1)

    resolveAcquire('late-lease-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(rendererExecuteJavaScriptMock).toHaveBeenCalledTimes(2)
    const releaseScript = rendererExecuteJavaScriptMock.mock.calls[1]?.[0]
    expect(releaseScript).toContain('bridge.release("late-lease-1")')
  })

  it('restores the previously focused browser workspace after screenshot prep changes tabs', async () => {
    const rendererExecuteJavaScriptMock = vi
      .fn()
      .mockResolvedValueOnce({
        prevTabType: 'browser',
        prevActiveWorktreeId: 'wt-prev',
        prevActiveBrowserWorkspaceId: 'workspace-prev',
        prevActiveBrowserPageId: 'page-prev',
        prevFocusedGroupTabId: 'tab-prev',
        targetWorktreeId: 'wt-target',
        targetBrowserWorkspaceId: 'workspace-target',
        targetBrowserPageId: 'page-target'
      })
      .mockResolvedValueOnce(undefined)
    const guest = {
      id: 708,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    browserWindowFromWebContentsMock.mockReturnValue({ isFocused: vi.fn(() => true) })
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-target',
      workspaceId: 'workspace-target',
      worktreeId: 'wt-target',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    const restore = await browserManager.ensureWebviewVisible(guest.id)
    restore()

    const restoreScript = rendererExecuteJavaScriptMock.mock.calls[1]?.[0]
    expect(restoreScript).toContain('state.setActiveWorktree("wt-prev");')
    expect(restoreScript).toContain('state.setActiveBrowserTab("workspace-prev");')
  })

  it('restores the previously active page when screenshot prep switches pages inside one workspace', async () => {
    const rendererExecuteJavaScriptMock = vi
      .fn()
      .mockResolvedValueOnce({
        prevTabType: 'browser',
        prevActiveWorktreeId: 'wt-target',
        prevActiveBrowserWorkspaceId: 'workspace-target',
        prevActiveBrowserPageId: 'page-prev',
        prevFocusedGroupTabId: null,
        targetWorktreeId: 'wt-target',
        targetBrowserWorkspaceId: 'workspace-target',
        targetBrowserPageId: 'page-target'
      })
      .mockResolvedValueOnce(undefined)
    const guest = {
      id: 709,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    browserWindowFromWebContentsMock.mockReturnValue({ isFocused: vi.fn(() => true) })
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-target',
      workspaceId: 'workspace-target',
      worktreeId: 'wt-target',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    const restore = await browserManager.ensureWebviewVisible(guest.id)
    restore()

    const restoreScript = rendererExecuteJavaScriptMock.mock.calls[1]?.[0]
    expect(restoreScript).toContain('state.setActiveBrowserPage(')
    expect(restoreScript).toContain('"workspace-target"')
    expect(restoreScript).toContain('"page-prev"')
  })

  it('restores remembered browser workspace/page even when the visible pane was terminal', async () => {
    const rendererExecuteJavaScriptMock = vi
      .fn()
      .mockResolvedValueOnce({
        prevTabType: 'terminal',
        prevActiveWorktreeId: 'wt-target',
        prevActiveBrowserWorkspaceId: 'workspace-prev',
        prevActiveBrowserPageId: 'page-prev',
        prevFocusedGroupTabId: 'tab-prev',
        targetWorktreeId: 'wt-target',
        targetBrowserWorkspaceId: 'workspace-target',
        targetBrowserPageId: 'page-target'
      })
      .mockResolvedValueOnce(undefined)
    const guest = {
      id: 7091,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    browserWindowFromWebContentsMock.mockReturnValue({ isFocused: vi.fn(() => true) })
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-target',
      workspaceId: 'workspace-target',
      worktreeId: 'wt-target',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    const restore = await browserManager.ensureWebviewVisible(guest.id)
    restore()

    const restoreScript = rendererExecuteJavaScriptMock.mock.calls[1]?.[0]
    expect(restoreScript).toContain('state.setActiveBrowserTab("workspace-prev");')
    expect(restoreScript).toContain('state.setActiveBrowserPage(')
    expect(restoreScript).toContain('"workspace-prev"')
    expect(restoreScript).toContain('"page-prev"')
    expect(restoreScript).toContain('state.activateTab("tab-prev");')
    expect(restoreScript).toContain('state.setActiveTabType("terminal");')
  })

  it('does not focus the Wakii window while preparing a screenshot', async () => {
    const rendererExecuteJavaScriptMock = vi.fn().mockResolvedValueOnce({
      prevTabType: 'terminal',
      prevActiveWorktreeId: 'wt-1',
      prevActiveBrowserWorkspaceId: 'workspace-prev',
      prevActiveBrowserPageId: 'page-prev',
      prevFocusedGroupTabId: 'tab-prev',
      targetWorktreeId: 'wt-1',
      targetBrowserWorkspaceId: 'workspace-1',
      targetBrowserPageId: 'page-1'
    })
    const guest = {
      id: 710,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'webview'),
      setBackgroundThrottling: guestSetBackgroundThrottlingMock,
      setWindowOpenHandler: guestSetWindowOpenHandlerMock,
      on: guestOnMock,
      off: guestOffMock,
      openDevTools: guestOpenDevToolsMock
    }
    const renderer = {
      id: rendererWebContentsId,
      isDestroyed: vi.fn(() => false),
      executeJavaScript: rendererExecuteJavaScriptMock
    }
    webContentsFromIdMock.mockImplementation((id: number) => {
      if (id === guest.id) {
        return guest
      }
      if (id === rendererWebContentsId) {
        return renderer
      }
      return null
    })

    browserManager.attachGuestPolicies(guest as never)
    browserManager.registerGuest({
      browserPageId: 'page-1',
      workspaceId: 'workspace-1',
      worktreeId: 'wt-1',
      webContentsId: guest.id,
      rendererWebContentsId
    })

    await browserManager.ensureWebviewVisible(guest.id)

    expect(browserWindowFromWebContentsMock).not.toHaveBeenCalled()
  })

  it('returns a no-op capture hold for a guest no page owns', () => {
    const release = browserManager.holdPaintForCapture(424242)
    expect(() => release()).not.toThrow()
  })
})
