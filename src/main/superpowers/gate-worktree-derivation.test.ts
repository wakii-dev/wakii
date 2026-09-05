import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../runtime/orchestration/db'
import { LEGACY_RUN_ID } from '../runtime/orchestration/db/contract-constants'
import { deriveStoryIdForWorktree, deriveWorktreeIdForGate } from './gate-worktree-derivation'

describe('deriveWorktreeIdForGate', () => {
  let db: OrchestrationDb

  afterEach(() => {
    db?.close()
  })

  function seedDispatch(taskId: string, worktreeId: string | null): string {
    const dispatchId = `ctx_${taskId}_${Math.random().toString(36).slice(2, 8)}`
    db.db
      .prepare('INSERT INTO dispatch_contexts (id, run_id, task_id) VALUES (?, ?, ?)')
      .run(dispatchId, LEGACY_RUN_ID, taskId)
    db.db
      .prepare('INSERT INTO worker_dispatches (dispatch_id, worktree_id) VALUES (?, ?)')
      .run(dispatchId, worktreeId)
    return dispatchId
  }

  function seedGate(runId: string, taskId: string): void {
    db.db
      .prepare('INSERT INTO decision_gates (id, run_id, task_id, question) VALUES (?, ?, ?, ?)')
      .run(`gate_${taskId}`, runId, taskId, 'Proceed?')
  }

  it('derives the worktree of the newest dispatch for a mapped gate', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'gate target' })
    const { dispatch } = db.createStartingWorkerDispatch({
      taskId: task.id,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
    db.db
      .prepare('UPDATE worker_dispatches SET worktree_id = ? WHERE dispatch_id = ?')
      .run('repo::/wt/real', dispatch.id)
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBe(
      'repo::/wt/real'
    )
  })

  it('returns null when the newest dispatch has a NULL worktree_id', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'null worktree' })
    seedDispatch(task.id, null)
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBeNull()
  })

  it('returns null when the dispatch_context has no worker_dispatches row', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'orphan context' })
    db.db
      .prepare('INSERT INTO dispatch_contexts (id, run_id, task_id) VALUES (?, ?, ?)')
      .run('ctx_bare', LEGACY_RUN_ID, task.id)
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBeNull()
  })

  it('returns null when the task has no dispatch_context at all', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'never dispatched' })
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBeNull()
  })

  it('returns null for a deleted task whose gate row survives', () => {
    db = new OrchestrationDb(':memory:')
    seedGate(LEGACY_RUN_ID, 'task_deleted')

    expect(
      deriveWorktreeIdForGate(db, { run_id: LEGACY_RUN_ID, task_id: 'task_deleted' })
    ).toBeNull()
  })

  it('picks the newest dispatch_context by rowid among several for the task', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'retried task' })
    seedDispatch(task.id, 'repo::/wt/older')
    seedDispatch(task.id, 'repo::/wt/newer')
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBe(
      'repo::/wt/newer'
    )
  })

  it('does not fall back to an older dispatch when the newest has a NULL worktree_id', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'retried onto unassigned dispatch' })
    seedDispatch(task.id, 'repo::/wt/older')
    seedDispatch(task.id, null)
    seedGate(task.run_id, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: task.run_id, task_id: task.id })).toBeNull()
  })

  it('derives for a legacy run_id gate — no LEGACY_RUN_ID short-circuit', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ spec: 'legacy gate target' })
    seedDispatch(task.id, 'repo::/wt/legacy')
    // Gate row written by legacy createGate with LEGACY_RUN_ID default.
    seedGate(LEGACY_RUN_ID, task.id)

    expect(deriveWorktreeIdForGate(db, { run_id: LEGACY_RUN_ID, task_id: task.id })).toBe(
      'repo::/wt/legacy'
    )
  })
})

describe('deriveStoryIdForWorktree', () => {
  it('returns null for an empty bracket list', () => {
    expect(deriveStoryIdForWorktree([])).toBeNull()
  })

  it('returns the single bracket storyId', () => {
    expect(deriveStoryIdForWorktree([{ storyId: 'brackets/fi305.md', mtime: 100 }])).toBe(
      'brackets/fi305.md'
    )
  })

  it('returns the newest mtime when several brackets map to the worktree', () => {
    expect(
      deriveStoryIdForWorktree([
        { storyId: 'brackets/older.md', mtime: 100 },
        { storyId: 'brackets/newer.md', mtime: 200 },
        { storyId: 'brackets/mid.md', mtime: 150 }
      ])
    ).toBe('brackets/newer.md')
  })

  it('breaks an mtime tie by storyId ascending', () => {
    expect(
      deriveStoryIdForWorktree([
        { storyId: 'brackets/bb.md', mtime: 200 },
        { storyId: 'brackets/aa.md', mtime: 200 }
      ])
    ).toBe('brackets/aa.md')
  })
})
