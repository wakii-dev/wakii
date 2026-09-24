// Why: @xterm/addon-ligatures imports node:diagnostics_channel for optional
// tracing, but the renderer has no node built-ins — Vite's browser-external
// stub throws on `.channel` access and crashes the terminal workbench chunk
// in dev. Wired via electron.vite.config.ts renderer resolve.alias +
// optimizeDeps.esbuildOptions.alias (dev prebundle). The addon only
// subscribes handlers, so a no-op channel surface is faithful.
type NoopChannel = {
  addHandler: (...args: unknown[]) => void
  removeHandler: (...args: unknown[]) => void
  dispatch: (...args: unknown[]) => boolean
  readonly hasSubscribers: boolean
}

const noopChannel = (): NoopChannel => ({
  addHandler: () => {},
  removeHandler: () => {},
  dispatch: () => false,
  get hasSubscribers() {
    return false
  }
})

export function channel(_name: string): NoopChannel {
  return noopChannel()
}

export function hasSubscribers(_name: string): boolean {
  return false
}

export function subscribe(_name: string, _handler: (...args: unknown[]) => void): () => void {
  return () => {}
}

export function tracingChannel(_name: string): Record<string, unknown> {
  return {}
}

export default { channel, hasSubscribers, subscribe, tracingChannel }
