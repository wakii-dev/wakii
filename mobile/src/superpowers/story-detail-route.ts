// Pure route contract for the story detail screen (mobile-file-preview-route.ts
// pattern). The detail route is a catch-all (`stories/[...storyId]`) because a
// storyId is a docs-relative path containing `/` (e.g. `brackets/fi305-....md`).
// Expo-router round-trips such params through the URL and hands them back as a
// string[] of path segments, so every consumer normalizes via
// normalizeStoryDetailRouteParams instead of trusting the raw param type.

export type StoryDetailRouteParams = {
  hostId: string
  storyId: string
}

export type StoryDetailHref = {
  pathname: '/h/[hostId]/stories/[...storyId]'
  params: StoryDetailRouteParams
}

export function createStoryDetailHref(params: StoryDetailRouteParams): StoryDetailHref {
  return { pathname: '/h/[hostId]/stories/[...storyId]', params }
}

export type RawStoryDetailRouteParams = {
  hostId?: string | string[]
  storyId?: string | string[]
}

export type StoryDetailRouteState =
  | { ok: true; hostId: string; storyId: string }
  | { ok: false; message: string }

function singleParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// URL navigation splits the catch-all into segments; a string with `/` arrives
// from deep links/query params — both normalize to the original storyId.
function joinedStoryId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const joined = value.join('/')
    return joined.length > 0 ? joined : null
  }
  return singleParam(value)
}

export function normalizeStoryDetailRouteParams(
  params: RawStoryDetailRouteParams
): StoryDetailRouteState {
  const hostId = singleParam(params.hostId)
  const storyId = joinedStoryId(params.storyId)
  if (!hostId || !storyId) {
    return { ok: false, message: 'Unable to open story' }
  }
  return { ok: true, hostId, storyId }
}
