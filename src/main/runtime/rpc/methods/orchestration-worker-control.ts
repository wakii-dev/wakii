import { z } from 'zod'
import { ORCHESTRATION_WORKER_READ_SOURCES } from '../../../../shared/orchestration-worker-output'
import { contextOnlyAbandonWarning } from '../../orchestration/context-only-dispatch-release'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalFiniteNumber, requiredString } from '../schemas'
import {
  callFederatedWorkerShow,
  exposeWorker,
  inspectWorkerTerminal,
  resolvePinnedFederatedServer,
  showContextOnlyWorker
} from './orchestration-worker-observation'
import { readArchivedWorkerOutput } from './orchestration-worker-archive-read'
import { readStructuredWorkerOutput } from './orchestration-structured-worker-lifecycle'
import { releaseStructuredWorkerSession } from './orchestration-structured-worker-session'
import { readFederatedWorkerOutput } from './orchestration-worker-legacy-federated-read'
import { readExactWorkerOutput } from './orchestration-worker-output'
import { exposeWorkerTerminalResource } from './orchestration-worker-release-completion'

const WorkerDispatchParams = z.object({ dispatch: requiredString('Missing --dispatch') })
const WorkerReadParams = WorkerDispatchParams.extend({
  cursor: z.union([z.number().int().nonnegative(), z.string().min(1).max(2_048)]).optional(),
  limit: OptionalFiniteNumber,
  source: z.enum(ORCHESTRATION_WORKER_READ_SOURCES).optional()
})

export const ORCHESTRATION_WORKER_CONTROL_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.workerShow',
    params: WorkerDispatchParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const dispatch = db.getDispatchContextById(params.dispatch)
      let worker = db.getWorkerDispatch(params.dispatch)
      if (!dispatch) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Worker Dispatch ${params.dispatch} was not found.`
        )
      }
      const federated = db.getFederatedDispatch(params.dispatch)
      if (federated) {
        if (!worker) {
          throw new OrchestrationError(
            'dispatch_not_found',
            `Federated Worker Dispatch ${params.dispatch} has no worker record.`
          )
        }
        const server = resolvePinnedFederatedServer(runtime, federated)
        runtime.ensureOrchestrationFederationRelay(dispatch.run_id)
        const remote = await callFederatedWorkerShow(runtime, federated)
        const attachment = remote.attachment
        worker = db.updateWorkerSetupEvidence({
          dispatchId: params.dispatch,
          setupState: attachment.setup_state,
          effects: attachment.effects
        }).worker
        if (
          attachment.state === 'succeeded' ||
          (attachment.state === 'failed' && attachment.stage === 'worker_report_queued')
        ) {
          await runtime
            .syncOrchestrationFederatedDispatchAfterCurrent(params.dispatch)
            .catch(() => undefined)
        } else if (
          attachment.state === 'stopped' &&
          ['stopping', 'stop_unknown'].includes(worker.state)
        ) {
          worker = db.reconcileFederatedWorkerStop(params.dispatch)
        } else if (['ready', 'failed', 'stopped', 'start_unknown'].includes(attachment.state)) {
          worker = db.reconcileFederatedWorkerStart({
            dispatchId: params.dispatch,
            state: attachment.state as 'ready' | 'failed' | 'stopped' | 'start_unknown',
            stage: attachment.stage,
            lastError: attachment.last_error,
            worktreeId: attachment.worktree_id,
            terminalHandle: attachment.terminal_handle,
            setupState: attachment.setup_state,
            effects: attachment.effects,
            residualResources: attachment.residualResources
          })
          if (
            attachment.state === 'ready' &&
            attachment.worktree_id &&
            attachment.terminal_handle
          ) {
            db.updateFederatedDispatchResources({
              dispatchId: params.dispatch,
              remoteRuntimeEpoch: remote.runtimeEpoch,
              worktreeId: attachment.worktree_id,
              terminalHandle: attachment.terminal_handle
            })
          }
        }
        worker = db.getWorkerDispatch(params.dispatch)
        if (!worker) {
          throw new OrchestrationError(
            'dispatch_not_found',
            `Worker Dispatch ${params.dispatch} was not found after remote reconciliation.`
          )
        }
        return {
          dispatch: db.getDispatchContextById(params.dispatch),
          worker: exposeWorker(worker),
          server: { environmentId: server.environmentId, name: server.name },
          remoteRuntimeEpoch: remote.runtimeEpoch,
          terminal: remote.terminal,
          observation: {
            ...remote.observation,
            // Legacy servers published `running`; normalize at the compatibility boundary.
            status: remote.observation.status === 'running' ? 'live' : remote.observation.status
          }
        }
      }
      if (!worker) {
        return showContextOnlyWorker(runtime, db, dispatch)
      }
      if (worker.runtime_epoch && worker.runtime_epoch !== runtime.getRuntimeId()) {
        if (worker.state === 'starting') {
          worker = db.markWorkerStartUnknown(
            params.dispatch,
            worker.stage,
            'The runtime restarted before worker-start reached a terminal receipt.'
          )
        } else if (worker.state === 'stopping') {
          worker = db.markWorkerStopUnknown(
            params.dispatch,
            'The runtime restarted before worker-stop reached a terminal receipt.'
          )
        }
      }
      const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
      const resource = db.getWorkerTerminalResourceByOwner(params.dispatch)
      return {
        dispatch,
        worker: exposeWorker(worker),
        terminal: observation.exact ? observation.terminal : null,
        observation: {
          status: observation.status,
          exactWorker: observation.exact,
          // Why: a bare `unverifiable` is not actionable without naming what we lost.
          ...(observation.reason ? { reason: observation.reason } : {}),
          // Why conditional: a present null must mean "looked, nothing waiting". An
          // unattached, missing or identity-changed worker was never looked at, and saying
          // null there is the false negative this field exists to remove.
          ...(observation.agentWait !== undefined ? { agentWait: observation.agentWait } : {})
        },
        terminalResource: resource ? exposeWorkerTerminalResource(resource) : null
      }
    }
  }),
  defineMethod({
    name: 'orchestration.workerRead',
    params: WorkerReadParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const federated = db.getFederatedDispatch(params.dispatch)
      if (federated) {
        return readFederatedWorkerOutput({ runtime, db, federated, params })
      }
      const dispatch = db.getDispatchContextById(params.dispatch)
      const worker = db.getWorkerDispatch(params.dispatch)
      const terminalHandle = worker?.agent_terminal_handle ?? dispatch?.assignee_handle
      if (!dispatch) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Dispatch ${params.dispatch} was not found.`
        )
      }
      if (!terminalHandle) {
        throw new OrchestrationError(
          'dispatch_not_found',
          `Worker Dispatch ${params.dispatch} has no agent terminal.`
        )
      }
      const resource = db.getWorkerTerminalResourceByOwner(params.dispatch)
      if (resource && ['releasing', 'unknown', 'released'].includes(resource.release_state)) {
        return readArchivedWorkerOutput({
          db,
          dispatchId: params.dispatch,
          workerState: worker?.state ?? 'unsupervised',
          resource,
          source: params.source,
          cursor: params.cursor,
          limit: params.limit
        })
      }
      const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
      if (!observation.exact) {
        throw new OrchestrationError(
          'worker_identity_changed',
          `Worker Dispatch ${params.dispatch} no longer resolves to its exact process.`
        )
      }
      const structured = readStructuredWorkerOutput({
        db,
        dispatchId: params.dispatch,
        workerState: worker?.state ?? 'unsupervised',
        source: params.source,
        cursor: params.cursor,
        limit: params.limit
      })
      if (structured) {
        return structured
      }
      const output = await readExactWorkerOutput({
        runtime,
        dispatchId: params.dispatch,
        terminalHandle,
        workerState: worker?.state ?? 'unsupervised',
        terminalStatus:
          observation.status === 'exited'
            ? 'exited'
            : observation.status === 'unverifiable'
              ? 'unknown'
              : 'running',
        terminalLiveness:
          observation.status === 'unverifiable'
            ? 'unverifiable'
            : observation.status === 'exited'
              ? 'exited'
              : 'live',
        attachedAt: worker?.created_at ?? dispatch.dispatched_at ?? dispatch.created_at,
        source: params.source,
        cursor: params.cursor,
        limit: params.limit
      })
      const afterRead = await inspectWorkerTerminal(runtime, db, params.dispatch)
      if (!afterRead.exact) {
        throw new OrchestrationError(
          'worker_identity_changed',
          `Worker Dispatch ${params.dispatch} changed process while output was read.`
        )
      }
      return output
    }
  }),
  defineMethod({
    name: 'orchestration.workerAbandon',
    params: WorkerDispatchParams,
    handler: (params, { runtime }) => {
      const abandoned = runtime.getOrchestrationDb().abandonWorkerDispatch(params.dispatch)
      if (abandoned.disposition === 'context_only') {
        if (!abandoned.alreadySettled) {
          // Abandon settles the Dispatch, so it owes the same hold release stop and release do.
          // A surviving hold pins the provider child for the life of the app and makes host crash
          // recovery respawn a worker nobody is waiting on.
          releaseStructuredWorkerSession(params.dispatch, runtime)
          runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
        }
        return {
          dispatchId: params.dispatch,
          state: abandoned.state,
          alreadySettled: abandoned.alreadySettled,
          stale: !abandoned.releasedCurrentTask,
          processAction: 'none',
          warning: contextOnlyAbandonWarning(abandoned),
          residualResources: []
        }
      }
      const worker = abandoned.worker
      if (abandoned.disposition === 'abandoned') {
        releaseStructuredWorkerSession(params.dispatch, runtime)
        runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
      }
      return {
        dispatchId: params.dispatch,
        state: worker.state,
        alreadySettled: abandoned.disposition !== 'abandoned',
        stale: abandoned.disposition === 'stale',
        processAction: 'none',
        warning:
          abandoned.disposition === 'stale'
            ? 'The Dispatch is no longer current; no state or process changed.'
            : 'Possibly-live resources were retained; no process was stopped or deleted.',
        residualResources: JSON.parse(worker.residual_resources) as unknown[]
      }
    }
  })
]
