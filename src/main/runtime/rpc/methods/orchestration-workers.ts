import { OrchestrationError } from '../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../core'
import { startFederatedWorker } from './orchestration-federated-worker-start'
import { startLocalWorker } from './orchestration-local-worker-start'
import { WorkerStartParams } from './orchestration-worker-start-schema'
import { resolveOrchestrationCaller } from './orchestration-run-scope'
import {
  isWorkerStartTimeoutWithinTimerLimit,
  resolveWorkerStartReadinessTimeoutMs
} from '../../../../shared/orchestration-timing-budgets'

export const ORCHESTRATION_WORKER_START_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.workerStart',
    params: WorkerStartParams,
    handler: async (
      params,
      { runtime, orchestrationMutation, orchestrationCompatibilityEvidence }
    ) => {
      if (!isWorkerStartTimeoutWithinTimerLimit(params.timeoutMs)) {
        throw new OrchestrationError(
          'invalid_argument',
          `--timeout-ms is too large for worker-start transport grace; the derived timeout must fit within the timer limit.`
        )
      }
      const readinessTimeoutMs = resolveWorkerStartReadinessTimeoutMs(params.timeoutMs)
      const db = runtime.getOrchestrationDb()
      // Why: worker-start was the only Run-scoped verb that skipped this, so a
      // declared --from could name someone else's pane and inherit their depth.
      const coordinatorPane = resolveOrchestrationCaller(runtime, {
        callerTerminalHandle: params.from,
        callerEvidence: orchestrationCompatibilityEvidence
      })
      const run = coordinatorPane ? db.getCurrentRunForPane(coordinatorPane) : undefined
      if (!run || (params.run && params.run !== run.id)) {
        throw new OrchestrationError(
          'consumer_fenced',
          'worker-start requires the coordinator terminal currently bound to the Task Run.'
        )
      }
      const task = db.getTask(params.task)
      if (!task || task.run_id !== run.id) {
        throw new OrchestrationError(
          'task_not_found',
          `Task ${params.task} was not found in Run ${run.id}.`
        )
      }

      assertStructuredWorkerStartSupported(params)
      if (params.on) {
        return startFederatedWorker({
          params,
          runtime,
          db,
          runId: run.id,
          task,
          orchestrationMutation
        })
      }
      return startLocalWorker({
        params,
        runtime,
        db,
        run,
        task,
        readinessTimeoutMs,
        orchestrationMutation
      })
    }
  })
]

/**
 * Where `--structured` cannot apply.
 *
 * Refused rather than ignored: silently starting a terminal worker under a structured request
 * would hand the coordinator a worker of a different kind than it asked for.
 */
function assertStructuredWorkerStartSupported(params: {
  structured?: boolean
  on?: string
  terminal?: string
  worktree?: string
}): void {
  if (!params.structured) {
    return
  }
  if (params.on) {
    throw new OrchestrationError(
      'invalid_argument',
      'Structured workers run only on the local execution host; --structured cannot combine with --on.'
    )
  }
  if (params.terminal) {
    throw new OrchestrationError(
      'invalid_argument',
      '--terminal reuses a running terminal agent and cannot combine with --structured.'
    )
  }
  if (params.worktree === 'new-child' || params.worktree === 'new-top-level') {
    throw new OrchestrationError(
      'invalid_argument',
      'Structured workers attach to an existing worktree; create the worktree first, then pass it as --worktree.'
    )
  }
}
