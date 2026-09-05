import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'
import { OTHER_WORKTREE_GROUP_TITLE } from './story-screen-copy'

export type StoryListGroup = {
  // `wt:` prefix keeps the defensive no-worktree group key from colliding with a real worktreeId.
  key: string
  title: string
  stories: SuperpowersStoryListItem[]
}

function storyGroupKey(story: SuperpowersStoryListItem): string {
  return story.worktreeId != null ? `wt:${story.worktreeId}` : OTHER_WORKTREE_GROUP_TITLE
}

// The same bracket name can live in several worktrees (host list does not dedup),
// so row identity must be scoped by group or two rows would collide.
export function storyRowKey(story: SuperpowersStoryListItem): string {
  return `${storyGroupKey(story)}:${story.storyId}`
}

/** Group list rows per worktree: header = workspaceName, entries keep the server's
 *  (updatedAt desc) order, groups ordered by first appearance. Null worktreeId rows
 *  (defensive — v1 entries normally carry an id) merge into one neutral group.
 *  parseError rows are ordinary data — they group and render like any other row. */
export function groupStoriesByWorktree(stories: SuperpowersStoryListItem[]): StoryListGroup[] {
  const groups: StoryListGroup[] = []
  const byKey = new Map<string, StoryListGroup>()
  for (const story of stories) {
    const key = storyGroupKey(story)
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        title: story.worktreeId != null ? story.workspaceName : OTHER_WORKTREE_GROUP_TITLE,
        stories: []
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.stories.push(story)
  }
  return groups
}
