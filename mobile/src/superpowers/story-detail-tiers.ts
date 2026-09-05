import type { SuperpowersStoryDetailSf } from '../../../src/shared/superpowers/story-rpc-contract'

export type SfTierGroup = {
  tier: number
  sfs: SuperpowersStoryDetailSf[]
}

export function countDoneSfs(sfs: SuperpowersStoryDetailSf[]): number {
  return sfs.filter((sf) => sf.status === 'done').length
}

// Tier ascending; within a tier the bracket's own SF order is kept (Map keeps
// insertion order, so grouping is a stable partition).
export function groupSfsByTier(sfs: SuperpowersStoryDetailSf[]): SfTierGroup[] {
  const byTier = new Map<number, SuperpowersStoryDetailSf[]>()
  for (const sf of sfs) {
    const bucket = byTier.get(sf.tier)
    if (bucket) {
      bucket.push(sf)
    } else {
      byTier.set(sf.tier, [sf])
    }
  }
  return [...byTier.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tier, tierSfs]) => ({ tier, sfs: tierSfs }))
}
