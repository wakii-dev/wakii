import { describe, expect, it } from 'vitest'
import {
  buildLocalNotificationData,
  getNotificationNavigationTarget,
  notificationCredentialRecoveryRoute
} from './notification-routing'

const knownHosts = new Set(['host-1'])

describe('gate notification routing', () => {
  it('carries gate and story ids through locally scheduled banner data', () => {
    expect(
      buildLocalNotificationData(
        {
          source: 'gate-open',
          worktreeId: 'repo::/tmp/wt',
          storyId: 'story-1',
          gateId: 'gate-1'
        },
        'host-1'
      )
    ).toEqual({
      source: 'gate-open',
      hostId: 'host-1',
      worktreeId: 'repo::/tmp/wt',
      storyId: 'story-1',
      gateId: 'gate-1'
    })
  })

  it('routes gate-open taps with a story id to the story screen', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'gate-open',
        hostId: 'host-1',
        worktreeId: 'repo::/tmp/wt',
        storyId: 'story-1',
        gateId: 'gate-1'
      })
    ).toEqual({
      hostId: 'host-1',
      sessionTarget: {
        name: '[hostId]/stories/[...storyId]',
        params: { hostId: 'host-1', storyId: 'story-1', gateId: 'gate-1' }
      }
    })
  })

  it('routes gate-closed taps with a story id to the same story screen', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'gate-closed',
        hostId: 'host-1',
        storyId: 'story-1'
      })
    ).toEqual({
      hostId: 'host-1',
      sessionTarget: {
        name: '[hostId]/stories/[...storyId]',
        params: { hostId: 'host-1', storyId: 'story-1' }
      }
    })
  })

  it.each([undefined, null, ''] as const)(
    'falls back to the worktree session when a gate tap carries no usable story id (%s)',
    (storyId) => {
      expect(
        getNotificationNavigationTarget({
          source: 'gate-open',
          hostId: 'host-1',
          storyId,
          worktreeId: 'repo::/tmp/wt'
        })
      ).toEqual({
        hostId: 'host-1',
        sessionTarget: {
          name: '[hostId]/session/[worktreeId]',
          params: { hostId: 'host-1', worktreeId: 'repo::/tmp/wt' }
        }
      })
    }
  )

  it('falls back to the host screen when a gate tap has neither story nor worktree', () => {
    expect(getNotificationNavigationTarget({ source: 'gate-open', hostId: 'host-1' })).toEqual({
      hostId: 'host-1',
      sessionTarget: null
    })
  })

  it('drops blank gate ids from the story route params', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'gate-open',
        hostId: 'host-1',
        storyId: 'story-1',
        gateId: '   '
      })?.sessionTarget
    ).toEqual({
      name: '[hostId]/stories/[...storyId]',
      params: { hostId: 'host-1', storyId: 'story-1' }
    })
  })

  it('keeps legacy sources on the worktree session route and ignores unknown fields', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'agent-task-complete',
        hostId: 'host-1',
        worktreeId: 'repo::/tmp/wt',
        futureField: 'x'
      })
    ).toEqual({
      hostId: 'host-1',
      sessionTarget: {
        name: '[hostId]/session/[worktreeId]',
        params: { hostId: 'host-1', worktreeId: 'repo::/tmp/wt' }
      }
    })
  })

  it('routes credential recovery ahead of the story destination', () => {
    const target = getNotificationNavigationTarget(
      { source: 'gate-open', hostId: 'host-1', storyId: 'story-1' },
      {
        knownHostIds: knownHosts,
        credentialStatusByHostId: new Map([['host-1', 'missing']])
      }
    )
    expect(target).toMatchObject({
      hostId: 'host-1',
      credentialRecovery: 're-pair',
      sessionTarget: {
        name: '[hostId]/stories/[...storyId]',
        params: { hostId: 'host-1', storyId: 'story-1' }
      }
    })
    expect(notificationCredentialRecoveryRoute(target!)).toBe('/pair-scan')
  })

  it('routes purely from the payload, even for a story that no longer exists', () => {
    // Story existence is the story screen's concern (not-found banner); routing stays payload-driven.
    expect(
      getNotificationNavigationTarget({
        source: 'gate-closed',
        hostId: 'host-1',
        storyId: 'deleted-story'
      })?.sessionTarget
    ).toEqual({
      name: '[hostId]/stories/[...storyId]',
      params: { hostId: 'host-1', storyId: 'deleted-story' }
    })
  })

  it('treats stored banner data without story/gate keys as legacy, even for a gate source', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'gate-open',
        hostId: 'host-1',
        worktreeId: 'repo::/tmp/wt'
      })
    ).toEqual({
      hostId: 'host-1',
      sessionTarget: {
        name: '[hostId]/session/[worktreeId]',
        params: { hostId: 'host-1', worktreeId: 'repo::/tmp/wt' }
      }
    })
    expect(getNotificationNavigationTarget({ source: 'gate-closed', hostId: 'host-1' })).toEqual({
      hostId: 'host-1',
      sessionTarget: null
    })
  })
})
