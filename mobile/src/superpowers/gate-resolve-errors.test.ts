// T4 mapping unit tests: every taxonomy code (from the T1 fixtures, through the
// real D11 parser) maps to its user-visible state — copy, tone, store side-effect,
// and sweep trigger. A4's benign-race guarantee lives here: gate_not_pending is
// neutral info with removal + refresh, never an error treatment, never a retry.
import { describe, expect, it } from 'vitest'
import type { RpcResponse } from '../transport/types'
import {
  gateResolveErrorGateNotFound,
  gateResolveErrorGateNotPending,
  gateResolveErrorInvalidResolution
} from './gate-conformance-fixtures'
import { gateResolveErrorHandling } from './gate-resolve-errors'
import { parseGateResolveResponse } from './gate-resolve-request'

const OK_ENVELOPE = (result: unknown): RpcResponse => ({
  id: 'r1',
  ok: true,
  result,
  _meta: { runtimeId: 'r' }
})

const handlingFor = (result: unknown) =>
  gateResolveErrorHandling(parseGateResolveResponse(OK_ENVELOPE(result)))

describe('gateResolveErrorHandling', () => {
  it('gate_not_found → remove + refresh with neutral info copy', () => {
    expect(handlingFor(gateResolveErrorGateNotFound)).toEqual({
      message: 'This gate no longer exists on the desktop.',
      tone: 'info',
      removeGate: true,
      refreshAfter: true
    })
  })

  it('gate_not_pending → remove + refresh, neutral info (benign race, never an error treatment)', () => {
    expect(handlingFor(gateResolveErrorGateNotPending)).toEqual({
      message: 'This gate was already handled elsewhere.',
      tone: 'info',
      removeGate: true,
      refreshAfter: true
    })
  })

  it('invalid_resolution → recoverable copy, sheet-state preserved: no remove, no refresh', () => {
    expect(handlingFor(gateResolveErrorInvalidResolution)).toEqual({
      message: 'The desktop rejected this resolution — edit it and try again.',
      tone: 'warning',
      removeGate: false,
      refreshAfter: false
    })
  })

  it('unknown taxonomy code → generic info + refresh (D11 forward-compat)', () => {
    expect(handlingFor({ error: 'gate_reborn_v9' })).toEqual({
      message: 'The desktop reported an unknown gate error — refreshing for the latest state.',
      tone: 'info',
      removeGate: false,
      refreshAfter: true
    })
  })

  it('request-failure → stale-state copy, no remove, no auto sweep (recovery = re-tap / pull-to-refresh)', () => {
    expect(gateResolveErrorHandling({ kind: 'request-failed' })).toEqual({
      message: 'Resolve failed — check the connection and retry.',
      tone: 'warning',
      removeGate: false,
      refreshAfter: false
    })
  })
})
