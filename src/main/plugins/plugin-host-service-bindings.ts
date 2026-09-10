import { promises as fs } from 'node:fs'
import * as nodePath from 'node:path'
import type { PluginEventName } from '../../shared/plugins/plugin-manifest'
import {
  PLUGIN_WORKSPACE_FILE_LIST_LIMIT,
  PLUGIN_WORKSPACE_TERMINAL_LIMIT
} from '../../shared/plugins/plugin-host-api'
import type { PluginHostServices } from './plugin-host-methods'
import { PluginSecretsStore } from './plugin-secrets-store'
import { PluginKvStore } from './plugin-storage-store'
import {
  describeAgentSessionPtyWriteRefusal,
  isAgentSessionPtyWriteRefusedError
} from '../../shared/agent-session-pty-write-admission'

/** Structural subset of OrcaRuntimeService exposed to plugin facade bindings. */
export type PluginRuntimeDelegate = {
  resolveActiveWorktreeContext(): Promise<{
    worktreeId: string
    path: string
    branch: string
    displayName: string
  } | null>
  listTerminals(
    worktreeSelector?: string,
    limit?: number,
    opts?: { includeVisualLayouts?: boolean }
  ): Promise<{ terminals: { handle: string; title: string | null }[] }>
  sendTerminal(
    handle: string,
    action: { text?: string; enter?: boolean }
  ): Promise<{ accepted: boolean }>
  sendTerminalAgentPrompt(handle: string, prompt: string): Promise<{ accepted: boolean }>
  dispatchPluginNotification(input: {
    pluginId: string
    title: string
    body?: string
  }): Promise<{ delivered: boolean }>
}

export function bindPluginHostServices(input: {
  delegate: PluginRuntimeDelegate
  pluginsDataDir: string
  subscribeEvents: (pluginKey: string, events: PluginEventName[]) => PluginEventName[]
}): PluginHostServices {
  const { delegate, pluginsDataDir, subscribeEvents } = input
  return {
    resolveActiveWorktreeContext: async () => {
      const context = await delegate.resolveActiveWorktreeContext()
      if (!context) {
        return null
      }
      // Why: retain the internal id only for host-side terminal membership;
      // the public handler projects it out because it embeds provider paths.
      return {
        worktreeId: context.worktreeId,
        branch: context.branch,
        displayName: context.displayName
      }
    },
    listWorktreeTerminals: async (worktreeId) => {
      const result = await delegate.listTerminals(
        `id:${worktreeId}`,
        PLUGIN_WORKSPACE_TERMINAL_LIMIT,
        { includeVisualLayouts: false }
      )
      return result.terminals
        .slice(0, PLUGIN_WORKSPACE_TERMINAL_LIMIT)
        .map((terminal) => ({ id: terminal.handle }))
    },
    listWorktreeFiles: async (dir) => {
      const context = await delegate.resolveActiveWorktreeContext()
      if (!context) {
        throw new Error('no active worktree is available')
      }
      // Containment guard: the shared schema already rejects absolute/dot
      // segments, but the service binding must not trust its caller either —
      // resolve and verify the target stays under the worktree root.
      const root = nodePath.resolve(context.path)
      const target = nodePath.resolve(root, dir ?? '.')
      if (target !== root && !target.startsWith(root + nodePath.sep)) {
        throw new Error('dir escapes the active worktree')
      }
      let entries
      try {
        entries = await fs.readdir(target, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // Missing directory reads as empty rather than a hard failure —
          // callers probe convention paths (e.g. docs/superpowers/brackets)
          // that fresh worktrees may not have yet.
          return { files: [] }
        }
        throw error
      }
      const files = entries
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? ('dir' as const) : ('file' as const)
        }))
        .sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
        )
        .slice(0, PLUGIN_WORKSPACE_FILE_LIST_LIMIT)
      return { files }
    },
    sendTerminalText: async (terminalId, action) => {
      try {
        // Why: panel prompts target agent TUIs. The agent-prompt path writes the
        // whole prompt as ONE atomic bracketed paste and waits for the composer
        // to settle before submitting — a raw multi-line write reaches the agent
        // as one fragment per newline (the composer submits on every newline).
        if (action.enter === true && typeof delegate.sendTerminalAgentPrompt === 'function') {
          const agentResult = await delegate.sendTerminalAgentPrompt(terminalId, action.text)
          return { accepted: agentResult.accepted }
        }
        const result = await delegate.sendTerminal(terminalId, action)
        return { accepted: result.accepted }
      } catch (error) {
        // Why: the plugin API carries only `accepted`, so a lease refusal would read as a silent
        // drop; restate it as the message idiom plugin methods already surface to callers.
        if (isAgentSessionPtyWriteRefusedError(error)) {
          throw new Error(describeAgentSessionPtyWriteRefusal(error.refusal))
        }
        throw error
      }
    },
    dispatchPluginNotification: (notification) => delegate.dispatchPluginNotification(notification),
    storage: {
      get: (key, itemKey) => new PluginKvStore(pluginsDataDir, key, 'storage.json').get(itemKey),
      set: (key, itemKey, value) =>
        new PluginKvStore(pluginsDataDir, key, 'storage.json').set(itemKey, value),
      delete: (key, itemKey) =>
        new PluginKvStore(pluginsDataDir, key, 'storage.json').delete(itemKey),
      keys: (key) => new PluginKvStore(pluginsDataDir, key, 'storage.json').keys()
    },
    secrets: {
      get: (key, itemKey) => new PluginSecretsStore(pluginsDataDir, key).get(itemKey),
      set: (key, itemKey, value) => new PluginSecretsStore(pluginsDataDir, key).set(itemKey, value),
      delete: (key, itemKey) => new PluginSecretsStore(pluginsDataDir, key).delete(itemKey)
    },
    settings: {
      getAll: (key) => new PluginKvStore(pluginsDataDir, key, 'settings.json').getAll(),
      set: (key, itemKey, value) =>
        new PluginKvStore(pluginsDataDir, key, 'settings.json').set(itemKey, value)
    },
    subscribeEvents
  }
}
