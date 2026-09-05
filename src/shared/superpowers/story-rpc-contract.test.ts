import { describe, expect, it } from 'vitest'

import type {
  SuperpowersGateNotificationPayload,
  SuperpowersGateResolveError,
  SuperpowersGateResolveResult,
  SuperpowersSfStatus,
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult,
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from './story-rpc-contract'

// Compile-check samples: each literal must satisfy its contract type exactly.
const _listItem: SuperpowersStoryListItem = {
  storyId: 'brackets/fi305-superpowers-android.md',
  title: 'superpowers on Android',
  epicId: 'FI-305',
  worktreeId: null,
  workspaceName: 'fi305-android',
  sfTotal: 4,
  sfDone: 1,
  pendingGates: 2,
  updatedAt: 1725400000000,
  parseError: false
}

const _listResult: SuperpowersStoryListResult = { stories: [_listItem] }

const _detailResult: SuperpowersStoryDetailResult = {
  story: {
    storyId: 'brackets/fi305-superpowers-android.md',
    title: 'superpowers on Android',
    epicId: 'FI-305',
    destination: 'main',
    worktreeId: 'wt_1',
    workspaceName: 'fi305-android',
    parseError: false,
    sfs: [
      {
        name: 'SF-1',
        title: 'desktop RPC',
        tier: 1,
        what: 'build 3 RPC methods',
        dependsOn: [],
        linear: 'FI-306',
        status: 'unknown'
      }
    ]
  },
  gates: [
    {
      gateId: 'gate_1',
      title: 'approve spec?',
      status: 'pending',
      resolution: null,
      options: ['approve', 'reject'],
      worktreeId: null,
      createdAt: 1725400000000,
      storyLinked: true
    }
  ]
}

const _detailError: SuperpowersStoryDetailError = { error: 'story_not_found' }

const _resolveResult: SuperpowersGateResolveResult = {
  gateId: 'gate_1',
  status: 'resolved',
  resolution: 'approve'
}

const _resolveErrors: SuperpowersGateResolveError[] = [
  { error: 'gate_not_found' },
  { error: 'gate_not_pending' },
  { error: 'invalid_resolution' }
]

const _statuses: SuperpowersSfStatus[] = ['todo', 'in-progress', 'done', 'unknown']

const _notificationPayload: SuperpowersGateNotificationPayload = {
  gateId: 'gate_1',
  storyId: null,
  worktreeId: 'wt_1',
  title: 'approve spec?'
}

// Type-level disjointness: error types must not be assignable to success types, either direction.
// Each element is `true` only when the direction is NOT assignable; a false element fails compile.
type _DetailErrNotResult = SuperpowersStoryDetailError extends SuperpowersStoryDetailResult
  ? false
  : true
type _ResolveErrNotResult = SuperpowersGateResolveError extends SuperpowersGateResolveResult
  ? false
  : true
type _ResolveResultNotErr = SuperpowersGateResolveResult extends SuperpowersGateResolveError
  ? false
  : true
const _disjoint: [_DetailErrNotResult, _ResolveErrNotResult, _ResolveResultNotErr] = [
  true,
  true,
  true
]

describe('story RPC contract shapes', () => {
  it('sample literals satisfy every exported type (compile-checked above)', () => {
    expect(_listItem.storyId).toBeTypeOf('string')
    expect(_listResult.stories).toHaveLength(1)
    expect(_detailResult.story.sfs).toHaveLength(1)
    expect(_resolveResult.status).toBe('resolved')
    expect(_resolveErrors).toHaveLength(3)
    expect(_statuses).toContain('unknown')
    expect(_notificationPayload.storyId).toBeNull()
  })

  it('error shapes are distinct from success shapes', () => {
    const successShapes = [_listResult, _detailResult, _resolveResult] as (
      | SuperpowersStoryListResult
      | SuperpowersStoryDetailResult
      | SuperpowersGateResolveResult
    )[]
    const errorShapes = [_detailError, ..._resolveErrors] as (
      | SuperpowersStoryDetailError
      | SuperpowersGateResolveError
    )[]

    for (const shape of successShapes) {
      expect('error' in shape).toBe(false)
    }
    for (const shape of errorShapes) {
      expect('error' in shape).toBe(true)
      expect(typeof shape.error).toBe('string')
    }

    const errorCodes = new Set(errorShapes.map((s) => s.error))
    expect(errorCodes.size).toBe(errorShapes.length)
    expect(_disjoint).toEqual([true, true, true])
  })
})
