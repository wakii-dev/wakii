// Resolve write (plan D4/D11): plain sendRequest — single-flight coalesces a second
// trigger into `followUp.params` and delivers the newest result to older callers,
// so a gate write must never share an in-flight call. Taxonomy errors arrive
// INSIDE the success envelope ({ok:true, result:{error:code}}); ok:false is a
// transport-class failure (zod/auth/unknown-method), never a taxonomy code.
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'

// Pinned budget so a lost response can never strand the submitting spinner.
const GATE_RESOLVE_TIMEOUT_MS = 15_000

export type GateResolveOutcome =
  | { kind: 'success'; gateId: string; resolution: string }
  // Raw code — unknown codes pass through for T4's forward-compat mapping (D11).
  | { kind: 'taxonomy'; code: string }
  | { kind: 'request-failed' }

export function parseGateResolveResponse(response: RpcResponse): GateResolveOutcome {
  if (!response.ok) {
    return { kind: 'request-failed' }
  }
  const result: unknown = response.result
  if (typeof result !== 'object' || result === null) {
    return { kind: 'request-failed' }
  }
  const record = result as Record<string, unknown>
  if (typeof record.error === 'string') {
    return { kind: 'taxonomy', code: record.error }
  }
  if (record.status === 'resolved' && typeof record.gateId === 'string') {
    return {
      kind: 'success',
      gateId: record.gateId,
      resolution: typeof record.resolution === 'string' ? record.resolution : ''
    }
  }
  return { kind: 'request-failed' }
}

export async function submitGateResolveRequest(
  client: RpcClient,
  gateId: string,
  resolution: string
): Promise<GateResolveOutcome> {
  let response: RpcResponse
  try {
    response = await client.sendRequest(
      'superpowers.gateResolve',
      { gateId, resolution },
      { timeoutMs: GATE_RESOLVE_TIMEOUT_MS }
    )
  } catch {
    // Timeout / socket death — a transport-class failure, never throws out.
    return { kind: 'request-failed' }
  }
  return parseGateResolveResponse(response)
}
