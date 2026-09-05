// Contract-conformance fixtures for FI-308 SF-3 (gate resolve UX + events) — asserted by
// gate-conformance-smoke.test.ts, reused by later SF-3 tasks. Typed against the PINNED
// contract src/shared/superpowers/story-rpc-contract.ts via deep-relative import
// (runtime-safe for Metro: mobile/src/worktree/worktree-host-row-identity.ts precedent).
// Compile-time conformance lives HERE in explicit annotations (mobile tsc excludes
// *.test.ts, so `pnpm typecheck` validates this file, not the test).

import type {
  SuperpowersGateNotificationPayload,
  SuperpowersGateResolveError,
  SuperpowersGateResolveResult,
  SuperpowersStoryDetailResult,
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from '../../../src/shared/superpowers/story-rpc-contract'

const STORY_BRACKET_ID = 'brackets/fi305-superpowers-android.md'
const STORY_WORKTREE_ID = 'wt-fi305-story'
// Stable timestamp so fixture snapshots never drift with Date.now().
const FIXED_EPOCH_MS = 1788566400000

// Wire reality (plan D1/D5): desktop dispatch conditionally spreads storyId/worktreeId —
// when a gate maps to no bracket worktree BOTH keys are LITERALLY ABSENT (both-or-neither,
// src/main/runtime/runtime-gate-transition-notifications.ts). The contract types them
// `string | null` — the post-normalization view; present-as-null is the forward-compat
// shape. `storyId?: never` makes a split shape (one key without the other) a compile error.
// Drift risk: local snapshot of the emission shape — if the desktop dispatch changes,
// update here and the contract together.
export type GateTransitionWirePayload =
  | { gateId: string; title: string; storyId?: never; worktreeId?: never }
  | { gateId: string; title: string; storyId: string; worktreeId: string }

// Plan D5: absent key on the wire ≡ null in the contract — coerce undefined → null so
// 'khác' routing never misroutes on a strict null check. (Full payload parser is T5's
// parse-gate-transition-payload.ts; this helper is its routing-field kernel.)
export function coerceUndefinedToNull(value: string | null | undefined): string | null {
  return value ?? null
}

// --- superpowers.storyList ---

export const storyListItemNormal: SuperpowersStoryListItem = {
  storyId: STORY_BRACKET_ID,
  title: 'FI-305 superpowers android',
  epicId: 'FI-305',
  worktreeId: STORY_WORKTREE_ID,
  workspaceName: 'orca',
  sfTotal: 7,
  sfDone: 1,
  pendingGates: 1,
  updatedAt: FIXED_EPOCH_MS,
  parseError: false
}

export const storyListItemParseError: SuperpowersStoryListItem = {
  storyId: 'brackets/fi999-corrupt.md',
  title: 'fi999-corrupt',
  epicId: 'FI-999',
  worktreeId: null,
  workspaceName: 'orca',
  sfTotal: 0,
  sfDone: 0,
  pendingGates: 0,
  updatedAt: FIXED_EPOCH_MS,
  parseError: true
}

export const storyListResultNormal: SuperpowersStoryListResult = {
  stories: [storyListItemNormal, storyListItemParseError]
}

// --- superpowers.storyDetail ---

export const storyDetailResultNormal: SuperpowersStoryDetailResult = {
  story: {
    storyId: STORY_BRACKET_ID,
    title: 'FI-305 superpowers android',
    epicId: 'FI-305',
    destination: 'story/fi305-superpowers-android',
    worktreeId: STORY_WORKTREE_ID,
    workspaceName: 'orca',
    parseError: false,
    sfs: [
      {
        name: 'SF-1',
        title: 'Contract + resolve backend (desktop)',
        tier: 1,
        what: 'Shared RPC contract + gateResolve pending guard',
        dependsOn: [],
        linear: 'FI-306',
        status: 'unknown'
      }
    ]
  },
  gates: [
    {
      gateId: 'gate-fi305-approve-sf1',
      title: 'Approve SF-1 contract snapshot',
      status: 'pending',
      resolution: null,
      options: ['approve', 'reject'],
      worktreeId: STORY_WORKTREE_ID,
      createdAt: FIXED_EPOCH_MS,
      storyLinked: true
    },
    {
      // 'khác' group: detail only returns non-story-linked gates with worktreeId null
      // (superpowers-story-detail.ts membership rule).
      gateId: 'gate-fi305-khac-freetext',
      title: 'Pick deploy window for story sync',
      status: 'pending',
      resolution: null,
      options: [],
      worktreeId: null,
      createdAt: FIXED_EPOCH_MS,
      storyLinked: false
    },
    {
      gateId: 'gate-fi305-timeout-forcepush',
      title: 'Confirm force-push to destination',
      status: 'timeout',
      resolution: null,
      options: ['allow', 'deny'],
      worktreeId: STORY_WORKTREE_ID,
      createdAt: FIXED_EPOCH_MS,
      storyLinked: true
    }
  ]
}

// --- superpowers.gateResolve ---

export const gateResolveSuccess: SuperpowersGateResolveResult = {
  gateId: 'gate-fi305-approve-sf1',
  status: 'resolved',
  resolution: 'approve'
}

export const gateResolveErrorGateNotFound: SuperpowersGateResolveError = { error: 'gate_not_found' }
export const gateResolveErrorGateNotPending: SuperpowersGateResolveError = {
  error: 'gate_not_pending'
}
export const gateResolveErrorInvalidResolution: SuperpowersGateResolveError = {
  error: 'invalid_resolution'
}

// Plan D11: taxonomy errors arrive INSIDE the success envelope — client reads result.error.
export const gateResolveErrorUnion: SuperpowersGateResolveError[] = [
  gateResolveErrorGateNotFound,
  gateResolveErrorGateNotPending,
  gateResolveErrorInvalidResolution
]

// --- notifications 'gate-open' / 'gate-closed' ---

export const gateOpenStoryLinked: SuperpowersGateNotificationPayload = {
  gateId: 'gate-fi305-approve-sf1',
  storyId: STORY_BRACKET_ID,
  worktreeId: STORY_WORKTREE_ID,
  title: 'Approve SF-1 contract snapshot'
}

export const gateClosedStoryLinked: SuperpowersGateNotificationPayload = {
  gateId: 'gate-fi305-approve-sf1',
  storyId: STORY_BRACKET_ID,
  worktreeId: STORY_WORKTREE_ID,
  title: 'Approve SF-1 contract snapshot'
}

export const gateOpenRoutingAbsent: GateTransitionWirePayload = {
  gateId: 'gate-fi305-khac-freetext',
  title: 'Pick deploy window for story sync'
}

export const gateClosedRoutingAbsent: GateTransitionWirePayload = {
  gateId: 'gate-fi305-khac-freetext',
  title: 'Pick deploy window for story sync'
}

export const gateOpenRoutingNull: SuperpowersGateNotificationPayload = {
  gateId: 'gate-fi305-khac-null-shape',
  storyId: null,
  worktreeId: null,
  title: 'Pick deploy window for story sync'
}

export const gateClosedRoutingNull: SuperpowersGateNotificationPayload = {
  gateId: 'gate-fi305-khac-null-shape',
  storyId: null,
  worktreeId: null,
  title: 'Pick deploy window for story sync'
}
