import { BrowserWindow, ipcMain, Notification, powerMonitor } from 'electron'
import { readDesktopAwayState } from '../notifications/desktop-away-state'
import type { RuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import { isMainWindowVisible } from '../window/main-window-visibility'

/** The desktop implementation of the runtime's optional desktop facilities. */
export const electronRuntimeDesktopSurface: RuntimeDesktopSurface = {
  isAwayForMobileNotifications: () => readDesktopAwayState(powerMonitor),
  showNotification: ({ title, body }) => {
    if (!Notification.isSupported()) {
      return false
    }
    new Notification({ title, body }).show()
    return true
  },
  findWindowById: (id) => BrowserWindow.fromId(id),
  isMainWindowFocused: () => {
    // Why first non-destroyed, not a stored ref: BrowserWindow instances are recreated
    // (macOS dock re-activation); same pattern as the notifications ipc handler.
    const mainWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
    if (mainWindow === null || !isMainWindowVisible(mainWindow)) {
      return null
    }
    return mainWindow.isFocused()
  },
  onIpc: (channel, listener) => {
    ipcMain.on(channel, listener as Parameters<typeof ipcMain.on>[1])
  },
  removeIpcListener: (channel, listener) => {
    ipcMain.removeListener(channel, listener as Parameters<typeof ipcMain.removeListener>[1])
  }
}
