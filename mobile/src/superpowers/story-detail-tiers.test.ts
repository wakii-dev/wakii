import { describe, expect, it } from 'vitest'
import type { SuperpowersStoryDetailSf } from '../../../src/shared/superpowers/story-rpc-contract'
import { storyDetailHappyPath } from './story-rpc-fixtures'
import { countDoneSfs, groupSfsByTier } from './story-detail-tiers'

function sf(
  partial: Pick<SuperpowersStoryDetailSf, 'name' | 'tier' | 'status'>
): SuperpowersStoryDetailSf {
  return { title: '', what: '', dependsOn: [], linear: null, ...partial }
}

describe('story-detail-tiers', () => {
  it('groups the fixture sfs into ascending tiers keeping bracket order within a tier', () => {
    const groups = groupSfsByTier(storyDetailHappyPath.story.sfs)
    expect(groups.map((group) => group.tier)).toEqual([0, 1, 2])
    expect(groups[0].sfs.map((item) => item.name)).toEqual(['SF-1'])
    expect(groups[1].sfs.map((item) => item.name)).toEqual(['SF-2', 'SF-3'])
    expect(groups[2].sfs.map((item) => item.name)).toEqual(['SF-4'])
  })

  it('sorts out-of-order input ascending without reordering within a tier', () => {
    const groups = groupSfsByTier([
      sf({ name: 'SF-3', tier: 2, status: 'todo' }),
      sf({ name: 'SF-1', tier: 0, status: 'done' }),
      sf({ name: 'SF-2a', tier: 2, status: 'todo' }),
      sf({ name: 'SF-2b', tier: 2, status: 'todo' })
    ])
    expect(groups.map((group) => group.tier)).toEqual([0, 2])
    expect(groups[1].sfs.map((item) => item.name)).toEqual(['SF-3', 'SF-2a', 'SF-2b'])
  })

  it('counts only done status for the overall progress', () => {
    expect(countDoneSfs(storyDetailHappyPath.story.sfs)).toBe(1)
    expect(
      countDoneSfs([
        sf({ name: 'SF-1', tier: 0, status: 'done' }),
        sf({ name: 'SF-2', tier: 1, status: 'unknown' })
      ])
    ).toBe(1)
    expect(countDoneSfs([])).toBe(0)
  })
})
