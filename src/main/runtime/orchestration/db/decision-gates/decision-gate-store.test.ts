import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'
import type { GateTransitionEvent } from './decision-gate-store'

// resolveGateIfPending + gate-transition listener coverage. Store basics
// (create/resolve/timeout/list) live in the `decision gates` block of
// src/main/runtime/orchestration/db.test.ts — this file stays focused on the
// phone-path resolution guards and the open/closed emission contract.
describe('decision-gate-store', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    db?.close()
  })

  function createDb(): OrchestrationDb {
    db = new OrchestrationDb(':memory:')
    return db
  }

  it('resolveGateIfPending resolves a pending gate, readies the task, and returns the row', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })

    const resolved = d.resolveGateIfPending(gate.id, 'phone')
    expect(resolved?.status).toBe('resolved')
    expect(resolved?.resolution).toBe('phone')
    expect(d.getGate(gate.id)?.status).toBe('resolved')
    expect(d.getTask(task.id)?.status).toBe('ready')
  })

  it('resolveGateIfPending neither overwrites a resolution nor touches the task once resolved', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })
    d.resolveGate(gate.id, 'cli')
    d.updateTaskStatus(task.id, 'completed')

    const lost = d.resolveGateIfPending(gate.id, 'phone')
    expect(lost).toBeUndefined()
    expect(d.getGate(gate.id)?.resolution).toBe('cli')
    expect(d.getTask(task.id)?.status).toBe('completed')
  })

  it('resolveGateIfPending is a no-op on a timed-out gate', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })
    d.timeoutGate(gate.id)

    const lost = d.resolveGateIfPending(gate.id, 'phone')
    expect(lost).toBeUndefined()
    expect(d.getGate(gate.id)?.status).toBe('timeout')
    expect(d.getGate(gate.id)?.resolution).toBeNull()
    expect(d.getTask(task.id)?.status).toBe('blocked')
  })

  it('resolveGate wins the race against resolveGateIfPending: exactly one resolution lands', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    const events: GateTransitionEvent[] = []
    d.setGateTransitionListener((event) => events.push(event))
    const gate = d.createGate({ taskId: task.id, question: 'ok?' })

    const won = d.resolveGate(gate.id, 'cli')
    const lost = d.resolveGateIfPending(gate.id, 'phone')
    expect(won?.status).toBe('resolved')
    expect(lost).toBeUndefined()
    expect(d.getGate(gate.id)?.resolution).toBe('cli')
    expect(d.getTask(task.id)?.status).toBe('ready')
    // open + one closed only — the losing resolveGateIfPending stays silent.
    expect(events).toEqual([
      { kind: 'open', gate },
      { kind: 'closed', gate: won }
    ])
  })

  it('emits open on createGate and closed only when a conditional resolution lands', () => {
    const d = createDb()
    const t1 = d.createTask({ spec: 'a' })
    const t2 = d.createTask({ spec: 'b' })
    const events: GateTransitionEvent[] = []
    d.setGateTransitionListener((event) => events.push(event))

    const g1 = d.createGate({ taskId: t1.id, question: 'q1' })
    expect(events).toEqual([{ kind: 'open', gate: g1 }])

    const timedOut = d.timeoutGate(g1.id)
    expect(events).toEqual([
      { kind: 'open', gate: g1 },
      { kind: 'closed', gate: timedOut }
    ])

    // Conditional UPDATE misses (gate no longer pending) → no emission.
    d.timeoutGate(g1.id)
    d.resolveGateIfPending(g1.id, 'late')
    expect(events).toHaveLength(2)

    const g2 = d.createGate({ taskId: t2.id, question: 'q2' })
    const resolved = d.resolveGate(g2.id, 'yes')
    expect(events).toEqual([
      { kind: 'open', gate: g1 },
      { kind: 'closed', gate: timedOut },
      { kind: 'open', gate: g2 },
      { kind: 'closed', gate: resolved }
    ])
  })

  it('listener throws do not propagate into the store path', () => {
    const d = createDb()
    const task = d.createTask({ spec: 'work' })
    d.setGateTransitionListener(() => {
      throw new Error('notification blew up')
    })

    const gate = d.createGate({ taskId: task.id, question: 'ok?' })
    expect(gate.status).toBe('pending')
    expect(d.getTask(task.id)?.status).toBe('blocked')

    const resolved = d.resolveGate(gate.id, 'yes')
    expect(resolved?.status).toBe('resolved')
    expect(d.getTask(task.id)?.status).toBe('ready')

    const retry = d.createGate({ taskId: task.id, question: 'again?' })
    const ifPending = d.resolveGateIfPending(retry.id, 'yes')
    expect(ifPending?.status).toBe('resolved')
    expect(d.getTask(task.id)?.status).toBe('ready')

    const last = d.createGate({ taskId: task.id, question: 'last?' })
    const timedOut = d.timeoutGate(last.id)
    expect(timedOut?.status).toBe('timeout')
    expect(d.getTask(task.id)?.status).toBe('blocked')
  })
})
