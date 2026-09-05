import { describe, expect, it } from 'vitest'
import type {
  SuperpowersSfStatus,
  SuperpowersStoryDetailResult,
  SuperpowersStoryDetailSf,
  SuperpowersStoryListItem
} from '../../../src/shared/superpowers/story-rpc-contract'
import {
  storyDetailHappyPath,
  storyDetailNotFound,
  storyListHappyPath,
  storyListItemParseError,
  storyListWithParseError
} from './story-rpc-fixtures'

// Contract không export type alias cho gates — trích từ Result qua indexed access.
type StoryDetailGate = SuperpowersStoryDetailResult['gates'][number]
type GateStatus = StoryDetailGate['status']

const SF_STATUSES: readonly SuperpowersSfStatus[] = ['todo', 'in-progress', 'done', 'unknown']
const GATE_STATUSES: readonly GateStatus[] = ['pending', 'resolved', 'timeout']

// JSON round-trip = wire decode: mọi response RPC đi qua JSON codec, fixture phải sống sót.
function fromWire<T>(fixture: T): T {
  return JSON.parse(JSON.stringify(fixture)) as T
}

function expectStoryListItemShape(row: SuperpowersStoryListItem): void {
  expect(typeof row.storyId).toBe('string')
  expect(typeof row.title).toBe('string')
  expect(typeof row.epicId).toBe('string')
  expect(row.worktreeId === null || typeof row.worktreeId === 'string').toBe(true)
  expect(typeof row.workspaceName).toBe('string')
  expect(typeof row.sfTotal).toBe('number')
  expect(typeof row.sfDone).toBe('number')
  expect(typeof row.pendingGates).toBe('number')
  expect(typeof row.updatedAt).toBe('number')
  expect(typeof row.parseError).toBe('boolean')
}

function expectSfShape(sf: SuperpowersStoryDetailSf): void {
  expect(typeof sf.name).toBe('string')
  expect(typeof sf.title).toBe('string')
  expect(typeof sf.tier).toBe('number')
  expect(typeof sf.what).toBe('string')
  expect(Array.isArray(sf.dependsOn)).toBe(true)
  expect(sf.linear === null || typeof sf.linear === 'string').toBe(true)
  expect(SF_STATUSES).toContain(sf.status)
}

function expectGateShape(gate: StoryDetailGate): void {
  expect(typeof gate.gateId).toBe('string')
  expect(typeof gate.title).toBe('string')
  expect(GATE_STATUSES).toContain(gate.status)
  expect(gate.resolution === null || typeof gate.resolution === 'string').toBe(true)
  expect(Array.isArray(gate.options)).toBe(true)
  gate.options.forEach((option) => expect(typeof option).toBe('string'))
  expect(gate.worktreeId === null || typeof gate.worktreeId === 'string').toBe(true)
  expect(typeof gate.createdAt).toBe('number')
  expect(typeof gate.storyLinked).toBe('boolean')
}

describe('story-rpc fixtures conformance (contract §3b)', () => {
  it('storyList happy path: full-shape rows, ≥2 workspaces, sorted newest-first', () => {
    const { stories } = fromWire(storyListHappyPath)

    expect(stories.length).toBe(4)
    stories.forEach(expectStoryListItemShape)
    stories.forEach((row) => expect(row.parseError).toBe(false))

    expect(new Set(stories.map((row) => row.workspaceName)).size).toBeGreaterThanOrEqual(2)

    // 1 worktree chứa 2 entry → cùng group trên list screen
    const byWorktree = new Map<string, number>()
    for (const row of stories) {
      if (row.worktreeId !== null) {
        byWorktree.set(row.worktreeId, (byWorktree.get(row.worktreeId) ?? 0) + 1)
      }
    }
    expect([...byWorktree.values()]).toContain(2)

    for (let i = 1; i < stories.length; i++) {
      expect(stories[i - 1].updatedAt).toBeGreaterThanOrEqual(stories[i].updatedAt)
    }
  })

  it('parseError entry: sfTotal 0 + zeroed counters, shape vẫn đầy đủ', () => {
    const row = fromWire(storyListItemParseError)

    expectStoryListItemShape(row)
    expect(row.sfTotal).toBe(0)
    expect(row.parseError).toBe(true)
    expect(row.sfDone).toBe(0)
    expect(row.pendingGates).toBe(0)
  })

  it('storyList với parseError: entry lỗi sống cạnh các entry healthy nguyên vẹn', () => {
    const { stories } = fromWire(storyListWithParseError)

    expect(stories.filter((row) => row.parseError)).toEqual([storyListItemParseError])
    expect(stories.filter((row) => !row.parseError)).toEqual(storyListHappyPath.stories)
  })

  it('storyDetail: story fields đầy đủ, sfs nhiều tier + dependsOn + linear + đủ 4 status', () => {
    const wire = fromWire(storyDetailHappyPath)

    expect(typeof wire.story.storyId).toBe('string')
    expect(typeof wire.story.title).toBe('string')
    expect(typeof wire.story.epicId).toBe('string')
    expect(typeof wire.story.destination).toBe('string')
    expect(typeof wire.story.worktreeId).toBe('string')
    expect(typeof wire.story.workspaceName).toBe('string')
    expect(wire.story.parseError).toBe(false)

    const { sfs } = wire.story
    expect(sfs.length).toBeGreaterThanOrEqual(3)
    sfs.forEach(expectSfShape)
    expect(new Set(sfs.map((sf) => sf.tier))).toEqual(new Set([0, 1, 2]))

    // đủ cả 4 giá trị status enum — 'unknown' là fallback bắt buộc của contract
    expect(new Set(sfs.map((sf) => sf.status))).toEqual(new Set(SF_STATUSES))

    // dependsOn rỗng ở tier 0, non-empty từ tier 1
    expect(sfs.find((sf) => sf.tier === 0)?.dependsOn).toEqual([])
    expect(sfs.filter((sf) => sf.tier > 0).every((sf) => sf.dependsOn.length > 0)).toBe(true)

    expect(sfs.some((sf) => sf.linear === null)).toBe(true)
    expect(sfs.every((sf) => sf.linear === null || typeof sf.linear === 'string')).toBe(true)
  })

  it('gates: đủ pending/resolved/timeout, storyLinked cả true lẫn false', () => {
    const { gates } = fromWire(storyDetailHappyPath)

    expect(gates.length).toBe(3)
    gates.forEach(expectGateShape)
    expect(new Set(gates.map((gate) => gate.status))).toEqual(new Set(GATE_STATUSES))
    expect(gates.some((gate) => gate.storyLinked)).toBe(true)
    expect(gates.some((gate) => !gate.storyLinked)).toBe(true)

    const pending = gates.find((gate) => gate.status === 'pending')
    expect(pending?.resolution).toBeNull()
    expect(pending?.options.length).toBeGreaterThan(0)

    const resolved = gates.find((gate) => gate.status === 'resolved')
    expect(typeof resolved?.resolution).toBe('string')
  })

  it('story_not_found error payload khớp contract đúng 1 field', () => {
    expect(fromWire(storyDetailNotFound)).toEqual({ error: 'story_not_found' })
  })
})
