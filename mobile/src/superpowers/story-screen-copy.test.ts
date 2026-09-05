import { describe, expect, it } from 'vitest'
import {
  STALE_LIST_BANNER_TEXT,
  STALE_STORY_BANNER_TEXT,
  sfStatusLabel,
  storyProgressLabel
} from './story-screen-copy'
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

describe('stale banner copy', () => {
  it('keeps the failed-poll list wording neutral and distinct from not-found', () => {
    expect(STALE_LIST_BANNER_TEXT).not.toBe(STALE_STORY_BANNER_TEXT)
    expect(STALE_LIST_BANNER_TEXT).toMatch(/^Could not refresh stories\./)
    // A failed poll is not evidence a story was deleted.
    expect(STALE_LIST_BANNER_TEXT).not.toMatch(/no longer available/)
  })
})
