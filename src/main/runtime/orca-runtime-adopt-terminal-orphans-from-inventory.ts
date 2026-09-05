// @ts-nocheck -- mechanically split from OrcaRuntimeService; behavior is covered by AST equivalence and characterization tests.
import {
  observeStructuredWorker,
  resolveStructuredWorkerAuthority
} from './structured-worker-authority'
import type { RuntimeLeafRecord } from './runtime-terminal-state-records'
import { OrcaRuntimeWithSubscribeToTerminalResize } from './orca-runtime-subscribe-to-terminal-resize'
import type {
  RuntimeMobileSessionTabsResult,
  RuntimeTerminalOrphanAdoptionRequest,
  RuntimeTerminalOrphanAdoptionResult
} from '../../shared/runtime-types'
import type { TerminalWorkspaceLaunchScope } from './runtime-legacy-worker-terminal-recovery-types'
import type { PtyControllerInventory } from './runtime-pty-controller-contract'
import { resolveTerminalSessionWorktreeId } from './runtime-worktree-path-identity'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { adoptRuntimeTerminalOrphansFromInventory } from './runtime-terminal-orphan-adoption'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'
import type { PtyLivenessVerdict } from '../../shared/pty-liveness-verdict'

export class OrcaRuntimeWithAdoptTerminalOrphansFromInventory extends OrcaRuntimeWithSubscribeToTerminalResize {
  protected async adoptTerminalOrphansFromInventoryUnderMutation(
    request: RuntimeTerminalOrphanAdoptionRequest,
    workspace: TerminalWorkspaceLaunchScope,
    inventory: PtyControllerInventory
  ): Promise<RuntimeTerminalOrphanAdoptionResult> {
    const store = this.store
    const session = this.getWorkspaceSessionForWorktree(workspace.id)
    if (
      !store?.setWorkspaceSession ||
      (!store.flushPendingOrThrowAsync && !store.flushOrThrow) ||
      !session
    ) {
      throw new Error('workspace_session_unavailable')
    }
    const sessionWorktreeId = resolveTerminalSessionWorktreeId(session, workspace.id)
    if (!sessionWorktreeId) {
      throw new Error('terminal_orphan_competing_owner')
    }
    const worktreeConnectionId = workspace.connectionId
    let worktreeWslDistro: string | null = null
    if (!worktreeConnectionId && workspace.repo) {
      try {
        worktreeWslDistro =
          getLocalProjectWorktreeGitOptions(this.requireStore(), workspace.repo).wslDistro ?? null
      } catch {
        throw new Error('terminal_orphan_owner_mismatch')
      }
    }
    return adoptRuntimeTerminalOrphansFromInventory({
      request,
      workspace,
      inventory,
      session,
      sessionWorktreeId,
      repoId: getRepoIdFromWorktreeId(workspace.id),
      worktreeWslDistro,
      currentRevision: this.getTerminalTopologyRevision(workspace.id),
      ports: {
        getPty: (handle) => this.getLivePtyForHandle(handle)?.pty ?? null,
        getLeaves: (ptyId) => this.getLeavesForPty(ptyId),
        getLeaf: (tabId, leafId) => this.leaves.get(this.getLeafKey(tabId, leafId)),
        getMobileSnapshots: () => this.mobileSessionTabsByWorktree.values(),
        getSession: (worktreeId) => this.getWorkspaceSessionForWorktree(worktreeId),
        setSession: (worktreeId, next) => this.setWorkspaceSessionForWorktree(worktreeId, next),
        flushSession: () => this.flushWorkspaceSessionOrThrowAsync(),
        hydrateSession: (worktreeId) =>
          this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId, {
            force: true,
            allowAttachedWindow: true,
            onlyRuntimeOwnedTerminals: true
          }),
        notifySessionChanged: (worktreeId) => this.notifyMobileSessionTabsChanged(worktreeId),
        getSnapshot: (worktreeId) => this.getTerminalOrphanAdoptionSnapshot(worktreeId)
      }
    })
  }

  protected getTerminalOrphanAdoptionSnapshot(worktreeId: string): RuntimeMobileSessionTabsResult {
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId, {
      allowAttachedWindow: true,
      onlyRuntimeOwnedTerminals: true
    })
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    return this.getMobileSessionTabsForWorktree(worktreeId)
  }

  // Why: when --terminal is omitted, the CLI auto-resolves to the active
  // terminal in the current worktree — matching browser's implicit active tab.
  async resolveActiveTerminal(
    worktreeSelector?: string,
    options: { requireUnambiguous?: boolean } = {}
  ): Promise<string> {
    if (this.graphStatus !== 'ready') {
      const targetWorktreeId = worktreeSelector
        ? (await this.resolveWorktreeSelector(worktreeSelector)).id
        : null
      const snapshots = targetWorktreeId
        ? [this.getMobileSessionTabsForWorktree(targetWorktreeId)]
        : await this.listAllMobileSessionTabs()
      for (const snapshot of snapshots) {
        const activeTerminal = snapshot.tabs.find(
          (tab) =>
            tab.type === 'terminal' &&
            tab.isActive &&
            tab.status === 'ready' &&
            typeof tab.terminal === 'string'
        )
        if (activeTerminal?.type === 'terminal' && activeTerminal.terminal) {
          return activeTerminal.terminal
        }
      }
      const listed = await this.listTerminals(worktreeSelector, undefined, {
        includeVisualLayouts: false
      })
      // Same arbitrary pick, same misattribution: refuse for callers claiming their own identity.
      if (options.requireUnambiguous && listed.terminals.length > 1) {
        throw new Error('no_active_terminal')
      }
      const first = listed.terminals[0]?.handle
      if (first) {
        return first
      }
      throw new Error('no_active_terminal')
    }
    this.assertGraphReady()

    const targetWorktreeId = worktreeSelector
      ? (await this.resolveWorktreeSelector(worktreeSelector)).id
      : null

    // Prefer the tab's activeLeafId — this is the pane the user last focused.
    //
    // Skipped entirely for an identity claim: which pane the user last looked at says nothing
    // about which terminal the CALLER is, so preferring it is still a guess.
    for (const tab of options.requireUnambiguous ? [] : this.tabs.values()) {
      if (targetWorktreeId && tab.worktreeId !== targetWorktreeId) {
        continue
      }
      if (!tab.activeLeafId) {
        continue
      }
      const leafKey = this.getLeafKey(tab.tabId, tab.activeLeafId)
      const leaf = this.leaves.get(leafKey)
      if (leaf) {
        return this.issueHandle(leaf)
      }
    }

    // Fallback: any leaf in the target worktree.
    //
    // `requireUnambiguous` callers are asking "which terminal AM I", and an arbitrary
    // iteration-order pick answers that with someone else's pane: a bare `check` then reads and
    // consumes a sibling's dispatch mailbox, and a bare `worker_done` can settle a sibling's
    // context-only dispatch, which has no capability token to reject on. Refusing is the only
    // safe answer when more than one leaf could be meant.
    const candidates: RuntimeLeafRecord[] = []
    for (const leaf of this.leaves.values()) {
      if (targetWorktreeId && leaf.worktreeId !== targetWorktreeId) {
        continue
      }
      if (!options.requireUnambiguous) {
        return this.issueHandle(leaf)
      }
      candidates.push(leaf)
      if (candidates.length > 1) {
        break
      }
    }
    if (candidates.length === 1) {
      return this.issueHandle(candidates[0]!)
    }

    throw new Error('no_active_terminal')
  }

  // Why: orchestration records the pane key as the remint-stable assignee
  // identity at dispatch time; null (best-effort) rather than throwing so
  // dispatch still works for handles without a resolvable pane.
  getTerminalPaneKey(handle: string): string | null {
    return (
      resolveStructuredWorkerAuthority(handle, this.getOrchestrationDbIfAvailable?.() ?? null)
        ?.identity.paneKey ?? this.getPaneKeyForTerminalHandle(handle)
    )
  }

  getLiveTerminalPaneKey(handle: string): string | null {
    const structured = resolveStructuredWorkerAuthority(
      handle,
      this.getOrchestrationDbIfAvailable?.() ?? null
    )
    if (structured) {
      // `resolveBareOrchestrationRecipient` routes direct mail through this, not through
      // getTerminalPaneKey. The connected-gate below exists so mail is never routed to a corpse,
      // so the structured answer needs a real liveness proof too, not just a registry hit.
      return observeStructuredWorker(structured.identity).status === 'live'
        ? structured.identity.paneKey
        : null
    }
    const runtimePty = this.getLivePtyForHandle(handle)
    if (runtimePty) {
      return runtimePty.pty.connected ? (runtimePty.pty.paneKey ?? null) : null
    }
    try {
      const leaf = this.resolveLiveLeafForHandle(handle)
      if (!leaf?.ptyId) {
        return null
      }
      const pty = this.ptysById.get(leaf.ptyId)
      return pty?.connected === false ? null : this.getPaneKeyForTerminalHandle(handle)
    } catch {
      return null
    }
  }

  getTerminalLivenessVerdict(handle: string): PtyLivenessVerdict | null {
    try {
      return this.getPtyLivenessVerdict(this.getTerminalAgentStatusPtyId(handle))
    } catch {
      return null
    }
  }
}
