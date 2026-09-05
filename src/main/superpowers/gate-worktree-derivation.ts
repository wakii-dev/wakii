// ── PINNED worktree-catalog enumeration source (spec adaptation 3, rev 3) ─────
// ONE source for ALL consumers (storyList, storyDetail, notification routing):
//   the runtime resolved-worktree snapshot — the same data protected
//   `OrcaRuntimeWithListKnownResolvedWorktreesForExplicitTarget.listResolvedWorktrees()`
//   returns (computed by computeResolvedWorktrees(),
//   src/main/runtime/orca-runtime-list-known-resolved-worktrees-for-explicit-target.ts).
//   Do NOT re-probe; do NOT substitute.
//
// ACCESS PATH (review fix C1 — concrete, no re-probing):
// Tasks 5/6/7 write src/main/runtime/rpc/methods/superpowers-*.ts handlers whose
// ctx.runtime is typed `OrcaRuntimeService` (src/main/runtime/rpc/core.ts:65), so
// the `protected` listResolvedWorktrees() (file above, :72) is a TS compile error
// from there. Task 5 must add a minimal 1:1 public accessor:
//   `listWorktreeCatalog(): Promise<ResolvedWorktree[]>`
//   declared in the SAME class as listResolvedWorktrees() (file above, next to
//   :72), body `return this.listResolvedWorktrees()`.
// Same-class declaration avoids mixin chain-order reasoning; a public method on
// a chain mixin surfaces on OrcaRuntimeService. Proof the pattern compiles from
// an RPC handler: getOrchestrationDb() is declared public in the mixin file
// src/main/runtime/orca-runtime-fence-automation-owner.ts:152 and is called as
// `runtime.getOrchestrationDb()` inside
// src/main/runtime/rpc/methods/orchestration-gates.ts:55. Handlers call
// `ctx.runtime.listWorktreeCatalog()` and feed rows to the derivation helpers.
//
// Why it wins over the alternatives:
// - `runtime.listManagedWorktrees(repoSelector?)` is repo-scoped (needs a repo
//   selector per call) and flows through managedWorktreeQueries.list, which
//   applies isVisible() visibility filtering — hidden workspaces would silently
//   drop brackets. Rejected.
// - `store.getFolderWorkspaces()` covers only folder workspaces, not git
//   worktrees; it cannot key `${repoId}::${path}` ids for dispatch rows. Rejected
//   as a standalone source (already folded INTO computeResolvedWorktrees via
//   listRuntimeFolderWorkspaces — folder workspaces come out of
//   listResolvedWorktrees() too, so no second source is needed).
//
// Criteria check:
// - id + path + displayName: ResolvedWorktree = Worktree & {...}; Worktree.id is
//   `${repoId}::${path}` (src/shared/worktree/types.ts) — the same id format
//   stored in worker_dispatches.worktree_id.
// - no visibility filter: computeResolvedWorktrees reads the store (getRepos +
//   getAllWorktreeMeta + per-repo scans incl. folder workspaces) and projects
//   lineage; it never consults isVisible. Archived/hidden workspaces with
//   brackets still enumerate.
// - cross-platform: paths are host-native strings from the repo scan; id
//   composition and comparisons elsewhere must use the shared worktree-id
//   helpers (splitWorktreeId / worktreeIdsEqual), never raw path equality.

import type { OrchestrationDb } from '../runtime/orchestration/db'

export type GateWorktreeProbe = { run_id: string; task_id: string }

/**
 * gate.task_id → dispatch_contexts (newest by rowid) → worker_dispatches.worktree_id.
 * NULL worktree_id / no dispatch row / deleted task → null. No LEGACY_RUN_ID
 * short-circuit: the guard is conditional on join failure only (spec adaptation 1).
 */
export function deriveWorktreeIdForGate(
  db: OrchestrationDb,
  gate: GateWorktreeProbe
): string | null {
  const context = db.db
    .prepare('SELECT id FROM dispatch_contexts WHERE task_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(gate.task_id) as { id: string } | undefined
  if (!context) {
    return null
  }
  const worker = db.db
    .prepare('SELECT worktree_id FROM worker_dispatches WHERE dispatch_id = ?')
    .get(context.id) as { worktree_id: string | null } | undefined
  return worker?.worktree_id ?? null
}

export type BracketMtimeEntry = { storyId: string; mtime: number }

/**
 * Exactly 1 bracket → it; ≥2 → newest mtime (tie → storyId asc); 0 → null.
 */
export function deriveStoryIdForWorktree(brackets: BracketMtimeEntry[]): string | null {
  if (brackets.length === 0) {
    return null
  }
  let best = brackets[0] as BracketMtimeEntry
  for (const entry of brackets.slice(1)) {
    if (entry.mtime > best.mtime || (entry.mtime === best.mtime && entry.storyId < best.storyId)) {
      best = entry
    }
  }
  return best.storyId
}
