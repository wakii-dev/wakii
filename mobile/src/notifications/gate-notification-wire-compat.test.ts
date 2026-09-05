import { describe, expect, it } from 'vitest'
import type { NotificationEvent } from './local-notification-scheduling'
import { buildLocalNotificationData, getNotificationNavigationTarget } from './notification-routing'

// Version-skew contract (no old APK needed): what an OLDER app build STORED must still route
// safely after upgrade, and NEW desktop payloads may only grow by unknown fields. Desktop gate
// dispatch (runtime-gate-transition-notifications.ts) carries worktreeId+storyId BOTH-or-NEITHER
// plus gateId always; the controller stamps notificationId/notificationSeq/notificationEpoch.
// Routing-decision coverage lives in gate-notification-routing.test.ts — this file pins skew only.

const HOST_ID = 'host-1'
const WORKTREE_ID = 'orca::/Users/dev/orca/workspaces/orca/sf-4'
const STORY_ID = 'brackets/2026-09-04-fi305-superpowers.md'
const GATE_ID = 'gate-9f2'
const NOTIFICATION_ID = 'n-41'

const worktreeSessionTarget = {
  name: '[hostId]/session/[worktreeId]',
  params: { hostId: HOST_ID, worktreeId: WORKTREE_ID }
} as const

/** Real-shaped desktop gate dispatch (seq/epoch as runtime-mobile-notification-controller stamps them). */
function realDesktopGateEvent(source: 'gate-open' | 'gate-closed'): NotificationEvent {
  return {
    type: 'notification',
    source,
    title: 'Waiting on you: approve implementation plan',
    body: source === 'gate-open' ? '' : 'approved',
    worktreeId: WORKTREE_ID,
    storyId: STORY_ID,
    gateId: GATE_ID,
    notificationId: NOTIFICATION_ID,
    notificationSeq: 41,
    notificationEpoch: 'epoch-a1'
  }
}

describe('gate notification wire compatibility', () => {
  it('routes a pre-SF-4 stored story-linked blob to the worktree session for both gate sources', () => {
    for (const source of ['gate-open', 'gate-closed'] as const) {
      // Exactly what the old buildLocalNotificationData stored from a real gate payload:
      // it kept source/hostId/worktreeId/notificationId and dropped storyId/gateId entirely.
      const oldStoredBlob = {
        source,
        hostId: HOST_ID,
        worktreeId: WORKTREE_ID,
        notificationId: NOTIFICATION_ID
      }
      const target = getNotificationNavigationTarget(oldStoredBlob)
      expect(target).toEqual({ hostId: HOST_ID, sessionTarget: worktreeSessionTarget })
      expect(target?.sessionTarget?.name).not.toBe('[hostId]/stories/[...storyId]')
    }
  })

  it('routes a pre-SF-4 stored gate blob without a worktree to the host fallback', () => {
    // 'khác' gates dispatched with neither worktreeId nor storyId; the old build stored neither.
    expect(
      getNotificationNavigationTarget({
        source: 'gate-open',
        hostId: HOST_ID,
        notificationId: NOTIFICATION_ID
      })
    ).toEqual({ hostId: HOST_ID, sessionTarget: null })
  })

  it('reads only known fields from a full new payload carrying unknown future fields', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'gate-open',
        hostId: HOST_ID,
        worktreeId: WORKTREE_ID,
        storyId: STORY_ID,
        gateId: GATE_ID,
        notificationId: NOTIFICATION_ID,
        campaign: 'spring-launch',
        priorityNote: 'escalate'
      })
    ).toEqual({
      hostId: HOST_ID,
      sessionTarget: {
        name: '[hostId]/stories/[...storyId]',
        params: { hostId: HOST_ID, storyId: STORY_ID, gateId: GATE_ID }
      }
    })
  })

  it('keeps a non-gate source on the worktree route when the same future fields ride along', () => {
    expect(
      getNotificationNavigationTarget({
        source: 'agent-task-complete',
        hostId: HOST_ID,
        worktreeId: WORKTREE_ID,
        storyId: STORY_ID,
        gateId: GATE_ID,
        notificationId: NOTIFICATION_ID,
        campaign: 'spring-launch',
        priorityNote: 'escalate'
      })
    ).toEqual({ hostId: HOST_ID, sessionTarget: worktreeSessionTarget })
  })

  it('stores banner data with exactly the known string fields — seq/epoch never leak into tap data', () => {
    // showLocalNotification passes the full dispatch event straight into buildLocalNotificationData.
    const data = buildLocalNotificationData(realDesktopGateEvent('gate-open'), HOST_ID)
    expect(data).toEqual({
      source: 'gate-open',
      hostId: HOST_ID,
      worktreeId: WORKTREE_ID,
      storyId: STORY_ID,
      gateId: GATE_ID,
      notificationId: NOTIFICATION_ID
    })
    expect(Object.values(data).every((value) => typeof value === 'string')).toBe(true)
  })

  it('upgrade-degrade: legacy persisted blobs tapped after upgrade route legacy, never a story target', () => {
    const legacyBlobs = [
      {
        source: 'gate-closed',
        hostId: HOST_ID,
        worktreeId: WORKTREE_ID,
        notificationId: NOTIFICATION_ID
      },
      { source: 'gate-open', hostId: HOST_ID, notificationId: NOTIFICATION_ID }
    ]
    for (const blob of legacyBlobs) {
      const target = getNotificationNavigationTarget(blob)
      expect(target).not.toBeNull()
      expect(
        target?.sessionTarget === null ||
          target?.sessionTarget?.name === '[hostId]/session/[worktreeId]'
      ).toBe(true)
    }
  })
})
