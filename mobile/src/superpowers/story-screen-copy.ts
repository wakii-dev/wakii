import type {
  SuperpowersSfStatus,
  SuperpowersStoryDetailResult
} from '../../../src/shared/superpowers/story-rpc-contract'

// UI copy for the story list (T5) + detail (T6) screens, centralized per the
// hosted-review-copy.ts precedent so status casing and progress format stay
// pinned by test and shared across screens instead of drifting inline.
// English-only by convention — no i18n dependency (T8 decision).

export const STORY_LIST_TITLE = 'Stories'

// Bracket heading fallback when the story title is blank
export const UNTITLED_STORY_TITLE = 'Untitled story'

// Group for entries whose worktreeId is null (defensive path — v1 entries
// normally always carry a registered worktree id)
export const OTHER_WORKTREE_GROUP_TITLE = 'Other'

// Detail's story_not_found banner — a deleted story is the only thing this can mean.
export const STALE_STORY_BANNER_TEXT =
  'This story is no longer available on the host. It may have been moved or removed.'

// List's failed-poll banner — a fetch failure (network, host down) is not evidence
// any story was deleted, so the wording stays neutral (T9 review handoff).
export const STALE_LIST_BANNER_TEXT = 'Could not refresh stories. Showing the last known list.'

export const STALE_STORY_REFRESH_ACTION = 'Refresh'

export const REFRESH_HINT = 'Pull to refresh'

// Row flag for entries whose bracket file failed to parse — the entry renders
// with this flag instead of crashing or being hidden (T5/T9)
export const PARSE_ERROR_ENTRY_LABEL = 'Parse error'

const SF_STATUS_LABELS: Record<SuperpowersSfStatus, string> = {
  todo: 'Todo',
  'in-progress': 'In progress',
  done: 'Done',
  unknown: 'Unknown'
}

// Exhaustive over the wire status union — 'canceled' is normalized to 'unknown'
// by the host before it reaches the client, so 'Unknown' is the neutral chip
export function sfStatusLabel(status: SuperpowersSfStatus): string {
  return SF_STATUS_LABELS[status]
}

export function storyProgressLabel(sfDone: number, sfTotal: number): string {
  return `${sfDone}/${sfTotal} SF done`
}

// Detail screen (T6)
export function storyTierLabel(tier: number): string {
  return `Tier ${tier}`
}

// 'depends: SF-1, SF-2' — null hides the line for an empty dependsOn
export function storyDependsLabel(dependsOn: string[]): string | null {
  return dependsOn.length > 0 ? `depends: ${dependsOn.join(', ')}` : null
}

// Gates render passively — count + list only; resolve UI is SF-3
export const GATES_SECTION_TITLE = 'Gates'

export function gatePendingCountLabel(count: number): string {
  return `${count} pending`
}

type GateStatus = SuperpowersStoryDetailResult['gates'][number]['status']

const GATE_STATUS_LABELS: Record<GateStatus, string> = {
  pending: 'Pending',
  resolved: 'Resolved',
  timeout: 'Timeout'
}

export function gateStatusLabel(status: GateStatus): string {
  return GATE_STATUS_LABELS[status]
}
