import { describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../../orchestration/db'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { SUPERPOWERS_GATE_RESOLVE_METHODS } from './superpowers-gate-resolve'

function makeRuntime(db: OrchestrationDb): OrcaRuntimeService {
  return { getOrchestrationDb: () => db } as unknown as OrcaRuntimeService
}

// Real store API (createGate completes dispatches + blocks the task), so the
// resolve path exercises the same pending→resolved→task-ready chain as prod.
function seedPendingGate(
  db: OrchestrationDb,
  options?: string[]
): { gateId: string; taskId: string } {
  const task = db.createTask({ spec: 'gate-resolve-test' })
  const gate = db.createGate({ taskId: task.id, question: 'Proceed with SF-1?', options })
  return { gateId: gate.id, taskId: task.id }
}

async function callGateResolve(
  runtime: OrcaRuntimeService,
  gateId: string,
  resolution: string
): Promise<unknown> {
  const method = SUPERPOWERS_GATE_RESOLVE_METHODS[0]!
  const handler = method.handler as (
    params: unknown,
    ctx: { runtime: OrcaRuntimeService }
  ) => unknown
  return handler({ gateId, resolution }, { runtime })
}

describe('superpowers.gateResolve', () => {
  it('registers the method with allowing-empty string params', () => {
    expect(SUPERPOWERS_GATE_RESOLVE_METHODS).toHaveLength(1)
    expect(SUPERPOWERS_GATE_RESOLVE_METHODS[0]?.name).toBe('superpowers.gateResolve')
    const params = SUPERPOWERS_GATE_RESOLVE_METHODS[0]?.params
    // '' must pass the schema so the handler maps it into the error taxonomy
    expect(params?.safeParse({ gateId: '', resolution: 'yes' }).success).toBe(true)
    expect(params?.safeParse({ gateId: 42, resolution: 'yes' }).success).toBe(false)
  })

  it('maps empty/whitespace gateId to gate_not_found', async () => {
    const db = new OrchestrationDb(':memory:')
    const runtime = makeRuntime(db)
    await expect(callGateResolve(runtime, '', 'yes')).resolves.toEqual({ error: 'gate_not_found' })
    await expect(callGateResolve(runtime, '   ', 'yes')).resolves.toEqual({
      error: 'gate_not_found'
    })
  })

  it('maps empty/whitespace resolution to invalid_resolution without touching the gate', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId } = seedPendingGate(db, ['yes', 'no'])
    const runtime = makeRuntime(db)
    await expect(callGateResolve(runtime, gateId, '')).resolves.toEqual({
      error: 'invalid_resolution'
    })
    await expect(callGateResolve(runtime, gateId, '  ')).resolves.toEqual({
      error: 'invalid_resolution'
    })
    expect(db.getGate(gateId)?.status).toBe('pending')
  })

  it('maps an unknown gate to gate_not_found', async () => {
    const db = new OrchestrationDb(':memory:')
    await expect(callGateResolve(makeRuntime(db), 'gate_missing', 'yes')).resolves.toEqual({
      error: 'gate_not_found'
    })
  })

  it('resolves a pending gate and flips the task to ready', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId, taskId } = seedPendingGate(db, ['yes', 'no'])
    await expect(callGateResolve(makeRuntime(db), gateId, 'yes')).resolves.toEqual({
      gateId,
      status: 'resolved',
      resolution: 'yes'
    })
    expect(db.getGate(gateId)).toMatchObject({ status: 'resolved', resolution: 'yes' })
    expect(db.getTask(taskId)?.status).toBe('ready')
  })

  it('accepts a resolution outside gate options (server-trusting contract)', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId } = seedPendingGate(db, ['yes', 'no'])
    await expect(callGateResolve(makeRuntime(db), gateId, 'surprise')).resolves.toEqual({
      gateId,
      status: 'resolved',
      resolution: 'surprise'
    })
  })

  it('races two concurrent resolves on one pending gate → one wins, one gate_not_pending', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId } = seedPendingGate(db, ['yes', 'no'])
    const runtime = makeRuntime(db)
    const results = (await Promise.all([
      callGateResolve(runtime, gateId, 'yes'),
      callGateResolve(runtime, gateId, 'no')
    ])) as { status?: string; error?: string }[]
    expect(results.filter((r) => r.status === 'resolved')).toHaveLength(1)
    expect(results.filter((r) => r.error === 'gate_not_pending')).toHaveLength(1)
    expect(db.getGate(gateId)?.resolution).toBe('yes')
  })

  it('returns gate_not_pending for an already-resolved gate (CLI won the race)', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId } = seedPendingGate(db, ['yes', 'no'])
    db.resolveGate(gateId, 'from-cli')
    await expect(callGateResolve(makeRuntime(db), gateId, 'yes')).resolves.toEqual({
      error: 'gate_not_pending'
    })
    // Phone path must not overwrite the CLI resolution.
    expect(db.getGate(gateId)?.resolution).toBe('from-cli')
  })

  it('returns gate_not_pending for a timed-out gate', async () => {
    const db = new OrchestrationDb(':memory:')
    const { gateId } = seedPendingGate(db, ['yes', 'no'])
    db.timeoutGate(gateId)
    await expect(callGateResolve(makeRuntime(db), gateId, 'yes')).resolves.toEqual({
      error: 'gate_not_pending'
    })
  })
})
