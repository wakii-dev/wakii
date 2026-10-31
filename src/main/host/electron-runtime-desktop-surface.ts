import { isResourceWindowVisible } from '../window/resource-view-admission'
import { isMainWindowVisible } from '../window/main-window-visibility'
import { BrowserWindow, ipcMain, Notification, powerMonitor } from 'electron'
import { readDesktopAwayState } from '../notifications/desktop-away-state'
import type { RuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import { translateMain } from '../i18n/main-i18n'
import { encodeRepoIconPng } from './electron-repo-icon-png'
import { fetchWithElectronManualRedirects } from './electron-manual-redirect-fetch'
import { ORCA_SIDEBAR_INPUTS_IS_MAIN } from '../../shared/sidebar-inputs-switch'

export const electronRuntimeDesktopSurface: RuntimeDesktopSurface = {
  translateNotification: translateMain,
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
  isResourceViewVisible: (sender) => isResourceWindowVisible(BrowserWindow.fromWebContents(sender)),
  onIpc: (channel, listener) => {
    ipcMain.on(channel, listener as Parameters<typeof ipcMain.on>[1])
  },
  removeIpcListener: (channel, listener) => {
    ipcMain.removeListener(channel, listener as Parameters<typeof ipcMain.removeListener>[1])
  },
  // Only the phone icon source needs these codecs and fetcher.
  ...(ORCA_SIDEBAR_INPUTS_IS_MAIN
    ? { encodeRepoIconPng, fetchRepoIcon: fetchWithElectronManualRedirects }
    : {})
}
