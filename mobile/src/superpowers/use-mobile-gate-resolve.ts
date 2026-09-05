import { useCallback, useRef } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { submitGateResolveRequest, type GateResolveOutcome } from './gate-resolve-request'
import { removePendingGate } from './pending-gates-store'

// Resolve hook (plan T3): submittingRef guard per gateId blocks a double-tap at the
// UI level (the disabled buttons are the first line; this is the backstop that can't
// lose a race against React commits). Success removes the gate from the per-host
// store; taxonomy/request failures return the raw outcome — T4 owns the mapping UX.
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
        if (outcome.kind === 'success') {
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
