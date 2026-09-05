import { describe, expect, it } from 'vitest'
import { sfStatusLabel, storyProgressLabel } from './story-screen-copy'
import type { SuperpowersSfStatus } from '../../../src/shared/superpowers/story-rpc-contract'

describe('sfStatusLabel', () => {
  it('covers every wire status with display casing', () => {
    const statuses: readonly SuperpowersSfStatus[] = ['todo', 'in-progress', 'done', 'unknown']
    expect(statuses.map(sfStatusLabel)).toEqual(['Todo', 'In progress', 'Done', 'Unknown'])
  })
})

describe('storyProgressLabel', () => {
  it('formats done/total counts', () => {
    expect(storyProgressLabel(3, 4)).toBe('3/4 SF done')
    expect(storyProgressLabel(5, 5)).toBe('5/5 SF done')
  })

  it('formats zero totals defensively', () => {
    expect(storyProgressLabel(0, 0)).toBe('0/0 SF done')
  })
})
