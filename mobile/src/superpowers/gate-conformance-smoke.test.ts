// Conformance smoke: runtime invariants over the SF-3 fixture set (T3-T7 reuse the same
// fixtures). Compile-time conformance is enforced by the explicit contract-type
// annotations in gate-conformance-fixtures.ts — mobile `pnpm typecheck` (tsc) excludes
// *.test.ts, so the fixtures file is the typechecked artifact.
import { describe, expect, it } from 'vitest'

import {
  coerceUndefinedToNull,
  gateClosedRoutingAbsent,
  gateClosedRoutingNull,
  gateClosedStoryLinked,
  gateOpenRoutingAbsent,
  gateOpenRoutingNull,
  gateOpenStoryLinked,
  gateResolveErrorUnion,
  gateResolveSuccess,
  storyDetailResultNormal,
  storyListItemNormal,
  storyListItemParseError,
  storyListResultNormal
} from './gate-conformance-fixtures'

function expectNonEmptyText(value: unknown, label: string): void {
  expect(typeof value, label).toBe('string')
  expect((value as string).trim().length, label).toBeGreaterThan(0)
}

describe('gate conformance fixtures — contract invariants', () => {
  it('every gate object carries non-empty gateId and title', () => {
    const gates = [
      ...storyDetailResultNormal.gates,
      gateOpenStoryLinked,
      gateClosedStoryLinked,
      gateOpenRoutingAbsent,
      gateClosedRoutingAbsent,
      gateOpenRoutingNull,
      gateClosedRoutingNull
    ]
    for (const gate of gates) {
      expectNonEmptyText(gate.gateId, 'gateId')
      expectNonEmptyText(gate.title, 'title')
    }
  })

  it('resolve error union covers exactly the 3 pinned codes, each shape-pure', () => {
    const codes = gateResolveErrorUnion.map((entry) => entry.error).sort()
    expect(codes).toEqual(['gate_not_found', 'gate_not_pending', 'invalid_resolution'])
    for (const entry of gateResolveErrorUnion) {
      expect(Object.keys(entry).sort()).toEqual(['error'])
    }
  })

  it('resolve success carries resolved status + non-empty resolution for a known gate', () => {
    expect(gateResolveSuccess.status).toBe('resolved')
    expectNonEmptyText(gateResolveSuccess.resolution, 'resolution')
    expectNonEmptyText(gateResolveSuccess.gateId, 'gateId')
    expect(
      storyDetailResultNormal.gates.some((gate) => gate.gateId === gateResolveSuccess.gateId)
    ).toBe(true)
  })

  it('storyDetail gates cover the pinned variants (storyLinked both, empty options, timeout+null resolution)', () => {
    expect(storyDetailResultNormal.gates.length).toBeGreaterThan(0)
    for (const gate of storyDetailResultNormal.gates) {
      expect(Array.isArray(gate.options)).toBe(true)
      expect(typeof gate.storyLinked).toBe('boolean')
      expect(['pending', 'resolved', 'timeout']).toContain(gate.status)
      expect(gate.resolution === null || typeof gate.resolution === 'string').toBe(true)
      // Membership rule (plan D1): non-story-linked detail gates are worktreeId-null 'khác'.
      if (!gate.storyLinked) {
        expect(gate.worktreeId).toBeNull()
      }
    }
    expect(storyDetailResultNormal.gates.some((gate) => gate.storyLinked)).toBe(true)
    expect(storyDetailResultNormal.gates.some((gate) => !gate.storyLinked)).toBe(true)
    expect(storyDetailResultNormal.gates.some((gate) => gate.options.length === 0)).toBe(true)
    const timeout = storyDetailResultNormal.gates.find((gate) => gate.status === 'timeout')
    expect(timeout).toBeDefined()
    expect(timeout?.resolution).toBeNull()
  })

  it('storyDetail story block carries identity fields', () => {
    const { story } = storyDetailResultNormal
    expectNonEmptyText(story.storyId, 'storyId')
    expectNonEmptyText(story.title, 'title')
    expectNonEmptyText(story.epicId, 'epicId')
    expect(Array.isArray(story.sfs)).toBe(true)
  })

  it('storyList items cover normal + parseError variants', () => {
    expect(storyListItemNormal.parseError).toBe(false)
    expect(typeof storyListItemNormal.worktreeId).toBe('string')
    expect(storyListItemParseError.parseError).toBe(true)
    expect(storyListItemParseError.worktreeId).toBeNull()
    expect(storyListResultNormal.stories).toContainEqual(storyListItemNormal)
    expect(storyListResultNormal.stories).toContainEqual(storyListItemParseError)
  })

  it('absent-key variant LITERALLY omits both routing keys (plan D5 — load-bearing)', () => {
    for (const payload of [gateOpenRoutingAbsent, gateClosedRoutingAbsent]) {
      expect('storyId' in payload).toBe(false)
      expect('worktreeId' in payload).toBe(false)
    }
  })

  it('present-null variant carries both keys, valued null (forward-compat)', () => {
    for (const payload of [gateOpenRoutingNull, gateClosedRoutingNull]) {
      expect(Object.hasOwn(payload, 'storyId')).toBe(true)
      expect(Object.hasOwn(payload, 'worktreeId')).toBe(true)
      expect(payload.storyId).toBeNull()
      expect(payload.worktreeId).toBeNull()
    }
  })

  it('story-linked variant carries both keys as non-null strings (both-or-neither)', () => {
    for (const payload of [gateOpenStoryLinked, gateClosedStoryLinked]) {
      expect(typeof payload.storyId).toBe('string')
      expect(typeof payload.worktreeId).toBe('string')
      expect(payload.storyId.length).toBeGreaterThan(0)
      expect(payload.worktreeId.length).toBeGreaterThan(0)
    }
  })

  it('coerceUndefinedToNull makes absent and present-null variants converge', () => {
    expect(coerceUndefinedToNull(undefined)).toBeNull()
    expect(coerceUndefinedToNull(null)).toBeNull()
    expect(coerceUndefinedToNull('wt-x')).toBe('wt-x')

    const pairs = [
      [gateOpenRoutingAbsent, gateOpenRoutingNull],
      [gateClosedRoutingAbsent, gateClosedRoutingNull]
    ] as const
    for (const [absent, nullable] of pairs) {
      expect(coerceUndefinedToNull(absent.storyId)).toBe(nullable.storyId)
      expect(coerceUndefinedToNull(absent.worktreeId)).toBe(nullable.worktreeId)
    }
  })
})
