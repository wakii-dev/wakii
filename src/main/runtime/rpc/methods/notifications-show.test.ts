import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationSettings } from '../../../../shared/notification-settings-types'
import { NotificationsShowParams } from '../../../../shared/rpc-contract/notifications-params'
import {
  setNotificationSettingsSupplier,
  setRuntimeDesktopSurface
} from '../../runtime-desktop-surface'
import {
  RuntimeMobileNotificationController,
  type MobileNotificationDispatchEvent
} from '../../runtime-mobile-notification-controller'
import { NOTIFICATION_METHODS } from './notifications'
import type { RpcContext, RpcMethod } from '../core'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => tmpdir()), isPackaged: false },
  BrowserWindow: { fromId: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  webContents: { fromId: vi.fn(() => null) }
}))

const defaultSettings: NotificationSettings = {
  enabled: true,
  agentTaskComplete: true,
  terminalBell: true,
  suppressWhenFocused: false,
  mutedNotificationSourceIds: [],
  customSoundId: 'system',
  customSoundPath: null,
  customSoundVolume: 0.5
}

afterEach(() => {
  setRuntimeDesktopSurface(null)
  setNotificationSettingsSupplier(null)
})

function showMethod(): RpcMethod {
  const method = NOTIFICATION_METHODS.find((entry) => entry.name === 'notifications.show')
  if (!method) {
    throw new Error('notifications.show method missing from NOTIFICATION_METHODS')
  }
  return method as RpcMethod
}

describe('notifications.show CLI route', () => {
  it('shows the toast with the caller title verbatim and dispatches source plugin (no prefix)', async () => {
    const showNotification = vi.fn(() => true)
    setRuntimeDesktopSurface({
      showNotification: showNotification as unknown as () => boolean,
      findWindowById: () => null,
      onIpc: () => {},
      removeIpcListener: () => {}
    })
    setNotificationSettingsSupplier(() => ({ ...defaultSettings, suppressWhenFocused: false }))
    const controller = new RuntimeMobileNotificationController()
    const events: MobileNotificationDispatchEvent[] = []
    controller.onDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })

    const result = await controller.dispatchCli({ title: 'SF-4 done', body: 'merged' })
    expect(result).toEqual({ delivered: true })
    expect(showNotification).toHaveBeenCalledWith({ title: 'SF-4 done', body: 'merged' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ source: 'plugin', title: 'SF-4 done', body: 'merged' })
  })

  it('defaults body to empty and still relays to the stream when suppressed', async () => {
    const showNotification = vi.fn(() => true)
    setRuntimeDesktopSurface({
      showNotification: showNotification as unknown as () => boolean,
      findWindowById: () => null,
      onIpc: () => {},
      removeIpcListener: () => {},
      isMainWindowFocused: () => true
    })
    setNotificationSettingsSupplier(() => ({ ...defaultSettings, suppressWhenFocused: true }))
    const controller = new RuntimeMobileNotificationController()
    const events: MobileNotificationDispatchEvent[] = []
    controller.onDispatched((event) => {
      if (event.type === 'notification') {
        events.push(event)
      }
    })

    const result = await controller.dispatchCli({ title: 'gate FAIL' })
    expect(result).toEqual({ delivered: false })
    expect(showNotification).not.toHaveBeenCalled()
    expect(events).toEqual([
      expect.objectContaining({ source: 'plugin', title: 'gate FAIL', body: '' })
    ])
  })

  it('RPC method delegates to runtime.dispatchCliNotification', async () => {
    const dispatchCliNotification = vi.fn(async () => ({ delivered: true }))
    const ctx = { runtime: { dispatchCliNotification } } as unknown as RpcContext
    const result = await showMethod().handler({ title: 'hi', body: 'there' }, ctx)
    expect(result).toEqual({ delivered: true })
    expect(dispatchCliNotification).toHaveBeenCalledWith({ title: 'hi', body: 'there' })
  })

  it('params: title required, body optional, unknown flags rejected (strict)', () => {
    expect(NotificationsShowParams.safeParse({ title: 'x' }).success).toBe(true)
    expect(NotificationsShowParams.safeParse({ title: 'x', body: 'y' }).success).toBe(true)
    expect(NotificationsShowParams.safeParse({}).success).toBe(false)
    expect(NotificationsShowParams.safeParse({ title: '' }).success).toBe(false)
    expect(NotificationsShowParams.safeParse({ title: 'x', sound: 'Glass' }).success).toBe(false)
  })
})
