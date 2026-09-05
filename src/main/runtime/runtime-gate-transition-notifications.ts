import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  deriveStoryIdForWorktree,
  deriveWorktreeIdForGate,
  type BracketMtimeEntry
} from '../superpowers/gate-worktree-derivation'
import type { OrchestrationDb } from './orchestration/db'
import type { GateTransitionEvent } from './orchestration/db/decision-gates/decision-gate-store'
import type { MobileNotificationDispatchEvent } from './runtime-mobile-notification-controller'
import { runtimeWorktreeIdsEqual, type ResolvedWorktree } from './runtime-worktree-path-identity'

// Why: gate transitions must reach mobile clients as notifications. The listener is
// registered per db instance from BOTH runtime attach points (getOrchestrationDb lazy
// create + setOrchestrationDb swap) in orca-runtime-fence-automation-owner.ts.
// Catalog source is PINNED to the runtime resolved-worktree snapshot — do not
// substitute (gate-worktree-derivation.ts header).

export type BracketMtimeScanner = (worktreePath: string) => BracketMtimeEntry[]

/** storyId matches the storyList/storyDetail format: `brackets/<filename>` (extension included, spec §3b). */
export function scanWorktreeBracketMtimes(worktreePath: string): BracketMtimeEntry[] {
  const bracketsDir = join(worktreePath, 'docs', 'superpowers', 'brackets')
  return readdirSync(bracketsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      storyId: `brackets/${name}`,
      mtime: statSync(join(bracketsDir, name)).mtimeMs
    }))
}

export type GateTransitionNotificationDeps = {
  db: OrchestrationDb
  listCatalog: () => Promise<ResolvedWorktree[]>
  dispatch: (event: MobileNotificationDispatchEvent) => void
  scanBracketMtimes?: BracketMtimeScanner
}

const wiredDbs = new WeakSet<OrchestrationDb>()

/** Idempotent per db instance; a swapped-in db is a new instance and gets wired. */
export function wireGateTransitionNotifications(deps: GateTransitionNotificationDeps): void {
  if (wiredDbs.has(deps.db)) {
    return
  }
  wiredDbs.add(deps.db)
  // A db without the setter has no gateTransitionListener slot either — it can never emit.
  deps.db.setGateTransitionListener?.(makeGateTransitionNotificationListener(deps))
}

export function makeGateTransitionNotificationListener(
  deps: GateTransitionNotificationDeps
): (event: GateTransitionEvent) => void {
  const scan = deps.scanBracketMtimes ?? scanWorktreeBracketMtimes
  return (event) => {
    // Why: the store emits AFTER savepoint RELEASE and never expects a rejection —
    // the async derivation must resolve silently no matter what.
    void dispatchGateTransitionNotification(deps, scan, event).catch((error) => {
      console.error('[runtime] gate-transition notification failed', error)
    })
  }
}

async function dispatchGateTransitionNotification(
  deps: GateTransitionNotificationDeps,
  scan: BracketMtimeScanner,
  event: GateTransitionEvent
): Promise<void> {
  let worktreeId: string | null = null
  let storyId: string | null = null
  // Derivation failure degrades to null fields; the notification still goes out.
  try {
    const derivedWorktreeId = deriveWorktreeIdForGate(deps.db, {
      run_id: event.gate.run_id,
      task_id: event.gate.task_id
    })
    if (derivedWorktreeId) {
      const row = (await deps.listCatalog()).find((entry) =>
        runtimeWorktreeIdsEqual(entry.id, derivedWorktreeId)
      )
      const bracketStoryId = row ? deriveStoryIdForWorktree(scan(row.path)) : null
      // Spec §3a:87-88 — a mapped worktree without brackets routes to the 'khác' group: both null.
      if (bracketStoryId) {
        worktreeId = derivedWorktreeId
        storyId = bracketStoryId
      }
    }
  } catch {
    worktreeId = null
    storyId = null
  }
  deps.dispatch({
    type: 'notification',
    source: event.kind === 'open' ? 'gate-open' : 'gate-closed',
    title: event.gate.question,
    body: event.kind === 'open' ? '' : (event.gate.resolution ?? ''),
    ...(worktreeId ? { worktreeId } : {}),
    gateId: event.gate.id,
    ...(storyId ? { storyId } : {})
  })
}
