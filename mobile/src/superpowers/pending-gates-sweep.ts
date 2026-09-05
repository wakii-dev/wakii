// Authoritative sweep (plan D1): storyList → storyDetail for EVERY story with
// pendingGates > 0, merged into the store (gateId dedup — 'khác' gates repeat in
// every detail response). Probe rule: no story pendingGates>0 but a non-empty list
// → detail the newest story once, recovering 'khác' gates on an idle host. A host
// with zero stories is a legitimate empty sweep — overlay-only rows survive it.
// Failures never throw out: request/transport errors mark the host unavailable.
//
// Old-host probe (finding): a pre-SF-1 desktop answers superpowers.* with a
// RESOLVED failure envelope — { ok: false, error: { code: 'method_not_found',
// message: 'Unknown method: superpowers.storyList' } } (src/main/runtime/rpc/
// dispatcher.ts:59-66) — NOT a transport throw. Unavailable-marking keys off
// response.ok first; a throw means socket death/timeout and lands in the same
// unavailable state.

import type { RpcClient } from '../transport/rpc-client'
import { sendSingleFlightRequest } from '../transport/request-single-flight'
import { isLogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import type { RpcResponse } from '../transport/types'
import type {
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult,
  SuperpowersStoryListResult
} from '../../../src/shared/superpowers/story-rpc-contract'
import {
  markPendingGatesUnavailable,
  reconcileSweepResult,
  type PendingGatesSweepResponse
} from './pending-gates-store'

// Why: a relay↔direct cutover rejects in-flight reads without ever leaving
// 'connected', so the connect gate never re-arms. Re-issue on the replacement
// session, capped (home-host-worktree-fetch precedent).
const CUTOVER_RETRY_LIMIT = 2

const STORY_LIST_KIND = 'superpowers.storyList'
// Plain wire method: the desktop dispatcher is exact-match, so the story id must ride in
// params — a colon-suffixed method 404s (method_not_found) on every real desktop.
const STORY_DETAIL_METHOD = 'superpowers.storyDetail'

// Per-story in-flight coalescing (storyDetail only — request-single-flight's coalescing
// key doubles as its wire method, which is exactly what broke here). Keyed host+story so
// concurrent sweeps for the same story share one wire request; different stories/hosts
// never share results.
const storyDetailInFlight = new Map<string, Promise<RpcResponse>>()

function sendStoryDetail(deps: PendingGatesSweepDeps, storyId: string): Promise<RpcResponse> {
  const key = `${deps.hostId}\u0000${storyId}`
  const inFlight = storyDetailInFlight.get(key)
  if (inFlight) {
    return inFlight
  }
  const request = (
    deps.send
      ? deps.send(deps.client, deps.hostId, STORY_DETAIL_METHOD, { storyId })
      : deps.client.sendRequest(STORY_DETAIL_METHOD, { storyId })
  ).finally(() => {
    if (storyDetailInFlight.get(key) === request) {
      storyDetailInFlight.delete(key)
    }
  })
  storyDetailInFlight.set(key, request)
  return request
}

export type PendingGatesSweepSender = (
  client: RpcClient,
  hostId: string,
  method: string,
  params?: unknown
) => Promise<RpcResponse>

export type PendingGatesSweepDeps = {
  client: RpcClient
  hostId: string
  send?: PendingGatesSweepSender
}

async function attemptWithCutoverRetry(run: () => Promise<RpcResponse>): Promise<RpcResponse> {
  let retriesLeft = CUTOVER_RETRY_LIMIT
  for (;;) {
    try {
      return await run()
    } catch (error) {
      if (retriesLeft > 0 && isLogicalClientCutoverError(error)) {
        retriesLeft -= 1
        continue
      }
      throw error
    }
  }
}

/** Sweeps one host's pending gates into the store; resolves without throwing — any
 *  failure marks the host unavailable instead. */
export async function runPendingGatesSweep(deps: PendingGatesSweepDeps): Promise<void> {
  const send = deps.send ?? sendSingleFlightRequest

  let listResponse: RpcResponse
  try {
    listResponse = await attemptWithCutoverRetry(() =>
      send(deps.client, deps.hostId, STORY_LIST_KIND)
    )
  } catch {
    markPendingGatesUnavailable(deps.hostId, true)
    return
  }
  // Includes the pre-SF-1 'method_not_found' envelope — see probe finding above.
  if (!listResponse.ok) {
    markPendingGatesUnavailable(deps.hostId, true)
    return
  }
  const list = listResponse.result as SuperpowersStoryListResult
  const stories = Array.isArray(list.stories) ? list.stories : []

  const withPending = stories.filter((story) => story.pendingGates > 0)
  const targets =
    withPending.length > 0
      ? withPending
      : stories.length > 0
        ? [stories.reduce((newest, story) => (story.updatedAt > newest.updatedAt ? story : newest))]
        : []

  // All-or-nothing: a partial merge must not read as a complete sweep, so any
  // detail failure marks unavailable and skips reconcile entirely.
  const responses: PendingGatesSweepResponse[] = []
  for (const story of targets) {
    let detailResponse: RpcResponse
    try {
      detailResponse = await attemptWithCutoverRetry(() => sendStoryDetail(deps, story.storyId))
    } catch {
      markPendingGatesUnavailable(deps.hostId, true)
      return
    }
    if (!detailResponse.ok) {
      markPendingGatesUnavailable(deps.hostId, true)
      return
    }
    const detail = detailResponse.result as
      | SuperpowersStoryDetailResult
      | SuperpowersStoryDetailError
    if ('error' in detail) {
      // story_not_found (bracket vanished mid-sweep) — skip this story, keep the rest.
      continue
    }
    responses.push({
      storyId: detail.story.storyId,
      storyTitle: detail.story.title,
      gates: detail.gates
    })
  }
  reconcileSweepResult(deps.hostId, responses)
}
