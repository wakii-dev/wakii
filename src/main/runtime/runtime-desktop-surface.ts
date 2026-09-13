import type { BrowserWindow, IpcMainEvent } from 'electron'
import type { NotificationSettings } from '../../shared/notification-settings-types'

/**
 * The desktop facilities `OrcaRuntimeService` uses, which a Node host does not have.
 *
 * Three sites, all optional by nature: a native notification toast, a lookup of the
 * authoritative renderer window, and one ipcMain channel used only by the
 * renderer-backed tab-create fallback. With no renderer that fallback is unreachable —
 * `createTerminal` already takes the background spawn branch when there is no
 * authoritative window (#10333) — so a Node host needs none of them.
 *
 * Defaults are inert rather than throwing, for the same reason as the PTY bindings: a
 * host with no desktop legitimately has nothing here, and that is not a downgrade.
 * Where absence IS user-visible — a notification that would have been shown — the
 * runtime already routes to paired clients, which is the better destination anyway.
 */

export type RuntimeDesktopSurface = {
  /** Show a native notification. Returns false when the host cannot, so callers can say so. */
  isAwayForMobileNotifications?(): boolean | undefined
  showNotification(input: { title: string; body: string }): boolean
  /** The renderer window with this id, or null when there is no desktop. */
  findWindowById(id: number): BrowserWindow | null
  onIpc(channel: string, listener: (event: IpcMainEvent, ...args: never[]) => void): void
  removeIpcListener(channel: string, listener: (...args: never[]) => void): void
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
