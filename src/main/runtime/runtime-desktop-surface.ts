import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron'
import type { NotificationSettings } from '../../shared/notification-settings-types'

/** Optional Electron facilities for runtime hosts: notifications, renderer lookup and renderer-backed tab creation IPC.
 * Node hosts legitimately lack these; terminal creation uses background spawn without a window (#10333), and notifications route to paired clients. */

export type RuntimeDesktopSurface = {
  /** Headless hosts retain the formatter's English defaults. */
  translateNotification?(key: string, fallback: string): string
  /** This machine's own idle state; undefined is unknown. Absent on hosts with no desktop. */
  isAwayForMobileNotifications?(): boolean | undefined
  /** Show a native notification. Returns false when the host cannot, so callers can say so. */
  showNotification(input: { title: string; body: string }): boolean
  /** The renderer window with this id, or null when there is no desktop. */
  findWindowById(id: number): BrowserWindow | null
  isResourceViewVisible?(sender: WebContents): boolean
  onIpc(channel: string, listener: (event: IpcMainEvent, ...args: never[]) => void): void
  removeIpcListener(channel: string, listener: (...args: never[]) => void): void
  /** Re-encodes as a PNG fitting `maxEdge`; null if undecodable. Absent on Node hosts. */
  encodeRepoIconPng?(bytes: Uint8Array, maxEdge: number): Uint8Array | null
  /** A GET answering redirects with the 3xx, without proxy login; absent where fetch already does. */
  fetchRepoIcon?(url: string, init: RequestInit): Promise<Response>
  /**
   * Whether the main window has focus; null when the host cannot tell (no window, headless).
   * Optional so doubles written before focus-gating stay valid — callers treat missing
   * like null and fail open.
   */
  isMainWindowFocused?(): boolean | null
}

const inertDesktopSurface: RuntimeDesktopSurface = {
  showNotification: () => false,
  findWindowById: () => null,
  onIpc: () => {},
  removeIpcListener: () => {},
  isMainWindowFocused: () => null
}

let current: RuntimeDesktopSurface = inertDesktopSurface

export function setRuntimeDesktopSurface(surface: RuntimeDesktopSurface | null): void {
  current = surface ?? inertDesktopSurface
}

export function getRuntimeDesktopSurface(): RuntimeDesktopSurface {
  return current
}

let notificationSettingsSupplier: (() => NotificationSettings | undefined) | null = null

/**
 * Why module-level like the surface: the controller is constructed dependency-free at
 * several call sites, so settings arrive here instead. Unset (or a call returning
 * undefined) means fail-open — callers never suppress without an explicit setting.
 */
export function setNotificationSettingsSupplier(
  supplier: (() => NotificationSettings | undefined) | null
): void {
  notificationSettingsSupplier = supplier
}

export function getNotificationSettings(): NotificationSettings | undefined {
  return notificationSettingsSupplier?.()
}
