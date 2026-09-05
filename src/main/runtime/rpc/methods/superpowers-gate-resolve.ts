import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requiredStringAllowingEmpty } from '../schemas'
import type {
  SuperpowersGateResolveError,
  SuperpowersGateResolveResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Phone path resolve — result-field errors (§3b PINNED), never throws for the
// taxonomy. Deliberately no run-scope check: the desktop RPC consumer is
// server-trusting and the phone UI enforces gate options. Resolution outside
// gate.options is still accepted here.
export const SUPERPOWERS_GATE_RESOLVE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'superpowers.gateResolve',
    // Why requiredStringAllowingEmpty: rỗng phải map taxonomy (invalid_resolution /
    // gate_not_found) chứ không rơi vào zod validation error chung chung.
    params: z.object({
      gateId: requiredStringAllowingEmpty('Missing gateId'),
      resolution: requiredStringAllowingEmpty('Missing resolution')
    }),
    handler: async (
      params,
      { runtime }
    ): Promise<SuperpowersGateResolveResult | SuperpowersGateResolveError> => {
      const db = runtime.getOrchestrationDb()
      if (!params.gateId.trim()) {
        return { error: 'gate_not_found' }
      }
      if (!params.resolution.trim()) {
        return { error: 'invalid_resolution' }
      }
      const gate = db.getGate(params.gateId)
      if (!gate) {
        return { error: 'gate_not_found' }
      }
      // Conditional UPDATE guarded on status='pending' — a lost race (CLI or a
      // parallel phone call already settled it) lands as gate_not_pending.
      const resolved = db.resolveGateIfPending(params.gateId, params.resolution)
      if (!resolved) {
        return { error: 'gate_not_pending' }
      }
      return { gateId: resolved.id, status: 'resolved', resolution: resolved.resolution ?? '' }
    }
  })
]
