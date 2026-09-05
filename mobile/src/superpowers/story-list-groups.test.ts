import { describe, expect, it } from 'vitest'
import { OTHER_WORKTREE_GROUP_TITLE } from './story-screen-copy'
import {
  storyListDuplicateStoryIdAcrossWorktrees,
  storyListHappyPath,
  storyListWithParseError
} from './story-rpc-fixtures'
import { groupStoriesByWorktree, storyRowKey } from './story-list-groups'

describe('groupStoriesByWorktree', () => {
  it('groups the fixture across workspaces with the null-worktree entry in the neutral group', () => {
    const groups = groupStoriesByWorktree(storyListHappyPath.stories)
    expect(groups.map((group) => group.title)).toEqual([
      'orca',
      'atlas',
      OTHER_WORKTREE_GROUP_TITLE
    ])
    expect(groups[0].stories.map((story) => story.storyId)).toEqual([
      'brackets/fi307-sf2-mobile-story.md',
      'brackets/fi306-sf1-superpowers-android.md'
    ])
    expect(groups[1].stories.map((story) => story.storyId)).toEqual([
      'brackets/fi305-story-watchdog.md'
    ])
    expect(groups[2].stories.map((story) => story.storyId)).toEqual(['notes/scratch-idea.md'])
  })

  it('keeps two entries of the same worktree in one group in server order', () => {
    const groups = groupStoriesByWorktree(storyListHappyPath.stories)
    expect(groups).toHaveLength(3)
    const orca = groups[0]
    expect(orca.key).toBe('wt:wt-orca-main')
    expect(orca.stories).toHaveLength(2)
    // Server order (updatedAt desc) preserved inside the group: fi307 is newer than fi306.
    expect(orca.stories[0].updatedAt).toBeGreaterThan(orca.stories[1].updatedAt)
  })

  it('names the neutral group after a null worktreeId instead of the workspace name', () => {
    const groups = groupStoriesByWorktree(storyListHappyPath.stories)
    const other = groups.find((group) => group.key === OTHER_WORKTREE_GROUP_TITLE)
    expect(other?.title).toBe(OTHER_WORKTREE_GROUP_TITLE)
    expect(other?.stories[0].workspaceName).toBe('atlas')
  })

  it('keeps a parseError entry in place next to healthy rows', () => {
    const groups = groupStoriesByWorktree(storyListWithParseError.stories)
    const orca = groups.find((group) => group.key === 'wt:wt-orca-main')
    expect(orca?.stories.map((story) => story.parseError)).toEqual([false, false, true])
    expect(orca?.stories.at(-1)?.storyId).toBe('brackets/broken-bracket.md')
  })

  it('orders groups by first appearance, not by name', () => {
    const reordered = storyListHappyPath.stories.toReversed()
    const groups = groupStoriesByWorktree(reordered)
    expect(groups.map((group) => group.title)).toEqual([
      OTHER_WORKTREE_GROUP_TITLE,
      'atlas',
      'orca'
    ])
    // The reversed input must not reorder entries within a group.
    expect(groups[2].stories.map((story) => story.storyId)).toEqual([
      'brackets/fi306-sf1-superpowers-android.md',
      'brackets/fi307-sf2-mobile-story.md'
    ])
  })

  it('returns no groups for an empty list', () => {
    expect(groupStoriesByWorktree([])).toEqual([])
  })

  it('keeps the same bracket name in two worktrees as two groups with distinct row keys', () => {
    const stories = storyListDuplicateStoryIdAcrossWorktrees.stories
    const groups = groupStoriesByWorktree(stories)
    expect(groups.map((group) => group.title)).toEqual(['orca', 'atlas'])
    expect(groups.map((group) => group.stories[0].storyId)).toEqual([
      'brackets/fi307-sf2-mobile-story.md',
      'brackets/fi307-sf2-mobile-story.md'
    ])
    // Row identity is worktree-scoped or the two rows would collide.
    expect(storyRowKey(stories[0])).not.toBe(storyRowKey(stories[1]))
  })
})
