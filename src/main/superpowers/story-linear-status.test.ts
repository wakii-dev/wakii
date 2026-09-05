import { beforeEach, describe, expect, it, vi } from 'vitest'

const getStatus = vi.fn()
const getIssue = vi.fn()

vi.mock('../linear/client', () => ({
  getStatus: (...args: unknown[]) => getStatus(...args)
}))

vi.mock('../linear/linear-issue-lookups', () => ({
  getIssue: (...args: unknown[]) => getIssue(...args)
}))

import {
  mapLinearStateType,
  readSfStatuses,
  resetSfStatusCacheForTests
} from './story-linear-status'

function issueWithStateType(type: string): {
  state: { name: string; type: string; color: string }
} {
  return { state: { name: 'State', type, color: '#000000' } }
}

describe('mapLinearStateType', () => {
  it('maps known state.type values', () => {
    expect(mapLinearStateType('completed')).toBe('done')
    expect(mapLinearStateType('started')).toBe('in-progress')
    expect(mapLinearStateType('unstarted')).toBe('todo')
    expect(mapLinearStateType('backlog')).toBe('todo')
  })

  it('degrades canceled, empty and unrecognized values to unknown (default branch)', () => {
    expect(mapLinearStateType('canceled')).toBe('unknown')
    expect(mapLinearStateType('')).toBe('unknown')
    expect(mapLinearStateType('Finished')).toBe('unknown')
  })
})

describe('readSfStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSfStatusCacheForTests()
    getStatus.mockReturnValue({ connected: true })
  })

  it('returns mapped statuses per id when connected', async () => {
    getIssue.mockImplementation(async (id: string) =>
      id === 'FI-1' ? issueWithStateType('started') : issueWithStateType('completed')
    )

    const statuses = await readSfStatuses(['FI-1', 'FI-2'])

    expect(statuses.get('FI-1')).toBe('in-progress')
    expect(statuses.get('FI-2')).toBe('done')
    expect(getIssue).toHaveBeenCalledWith('FI-1')
    expect(getIssue).toHaveBeenCalledWith('FI-2')
  })

  it('returns unknown for every id without touching Linear when not connected', async () => {
    getStatus.mockReturnValue({ connected: false })

    const statuses = await readSfStatuses(['FI-1'])

    expect(statuses.get('FI-1')).toBe('unknown')
    expect(getIssue).not.toHaveBeenCalled()
  })

  it('treats a getStatus throw as not connected', async () => {
    getStatus.mockImplementation(() => {
      throw new Error('no workspace file')
    })

    const statuses = await readSfStatuses(['FI-1'])

    expect(statuses.get('FI-1')).toBe('unknown')
    expect(getIssue).not.toHaveBeenCalled()
  })

  it('degrades per-id failures and null issues to unknown without failing the batch', async () => {
    getIssue.mockImplementation(async (id: string) => {
      if (id === 'FI-1') {
        throw new Error('boom')
      }
      return id === 'FI-2' ? null : issueWithStateType('backlog')
    })

    const statuses = await readSfStatuses(['FI-1', 'FI-2', 'FI-3'])

    expect(statuses.get('FI-1')).toBe('unknown')
    expect(statuses.get('FI-2')).toBe('unknown')
    expect(statuses.get('FI-3')).toBe('todo')
  })

  it('serves repeated reads within the TTL from cache (one Linear pass)', async () => {
    let clock = 1_000
    const now = () => clock
    getIssue.mockResolvedValue(issueWithStateType('completed'))

    await readSfStatuses(['FI-1'], { now })
    clock += 29_999
    await readSfStatuses(['FI-1'], { now })

    expect(getIssue).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL window expires and re-caches', async () => {
    let clock = 1_000
    const now = () => clock
    getIssue.mockResolvedValue(issueWithStateType('completed'))

    await readSfStatuses(['FI-1'], { now })
    clock += 30_000
    getIssue.mockResolvedValue(issueWithStateType('started'))
    const statuses = await readSfStatuses(['FI-1'], { now })

    expect(getIssue).toHaveBeenCalledTimes(2)
    expect(statuses.get('FI-1')).toBe('in-progress')
  })

  it('returns an empty map for an empty id set with zero Linear traffic', async () => {
    const statuses = await readSfStatuses([])

    expect(statuses.size).toBe(0)
    expect(getStatus).not.toHaveBeenCalled()
    expect(getIssue).not.toHaveBeenCalled()
  })

  it('fetches duplicate ids once per pass', async () => {
    getIssue.mockResolvedValue(issueWithStateType('completed'))

    const statuses = await readSfStatuses(['FI-1', 'FI-1'])

    expect(getIssue).toHaveBeenCalledTimes(1)
    expect(statuses.get('FI-1')).toBe('done')
  })
})
