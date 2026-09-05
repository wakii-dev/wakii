import { describe, expect, it } from 'vitest'
import { createStoryDetailHref, normalizeStoryDetailRouteParams } from './story-detail-route'

describe('createStoryDetailHref', () => {
  it('targets the host-scoped catch-all route with the raw storyId', () => {
    expect(
      createStoryDetailHref({ hostId: 'host-1', storyId: 'brackets/fi305-superpowers-android.md' })
    ).toEqual({
      pathname: '/h/[hostId]/stories/[...storyId]',
      params: { hostId: 'host-1', storyId: 'brackets/fi305-superpowers-android.md' }
    })
  })
})

describe('normalizeStoryDetailRouteParams', () => {
  it('accepts the single-string form a deep link may deliver', () => {
    expect(
      normalizeStoryDetailRouteParams({
        hostId: 'host-1',
        storyId: 'brackets/fi305-superpowers-android.md'
      })
    ).toEqual({ ok: true, hostId: 'host-1', storyId: 'brackets/fi305-superpowers-android.md' })
  })

  it('joins the catch-all segment array expo-router hands back', () => {
    expect(
      normalizeStoryDetailRouteParams({
        hostId: 'host-1',
        storyId: ['brackets', 'fi305-superpowers-android.md']
      })
    ).toEqual({ ok: true, hostId: 'host-1', storyId: 'brackets/fi305-superpowers-android.md' })
  })

  it('rejects missing or empty params', () => {
    expect(normalizeStoryDetailRouteParams({ hostId: 'host-1' })).toEqual({
      ok: false,
      message: 'Unable to open story'
    })
    expect(normalizeStoryDetailRouteParams({ hostId: 'host-1', storyId: [] })).toEqual({
      ok: false,
      message: 'Unable to open story'
    })
    expect(normalizeStoryDetailRouteParams({ storyId: 'brackets/x.md' })).toEqual({
      ok: false,
      message: 'Unable to open story'
    })
  })
})
