import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requiredStringAllowingEmpty } from '../schemas'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import type {
  SuperpowersGateResolveError,
  SuperpowersGateResolveResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Phone path resolve — result-field errors (§3b PINNED — updated GH-40), never
// throws for the taxonomy. Deliberately no run-scope check: the desktop RPC
// consumer is server-trusting. MIGRATION from the earlier "server-trusting,
// any resolution accepted" contract: the store now THROWS
// OrchestrationError('resolution_not_in_options') when gate.options is
// non-empty and the resolution is outside it (GH-40); this handler catches
// that throw and maps it to the taxonomy result-field { error:
// 'invalid_resolution' } — the rejection never crosses RPC as a generic error.
// Options-empty gates keep accepting any resolution (conformance phone path).
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
      // The store throws resolution_not_in_options on a bad resolution (GH-40);
      // map it into the §3b taxonomy instead of throwing across RPC.
      let resolved
      try {
        resolved = db.resolveGateIfPending(params.gateId, params.resolution)
      } catch (error) {
        if (
          error instanceof OrchestrationError &&
          error.code === 'resolution_not_in_options'
        ) {
          return { error: 'invalid_resolution' }
        }
        throw error
      }
      if (!resolved) {
        return { error: 'gate_not_pending' }
      }
      return { gateId: resolved.id, status: 'resolved', resolution: resolved.resolution ?? '' }
    }
  })
]
