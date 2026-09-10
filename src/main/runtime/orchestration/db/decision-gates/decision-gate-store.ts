import type { DecisionGateRow, DispatchContextRow, GateStatus } from '../../types'
import { OrchestrationError } from '../../orchestration-error'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { transitionLifecycleWithDb } from '../lifecycle-transition'

// ── Decision Gates ──

export type GateTransitionEvent =
  | { kind: 'open'; gate: DecisionGateRow }
  | { kind: 'closed'; gate: DecisionGateRow }
export type GateTransitionListener = (event: GateTransitionEvent) => void

// Options non-empty + resolution ∉ options → throw (pattern createGate — KHÔNG
// return undefined trộn lost-race). Options rỗng → pass nguyên trạng (conformance
// resolution:'phone' trên gate không options).
function assertResolutionInOptions(gate: DecisionGateRow, resolution: string): void {
  const options: string[] = JSON.parse(gate.options) as string[]
  if (options.length > 0 && !options.includes(resolution)) {
    throw new OrchestrationError(
      'resolution_not_in_options',
      `Resolution "${resolution}" is not one of the gate options [${options.join(', ')}].`,
      { gateId: gate.id, resolution, options }
    )
  }
}

export function setGateTransitionListener(
  this: OrchestrationDb,
  listener: GateTransitionListener
): void {
  this.gateTransitionListener = listener
}

export function createGate(
  this: OrchestrationDb,
  gate: {
    taskId: string
    question: string
    options?: string[]
    requester?: { handle: string; paneKey?: string | null; dispatchId: string }
  }
): DecisionGateRow {
  this.db.exec('SAVEPOINT create_gate')
  let created: DecisionGateRow | undefined
  try {
    const task = this.getTask(gate.taskId)
    if (!task) {
      throw new OrchestrationError(
        'lifecycle_not_found',
        `Task ${gate.taskId} was not found while creating a decision gate.`,
        { taskId: gate.taskId }
      )
    }
    const runId = task.run_id
    this.requireRun(runId)
    const active = this.db
      .prepare(
        `SELECT * FROM dispatch_contexts
         WHERE task_id = ? AND status IN ('pending', 'dispatched')
         ORDER BY rowid DESC LIMIT 1`
      )
      .get(gate.taskId) as DispatchContextRow | undefined
    if (
      gate.requester &&
      (!active ||
        active.id !== gate.requester.dispatchId ||
        !this.isDispatchMessageSender({
          dispatchId: active.id,
          handle: gate.requester.handle,
          paneKey: gate.requester.paneKey,
          allowCanonicalDispatchHandle: true
        }))
    ) {
      throw new OrchestrationError(
        'consumer_fenced',
        `Terminal ${gate.requester.handle} does not own the active Dispatch for Task ${gate.taskId}.`,
        { taskId: gate.taskId, dispatchId: active?.id }
      )
    }
    const activeWorker = this.db
      .prepare(
        `SELECT active.id
         FROM dispatch_contexts active
         JOIN worker_dispatches worker ON worker.dispatch_id = active.id
         WHERE active.task_id = ? AND active.status IN ('pending', 'dispatched')
           AND worker.state NOT IN ('failed', 'succeeded', 'stopped', 'abandoned')
         ORDER BY active.rowid DESC LIMIT 1`
      )
      .get(gate.taskId) as { id: string } | undefined
    if (activeWorker) {
      throw new OrchestrationError(
        'task_not_startable',
        `Task ${gate.taskId} cannot open a gate while supervised Dispatch ${activeWorker.id} is active; stop or settle its worker first.`,
        { taskId: gate.taskId, dispatchId: activeWorker.id }
      )
    }
    const id = generateId('gate')
    const optionsJson = JSON.stringify(gate.options ?? [])
    this.db
      .prepare(
        'INSERT INTO decision_gates (id, run_id, task_id, question, options) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, runId, gate.taskId, gate.question, optionsJson)
    this.completeActiveDispatchesForTask(gate.taskId)
    transitionLifecycleWithDb(this.db, {
      entity: 'task',
      id: gate.taskId,
      from: task.status,
      to: 'blocked'
    })
    created = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(id) as
      | DecisionGateRow
      | undefined
    this.db.exec('RELEASE create_gate')
  } catch (error) {
    this.db.exec('ROLLBACK TO create_gate')
    this.db.exec('RELEASE create_gate')
    throw error
  }
  // Emit after RELEASE: a throwing listener must not ROLLBACK a released savepoint.
  if (created) {
    try {
      this.gateTransitionListener?.({ kind: 'open', gate: created })
    } catch {
      /* notification failure must not break gate creation */
    }
  }
  return created as DecisionGateRow
}

export function resolveGate(
  this: OrchestrationDb,
  gateId: string,
  resolution: string
): DecisionGateRow | undefined {
  const gate = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
    | DecisionGateRow
    | undefined
  if (!gate) {
    return undefined
  }
  assertResolutionInOptions(gate, resolution)

  this.db.exec('SAVEPOINT resolve_gate')
  let resolved: DecisionGateRow | undefined
  try {
    this.db
      .prepare(
        "UPDATE decision_gates SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?"
      )
      .run(resolution, gateId)
    this.updateTaskStatus(gate.task_id, 'ready')
    resolved = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
      | DecisionGateRow
      | undefined
    this.db.exec('RELEASE resolve_gate')
  } catch (error) {
    this.db.exec('ROLLBACK TO resolve_gate')
    this.db.exec('RELEASE resolve_gate')
    throw error
  }
  // Emit after RELEASE: a throwing listener must not ROLLBACK a released savepoint.
  if (resolved) {
    try {
      this.gateTransitionListener?.({ kind: 'closed', gate: resolved })
    } catch {
      /* notification failure must not break gate resolution */
    }
  }
  return resolved
}

export function resolveGateIfPending(
  this: OrchestrationDb,
  gateId: string,
  resolution: string
): DecisionGateRow | undefined {
  // Validate before SAVEPOINT: a bad resolution must not open (nor need to
  // roll back) a savepoint at all. Gate-not-found stays undefined-return here
  // (phone path maps it to gate_not_found); options mismatch THROWS instead —
  // a resolution outside gate.options is a caller bug, not a lost race.
  const existing = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
    | DecisionGateRow
    | undefined
  if (existing) {
    assertResolutionInOptions(existing, resolution)
  }

  this.db.exec('SAVEPOINT resolve_gate_if_pending')
  let resolved: DecisionGateRow | undefined
  try {
    // Why: phone path — chỉ land khi còn pending, không overwrite CLI resolution.
    const result = this.db
      .prepare(
        "UPDATE decision_gates SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ? AND status = 'pending'"
      )
      .run(resolution, gateId)
    if (result.changes > 0) {
      resolved = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
        | DecisionGateRow
        | undefined
      if (resolved) {
        this.updateTaskStatus(resolved.task_id, 'ready')
      }
    }
    this.db.exec('RELEASE resolve_gate_if_pending')
  } catch (error) {
    this.db.exec('ROLLBACK TO resolve_gate_if_pending')
    this.db.exec('RELEASE resolve_gate_if_pending')
    throw error
  }
  // Emit NGOÀI try/catch của savepoint (plan-critic P1: listener throw sau RELEASE
  // vào catch cũ → ROLLBACK savepoint đã release → "no such savepoint" crash store
  // path). Wrapper riêng nuốt throw listener (test: listener throw không lan store).
  if (resolved) {
    try {
      this.gateTransitionListener?.({ kind: 'closed', gate: resolved })
    } catch {
      /* notification failure must not break gate resolution */
    }
  }
  return resolved
}

export function timeoutGate(this: OrchestrationDb, gateId: string): DecisionGateRow | undefined {
  const result = this.db
    .prepare(
      // Why: without the status guard a late timeout overwrites a gate the user already resolved.
      "UPDATE decision_gates SET status = 'timeout', resolved_at = datetime('now') WHERE id = ? AND status = 'pending'"
    )
    .run(gateId)
  const timedOut = this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(gateId) as
    | DecisionGateRow
    | undefined
  if (result.changes > 0 && timedOut) {
    try {
      this.gateTransitionListener?.({ kind: 'closed', gate: timedOut })
    } catch {
      /* notification failure must not break gate resolution */
    }
  }
  return timedOut
}

export function listGates(
  this: OrchestrationDb,
  filter?: { taskId?: string; status?: GateStatus }
): DecisionGateRow[] {
  if (filter?.taskId && filter?.status) {
    return this.db
      .prepare('SELECT * FROM decision_gates WHERE task_id = ? AND status = ? ORDER BY created_at')
      .all(filter.taskId, filter.status) as DecisionGateRow[]
  }
  if (filter?.taskId) {
    return this.db
      .prepare('SELECT * FROM decision_gates WHERE task_id = ? ORDER BY created_at')
      .all(filter.taskId) as DecisionGateRow[]
  }
  if (filter?.status) {
    return this.db
      .prepare('SELECT * FROM decision_gates WHERE status = ? ORDER BY created_at')
      .all(filter.status) as DecisionGateRow[]
  }
  return this.db
    .prepare('SELECT * FROM decision_gates ORDER BY created_at')
    .all() as DecisionGateRow[]
}

export function getGate(this: OrchestrationDb, id: string): DecisionGateRow | undefined {
  return this.db.prepare('SELECT * FROM decision_gates WHERE id = ?').get(id) as
    | DecisionGateRow
    | undefined
}

export type DecisionGateStoreMethods = {
  createGate: typeof createGate
  resolveGate: typeof resolveGate
  resolveGateIfPending: typeof resolveGateIfPending
  timeoutGate: typeof timeoutGate
  listGates: typeof listGates
  getGate: typeof getGate
  setGateTransitionListener: typeof setGateTransitionListener
}

export function attachDecisionGateStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    createGate,
    resolveGate,
    resolveGateIfPending,
    timeoutGate,
    listGates,
    getGate,
    setGateTransitionListener
  })
}
