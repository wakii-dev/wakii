import { useCallback, useRef } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { gateResolveErrorHandling } from './gate-resolve-errors'
import { submitGateResolveRequest, type GateResolveOutcome } from './gate-resolve-request'
import { removePendingGate } from './pending-gates-store'

// Resolve hook (plan T3/D4): submittingRef guard per gateId blocks a double-tap at the
// UI level (the disabled buttons are the first line; this is the backstop that can't
// lose a race against React commits). Success and settled-elsewhere taxonomy races
// remove the gate from the per-host store (T4 mapping); the raw outcome is returned
// for the presentation layer.
export function useMobileGateResolve(params: { hostId: string; client: RpcClient | null }): {
  submitGateResolution: (gateId: string, resolution: string) => Promise<GateResolveOutcome | null>
} {
  const { hostId, client } = params
  const clientRef = useRef(client)
  clientRef.current = client
  const inFlightGateIdsRef = useRef(new Set<string>())

  const submitGateResolution = useCallback(
    async (gateId: string, resolution: string): Promise<GateResolveOutcome | null> => {
      const current = clientRef.current
      if (!current || inFlightGateIdsRef.current.has(gateId)) {
        return null
      }
      inFlightGateIdsRef.current.add(gateId)
      try {
        const outcome = await submitGateResolveRequest(current, gateId, resolution)
        if (outcome.kind === 'success' || gateResolveErrorHandling(outcome).removeGate) {
          removePendingGate(hostId, gateId)
        }
        return outcome
      } finally {
        inFlightGateIdsRef.current.delete(gateId)
      }
    },
    [hostId]
  )

  return { submitGateResolution }
}
