// T4 mapping (plan D7/D11): taxonomy codes ride INSIDE the success envelope
// (gate-resolve-request parses them raw) — this turns each outcome into the
// user-visible state: copy, tone, and the store/sweep side effects. Benign races
// (gate_not_pending) are neutral info, never an error treatment. Nothing here
// retries the write — re-tap is the retry, and the server's pending guard makes
// it safe (a lost race has no side effect).
import type { GateResolveOutcome } from './gate-resolve-request'

export type GateResolveErrorTone = 'info' | 'warning'

export type GateResolveErrorHandling = {
  message: string
  tone: GateResolveErrorTone
  // Drop the row from the per-host store (the server already settled it).
  removeGate: boolean
  // Run one background sweep so the list reflects server truth.
  refreshAfter: boolean
}

// Not swept: the transport state is unknown, so an immediate sweep would fail
// (and mis-flag the host unavailable) — the stale banner + pull-to-refresh is
// the recovery path; reconnect re-sweeps (T6).
const REQUEST_FAILED: GateResolveErrorHandling = {
  message: 'Resolve failed — check the connection and retry.',
  tone: 'warning',
  removeGate: false,
  refreshAfter: false
}

export function gateResolveErrorHandling(outcome: GateResolveOutcome): GateResolveErrorHandling {
  switch (outcome.kind) {
    case 'request-failed':
      return REQUEST_FAILED
    case 'taxonomy':
      switch (outcome.code) {
        case 'gate_not_found':
          return {
            message: 'This gate no longer exists on the desktop.',
            tone: 'info',
            removeGate: true,
            refreshAfter: true
          }
        case 'gate_not_pending':
          return {
            message: 'This gate was already handled elsewhere.',
            tone: 'info',
            removeGate: true,
            refreshAfter: true
          }
        // Can't happen through this UI (empty/whitespace is blocked in the sheet)
        // — defense-in-depth: recoverable copy, sheet stays open with editable text.
        case 'invalid_resolution':
          return {
            message: 'The desktop rejected this resolution — edit it and try again.',
            tone: 'warning',
            removeGate: false,
            refreshAfter: false
          }
        default:
          // Forward-compat (D11): newer desktops may add codes — generic copy + sweep.
          return {
            message:
              'The desktop reported an unknown gate error — refreshing for the latest state.',
            tone: 'info',
            removeGate: false,
            refreshAfter: true
          }
      }
    case 'success':
      // Callers handle success before mapping.
      return { message: '', tone: 'info', removeGate: false, refreshAfter: false }
  }
}
