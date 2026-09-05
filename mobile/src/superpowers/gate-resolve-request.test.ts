// Envelope tests for the resolve write (plan D4/D11): taxonomy errors read from
// result.error inside the SUCCESS envelope; ok:false and transport rejections are
// request-failures, never taxonomy codes. Reuses the T1 contract fixtures.
import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import {
  gateResolveErrorGateNotFound,
  gateResolveErrorGateNotPending,
  gateResolveErrorInvalidResolution,
  gateResolveSuccess
} from './gate-conformance-fixtures'
import { parseGateResolveResponse, submitGateResolveRequest } from './gate-resolve-request'

const OK_ENVELOPE = (result: unknown): RpcResponse => ({
  id: 'r1',
  ok: true,
  result,
  _meta: { runtimeId: 'runtime-1' }
})
const FAILURE_ENVELOPE: RpcResponse = {
  id: 'r2',
  ok: false,
  error: { code: 'method_not_found', message: 'Unknown method: superpowers.gateResolve' },
  _meta: { runtimeId: 'runtime-1' }
}

describe('parseGateResolveResponse', () => {
  it('maps the success fixture to a success outcome', () => {
    expect(parseGateResolveResponse(OK_ENVELOPE(gateResolveSuccess))).toEqual({
      kind: 'success',
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
  })

  it('maps every taxonomy fixture code out of the success envelope', () => {
    for (const fixture of [
      gateResolveErrorGateNotFound,
      gateResolveErrorGateNotPending,
      gateResolveErrorInvalidResolution
    ]) {
      expect(parseGateResolveResponse(OK_ENVELOPE(fixture))).toEqual({
        kind: 'taxonomy',
        code: fixture.error
      })
    }
  })

  it('passes unknown taxonomy codes through for forward-compat mapping', () => {
    expect(parseGateResolveResponse(OK_ENVELOPE({ error: 'gate_future_code' }))).toEqual({
      kind: 'taxonomy',
      code: 'gate_future_code'
    })
  })

  it('maps an ok:false envelope to request-failed, not a taxonomy code', () => {
    expect(parseGateResolveResponse(FAILURE_ENVELOPE)).toEqual({ kind: 'request-failed' })
  })

  it('maps malformed success payloads to request-failed', () => {
    expect(parseGateResolveResponse(OK_ENVELOPE(null))).toEqual({ kind: 'request-failed' })
    expect(parseGateResolveResponse(OK_ENVELOPE('nope'))).toEqual({ kind: 'request-failed' })
    expect(parseGateResolveResponse(OK_ENVELOPE({ status: 'pending' }))).toEqual({
      kind: 'request-failed'
    })
  })
})

describe('submitGateResolveRequest', () => {
  function scriptedClient(
    respond: (method: string, params: unknown, options: unknown) => Promise<RpcResponse>
  ): RpcClient {
    return {
      sendRequest: vi.fn(respond)
    } as unknown as RpcClient
  }

  it('sends the pinned method with gateId/resolution params and a 15s timeout', async () => {
    const sendRequest = vi.fn(() => Promise.resolve(OK_ENVELOPE(gateResolveSuccess)))
    const client = { sendRequest } as unknown as RpcClient

    const outcome = await submitGateResolveRequest(client, 'gate-1', 'approve')

    expect(outcome).toEqual({
      kind: 'success',
      gateId: 'gate-fi305-approve-sf1',
      resolution: 'approve'
    })
    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(sendRequest).toHaveBeenCalledWith(
      'superpowers.gateResolve',
      { gateId: 'gate-1', resolution: 'approve' },
      { timeoutMs: 15_000 }
    )
  })

  it('collapses a transport rejection (timeout/socket) into request-failed', async () => {
    const client = scriptedClient(() => Promise.reject(new Error('timeout')))

    await expect(submitGateResolveRequest(client, 'gate-1', 'approve')).resolves.toEqual({
      kind: 'request-failed'
    })
  })

  it('maps an ok:false response to request-failed without throwing', async () => {
    const client = scriptedClient(() => Promise.resolve(FAILURE_ENVELOPE))

    await expect(submitGateResolveRequest(client, 'gate-1', 'approve')).resolves.toEqual({
      kind: 'request-failed'
    })
  })
})
