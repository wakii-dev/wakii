import { describe, expect, it } from 'vitest'
import type { LocalNotificationData } from './notification-routing'
import { buildLocalNotificationData, getNotificationNavigationTarget } from './notification-routing'

// Multi-host contract (D7): with several hosts paired, every stored blob routes from ITS OWN
// hostId — never a first-known host — and a host no longer in knownHostIds routes nowhere, even
// story-linked. The banner stamp comes from the caller's hostId argument. Routing decisions live
// in gate-notification-routing.test.ts; version skew in gate-notification-wire-compat.test.ts.

const KNOWN_HOST_IDS = new Set(['host-alpha', 'host-beta'])

const alphaBlob = {
  source: 'gate-open',
  hostId: 'host-alpha',
  worktreeId: 'alpha::/repos/alpha',
  storyId: 'story-alpha',
  gateId: 'gate-alpha'
} as const

const betaBlob = {
  source: 'gate-closed',
  hostId: 'host-beta',
  worktreeId: 'beta::/repos/beta',
  storyId: 'story-beta',
  gateId: 'gate-beta'
} as const

function expectRoutesToOwnStory(blob: typeof alphaBlob, target: LocalNotificationData | null) {
  expect(target).toEqual({
    hostId: blob.hostId,
    sessionTarget: {
      name: '[hostId]/stories/[...storyId]',
      params: { hostId: blob.hostId, storyId: blob.storyId, gateId: blob.gateId }
    }
  })
}

describe('gate notification multi-host routing', () => {
  it('routes each gate blob to its own host when both hosts are known', () => {
    // A first-known-host regression would answer host-alpha for the beta blob; the full-shape
    // match makes any host or id mix-up fail.
    for (const [blob, otherHostId] of [
      [alphaBlob, betaBlob.hostId],
      [betaBlob, alphaBlob.hostId]
    ] as const) {
      const target = getNotificationNavigationTarget(blob, { knownHostIds: KNOWN_HOST_IDS })
      expectRoutesToOwnStory(blob, target)
      expect(target?.hostId).not.toBe(otherHostId)
    }
  })

  it('drops a gate blob whose host is no longer paired, story-linked or not', () => {
    expect(
      getNotificationNavigationTarget(
        {
          source: 'gate-open',
          hostId: 'host-gone',
          worktreeId: 'gone::/repos/gone',
          storyId: 'story-gone',
          gateId: 'gate-gone'
        },
        { knownHostIds: KNOWN_HOST_IDS }
      )
    ).toBeNull()
    expect(
      getNotificationNavigationTarget(
        { source: 'gate-closed', hostId: 'host-gone', storyId: 'story-gone' },
        { knownHostIds: KNOWN_HOST_IDS }
      )
    ).toBeNull()
  })

  it('keeps two host-distinct blobs from cross-matching in either feed order', () => {
    // No first-match across hosts: each call must return the blob's own target regardless of
    // which host was consulted first.
    for (const order of [
      [alphaBlob, betaBlob],
      [betaBlob, alphaBlob]
    ] as const) {
      const [firstTarget, secondTarget] = order.map((blob) =>
        getNotificationNavigationTarget(blob, { knownHostIds: KNOWN_HOST_IDS })
      )
      expectRoutesToOwnStory(order[0], firstTarget ?? null)
      expectRoutesToOwnStory(order[1], secondTarget ?? null)
    }
  })

  it('stamps banner data with the hostId argument, not anything on the event', () => {
    // DesktopNotificationEvent has no hostId field — the caller's host context is the only stamp source.
    const event = {
      source: 'gate-open',
      worktreeId: 'shared::/repos/shared',
      storyId: 'story-shared',
      gateId: 'gate-shared',
      notificationId: 'n-7'
    } as const
    const alphaData = buildLocalNotificationData(event, 'host-alpha')
    const betaData = buildLocalNotificationData(event, 'host-beta')
    expect(alphaData).toEqual({
      source: 'gate-open',
      hostId: 'host-alpha',
      worktreeId: 'shared::/repos/shared',
      storyId: 'story-shared',
      gateId: 'gate-shared',
      notificationId: 'n-7'
    })
    expect(betaData).toEqual({ ...alphaData, hostId: 'host-beta' })
  })
})
