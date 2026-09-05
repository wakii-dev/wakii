import {
  getPluginHostMethodSpec,
  PLUGIN_HOST_API_V0,
  PLUGIN_TERMINAL_ID_MAX_LENGTH,
  PLUGIN_WORKSPACE_LABEL_MAX_LENGTH,
  PLUGIN_WORKSPACE_TERMINAL_LIMIT,
  type PluginHostMethodSpec
} from '../../shared/plugins/plugin-host-api'
import type { PluginEventName } from '../../shared/plugins/plugin-manifest'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type PluginWorktreeContext = {
  worktreeId: string
  branch: string
  displayName: string
}

/** Structural service surface the facade delegates to. Desktop main binds it
 *  over runtime services; relay policy and conformance tests bind fakes. */
export type PluginHostServices = {
  resolveActiveWorktreeContext(): Promise<PluginWorktreeContext | null>
  listWorktreeTerminals(worktreeId: string): Promise<{ id: string }[]>
  sendTerminalText(
    terminalId: string,
    action: { text: string; enter: boolean }
  ): Promise<{ accepted: boolean }>
  dispatchPluginNotification(input: {
    pluginId: string
    title: string
    body?: string
  }): Promise<{ delivered: boolean }>
  writeClipboardText(text: string): Promise<{ written: boolean }>
  storage: {
    get(pluginId: string, key: string): unknown
    set(pluginId: string, key: string, value: unknown): { ok: true } | { ok: false; error: string }
    delete(pluginId: string, key: string): void
    keys(pluginId: string): string[]
  }
  secrets: {
    get(
      pluginId: string,
      key: string
    ): { ok: true; value: string | null } | { ok: false; error: string }
    set(pluginId: string, key: string, value: string): { ok: true } | { ok: false; error: string }
    delete(pluginId: string, key: string): void
  }
  settings: {
    getAll(pluginId: string): Record<string, unknown>
    set(pluginId: string, key: string, value: unknown): { ok: true } | { ok: false; error: string }
  }
  subscribeEvents(pluginId: string, events: PluginEventName[]): PluginEventName[]
}

// FORK-LOCAL: find the FIRST docs/superpowers that contains brackets/ or
// contexts/ across: focused worktree (via services context) and Orca
// workspace trees (~/orca/workspaces/<project>/<worktree>). Returns the
// superpowers root so fileList/fileRead can join 'brackets'/'contexts'.
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
const execFileAsync = promisify(execFileCb)
import { homedir } from 'node:os'

async function resolveWorkspaceDocsRoot(_services: PluginHostServices): Promise<string | null> {
  const candidates: string[] = []
  // 1. Orca workspace trees: ~/orca/workspaces/<proj>/<wt>
  const wsBase = join(homedir(), 'orca', 'workspaces')
  try {
    for (const proj of await readdir(wsBase).catch(() => [] as string[])) {
      const projDir = join(wsBase, proj)
      candidates.push(projDir)
      for (const wt of await readdir(projDir).catch(() => [] as string[])) {
        candidates.push(join(projDir, wt))
      }
    }
  } catch {
    /* ignore */
  }
  // 2. Registered repos via orca CLI (dev-safe: absolute prod binary like plugin)
  try {
    const bin = '/opt/homebrew/bin/orca'
    const { stdout } = await execFileAsync(bin, ['repo', 'list', '--json'], { timeout: 15000 })
    for (const r of JSON.parse(stdout)?.result?.repos ?? []) {
      if (typeof r?.path === 'string') {
        candidates.push(r.path)
      }
    }
  } catch {
    /* ignore */
  }
  // 3. cwd fallback (dev plugin host runs from repo)
  candidates.push(process.cwd())

  // Prefer a root whose brackets dir is the most recently modified
  let best: { root: string; mtime: number } | null = null
  for (const c of candidates) {
    const docs = join(c, 'docs', 'superpowers')
    try {
      const st = await stat(join(docs, 'brackets'))
      if (st.isDirectory() && (!best || st.mtimeMs > best.mtime)) {
        best = { root: docs, mtime: st.mtimeMs }
      }
    } catch {
      /* no brackets here */
    }
  }
  return best?.root ?? null
}

export type BoundPluginHostMethod = {
  spec: PluginHostMethodSpec
  handler: (
    params: unknown,
    ctx: { pluginId: string; services: PluginHostServices }
  ) => Promise<unknown>
}

function definePluginMethod(
  name: string,
  handler: BoundPluginHostMethod['handler']
): [string, BoundPluginHostMethod] {
  const spec = getPluginHostMethodSpec(name)
  if (!spec) {
    throw new Error(`no host API spec for method ${name}`)
  }
  return [name, { spec, handler }]
}

const HANDLERS = new Map<string, BoundPluginHostMethod>([
  definePluginMethod('workspace.readContext', async (_params, { services }) => {
    const context = await services.resolveActiveWorktreeContext()
    if (!context) {
      return null
    }
    const terminals = await services.listWorktreeTerminals(context.worktreeId)
    // Why: Orca worktree ids embed provider paths, so the public projection
    // must select safe fields instead of spreading the internal context.
    return {
      branch: context.branch.slice(0, PLUGIN_WORKSPACE_LABEL_MAX_LENGTH),
      displayName: context.displayName.slice(0, PLUGIN_WORKSPACE_LABEL_MAX_LENGTH),
      terminals: terminals
        .filter(
          (terminal) =>
            terminal.id.length > 0 && terminal.id.length <= PLUGIN_TERMINAL_ID_MAX_LENGTH
        )
        .slice(0, PLUGIN_WORKSPACE_TERMINAL_LIMIT)
        .map((terminal) => ({ id: terminal.id }))
    }
  }),
  definePluginMethod('terminal.sendText', async (params, { services }) => {
    const { terminalId, text, enter } = params as {
      terminalId: string
      text: string
      enter: boolean
    }
    const context = await services.resolveActiveWorktreeContext()
    if (!context) {
      throw new Error('no active worktree is available for terminal input')
    }
    // Why: terminal handles are provider-owned and can outlive focus changes;
    // re-list the resolved worktree immediately before routing plugin input.
    const terminals = await services.listWorktreeTerminals(context.worktreeId)
    if (!terminals.some((terminal) => terminal.id === terminalId)) {
      throw new Error('terminal is outside the active worktree')
    }
    const result = await services.sendTerminalText(terminalId, { text, enter })
    return { accepted: result.accepted }
  }),
  definePluginMethod('notifications.show', async (params, { pluginId, services }) => {
    const { title, body } = params as { title: string; body?: string }
    return services.dispatchPluginNotification({ pluginId, title, body })
  }),
  definePluginMethod('clipboard.write', async (params, { services }) => {
    const { text } = params as { text: string }
    return services.writeClipboardText(text)
  }),
  // FORK-LOCAL (Wakii): workspace fs reads (brackets/contexts only) for panels.
  // FORK-LOCAL: plan progress mọi SF worktree — panel trực tiếp (no lazy worker)
  definePluginMethod('workspace.planProgress', async () => {
    const progress: Record<
      string,
      { plan: string; done: number; total: number; pct: number; est?: boolean }
    > = {}
    const wsBase = join(homedir(), 'orca', 'workspaces')
    let projects: string[] = []
    try {
      projects = await readdir(wsBase)
    } catch {
      return { progress }
    }
    for (const proj of projects) {
      const projDir = join(wsBase, proj)
      let wts: string[] = []
      try {
        wts = await readdir(projDir)
      } catch {
        continue
      }
      for (const wt of wts) {
        if (!wt.startsWith('sf-')) {
          continue
        }
        const wtPath = join(projDir, wt)
        const plansDir = join(wtPath, 'docs', 'superpowers', 'plans')
        let ents: string[] = []
        try {
          ents = await readdir(plansDir)
        } catch {
          continue
        }
        // plan mới nhất khớp sf-<n>
        const n = (wt.match(/^sf-(\d+)/) || [])[1]
        if (!n) {
          continue
        }
        const matching = ents.filter((f) => f.endsWith('.md') && f.includes(`-sf${n}-`)).sort()
        if (!matching.length) {
          continue
        }
        const f = matching.at(-1)
        if (!f) {
          continue
        }
        const text = await readFile(join(plansDir, f), 'utf8').catch(() => '')
        const done = (text.match(/- \[x\]/g) || []).length
        const todo = (text.match(/- \[ \]/g) || []).length
        if (done + todo === 0) {
          continue
        }
        let eff = done
        let est = false
        if (done === 0 && todo > 0) {
          // commit-based estimate (execFile is sync-free: use execFileAsync below)
          try {
            const { promisify } = await import('node:util')
            const efA = promisify(execFileCb)
            const { stdout } = await efA(
              'git',
              ['-C', wtPath, 'rev-list', '--count', 'HEAD', '--not', '--glob=refs/heads/story/*'],
              { timeout: 5000 }
            ).catch(() => ({ stdout: '0' }))
            const commits = Number.parseInt((stdout || '0').trim(), 10)
            eff = Math.min(commits, todo)
            est = eff > 0
          } catch {
            eff = 0
          }
        }
        progress[wt] = {
          plan: f as string,
          done: eff,
          total: done + todo,
          pct: Math.round((eff / (done + todo)) * 100),
          est
        }
      }
    }
    return { progress }
  }),

  definePluginMethod('workspace.fileList', async (params, { services }) => {
    const { dir } = params as { dir: 'brackets' | 'contexts' }
    const root = await resolveWorkspaceDocsRoot(services)
    if (!root) {
      return { files: [] }
    }
    const target = join(root, dir)
    let entries: string[] = []
    try {
      entries = await readdir(target)
    } catch {
      return { files: [] }
    }
    const files = await Promise.all(
      entries
        .filter((f) => f.endsWith('.md'))
        .map(async (f) => {
          const st = await stat(join(target, f)).catch(() => null)
          const text = await readFile(join(target, f), 'utf8').catch(() => '')
          const hm = text.match(/^#\s+Story:\s*([A-Za-z]+-\d+)\s*[—–-]\s*(.+)$/m)
          return {
            name: f,
            linear: hm?.[1] ?? null,
            title: (hm?.[2] ?? f.replace(/\.md$/, '')).slice(0, 80),
            mtime: st?.mtimeMs ?? 0
          }
        })
    )
    files.sort((a, b) => b.mtime - a.mtime)
    return { files: files.slice(0, 200) }
  }),

  definePluginMethod('workspace.fileRead', async (params, { services }) => {
    const { dir, name } = params as { dir: 'brackets' | 'contexts'; name: string }
    if (name.includes('..') || name.includes('/')) {
      throw new Error('invalid file name')
    }
    const root = await resolveWorkspaceDocsRoot(services)
    if (!root) {
      throw new Error('no workspace root')
    }
    const content = await readFile(join(root, dir, name), 'utf8')
    return { content: content.slice(0, 256 * 1024) }
  }),

  definePluginMethod('storage.get', async (params, { pluginId, services }) => {
    const { key } = params as { key: string }
    return { value: services.storage.get(pluginId, key) ?? null }
  }),
  definePluginMethod('storage.set', async (params, { pluginId, services }) => {
    const { key, value } = params as { key: string; value: unknown }
    const result = services.storage.set(pluginId, key, value)
    if (!result.ok) {
      throw new Error(result.error)
    }
    return { ok: true }
  }),
  definePluginMethod('storage.delete', async (params, { pluginId, services }) => {
    const { key } = params as { key: string }
    services.storage.delete(pluginId, key)
    return { ok: true }
  }),
  definePluginMethod('storage.keys', async (_params, { pluginId, services }) => {
    return { keys: services.storage.keys(pluginId) }
  }),
  definePluginMethod('secrets.get', async (params, { pluginId, services }) => {
    const { key } = params as { key: string }
    const result = services.secrets.get(pluginId, key)
    if (!result.ok) {
      throw new Error(result.error)
    }
    return { value: result.value }
  }),
  definePluginMethod('secrets.set', async (params, { pluginId, services }) => {
    const { key, value } = params as { key: string; value: string }
    const result = services.secrets.set(pluginId, key, value)
    if (!result.ok) {
      throw new Error(result.error)
    }
    return { ok: true }
  }),
  definePluginMethod('secrets.delete', async (params, { pluginId, services }) => {
    const { key } = params as { key: string }
    services.secrets.delete(pluginId, key)
    return { ok: true }
  }),
  definePluginMethod('settings.get', async (_params, { pluginId, services }) => {
    return { settings: services.settings.getAll(pluginId) }
  }),
  definePluginMethod('settings.set', async (params, { pluginId, services }) => {
    const { key, value } = params as { key: string; value: unknown }
    const result = services.settings.set(pluginId, key, value)
    if (!result.ok) {
      throw new Error(result.error)
    }
    return { ok: true }
  }),
  definePluginMethod('events.subscribe', async (params, { pluginId, services }) => {
    const { events } = params as { events: PluginEventName[] }
    return { subscribed: services.subscribeEvents(pluginId, events) }
  })
])

// Why: adding a facade schema without a binding must fail at module load,
// before a plugin can observe transport-specific behavior.
if (HANDLERS.size !== PLUGIN_HOST_API_V0.length) {
  throw new Error('plugin host API spec table and handler bindings are out of sync')
}

export function getBoundPluginHostMethod(name: string): BoundPluginHostMethod | null {
  return HANDLERS.get(name) ?? null
}
