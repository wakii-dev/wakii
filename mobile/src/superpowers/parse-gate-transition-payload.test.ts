// Parser tests (plan T5): absent-key / present-null / both-present routing coercion,
// wire-envelope tolerance, source filtering, malformed-input drops.
import { describe, expect, it } from 'vitest'

import {
  gateClosedRoutingAbsent,
  gateClosedStoryLinked,
  gateOpenRoutingAbsent,
  gateOpenRoutingNull,
  gateOpenStoryLinked
} from './gate-conformance-fixtures'
import { parseGateTransitionPayload } from './parse-gate-transition-payload'

// Wraps a contract payload into the full stream-frame shape the listener receives.
function wireEvent(source: string, payload: object, extra: object = {}): unknown {
  return { type: 'notification', source, ...payload, ...extra }
}

describe('parseGateTransitionPayload', () => {
  it('both routing keys LITERALLY absent → null/null (overlay khác, plan D5)', () => {
    expect(parseGateTransitionPayload(wireEvent('gate-open', gateOpenRoutingAbsent))).toEqual({
      kind: 'open',
      gateId: gateOpenRoutingAbsent.gateId,
      storyId: null,
      worktreeId: null,
      title: gateOpenRoutingAbsent.title
    })
  })

  it('both keys present → values preserved (story-linked, both-or-neither)', () => {
    expect(parseGateTransitionPayload(wireEvent('gate-open', gateOpenStoryLinked))).toEqual({
      kind: 'open',
      gateId: gateOpenStoryLinked.gateId,
      storyId: gateOpenStoryLinked.storyId,
      worktreeId: gateOpenStoryLinked.worktreeId,
      title: gateOpenStoryLinked.title
    })
  })

  it('present-as-null → null/null (forward-compat shape)', () => {
    const parsed = parseGateTransitionPayload(wireEvent('gate-open', gateOpenRoutingNull))
    expect(parsed?.storyId).toBeNull()
    expect(parsed?.worktreeId).toBeNull()
    expect(parsed?.gateId).toBe(gateOpenRoutingNull.gateId)
  })

  it('gate-closed parses to kind closed, absent and story-linked variants', () => {
    expect(parseGateTransitionPayload(wireEvent('gate-closed', gateClosedRoutingAbsent))).toEqual({
      kind: 'closed',
      gateId: gateClosedRoutingAbsent.gateId,
      storyId: null,
      worktreeId: null,
      title: gateClosedRoutingAbsent.title
    })
    expect(parseGateTransitionPayload(wireEvent('gate-closed', gateClosedStoryLinked))?.kind).toBe(
      'closed'
    )
  })

  it('extra wire envelope fields are tolerated and never read', () => {
    const parsed = parseGateTransitionPayload(
      wireEvent('gate-open', gateOpenRoutingAbsent, {
        body: '',
        notificationId: 'notif-1',
        notificationSeq: 41,
        notificationEpoch: 'epoch-1'
      })
    )
    expect(parsed).not.toBeNull()
    expect(Object.keys(parsed).sort()).toEqual(['gateId', 'kind', 'storyId', 'title', 'worktreeId'])
  })

  it('non-gate sources and non-notification frames are ignored', () => {
    for (const source of ['agent-task-complete', 'terminal-bell', 'test', 'plugin']) {
      expect(parseGateTransitionPayload(wireEvent(source, gateOpenRoutingAbsent))).toBeNull()
    }
    expect(parseGateTransitionPayload({ type: 'ready', subscriptionId: 'sub-1' })).toBeNull()
    expect(parseGateTransitionPayload({ type: 'end' })).toBeNull()
    expect(parseGateTransitionPayload({ type: 'dismiss', notificationId: 'notif-1' })).toBeNull()
    expect(parseGateTransitionPayload({ type: 'notification', gateId: 'g', title: 't' })).toBeNull()
  })

  it('split shape tolerated at runtime: storyId present, worktreeId absent', () => {
    // The fixture union makes this a compile error, but the wire could still send it —
    // each routing field coerces independently.
    expect(
      parseGateTransitionPayload({
        type: 'notification',
        source: 'gate-open',
        gateId: 'gate-split',
        title: 'Split',
        storyId: 'brackets/x.md'
      })
    ).toEqual({
      kind: 'open',
      gateId: 'gate-split',
      storyId: 'brackets/x.md',
      worktreeId: null,
      title: 'Split'
    })
  })

  it('empty-string routing values coerce to null, never a bogus group key', () => {
    const parsed = parseGateTransitionPayload(
      wireEvent('gate-open', { gateId: 'gate-empty', title: 'T', storyId: '', worktreeId: '' })
    )
    expect(parsed?.storyId).toBeNull()
    expect(parsed?.worktreeId).toBeNull()
  })

  it('malformed → null (dropped, no crash)', () => {
    expect(parseGateTransitionPayload(null)).toBeNull()
    expect(parseGateTransitionPayload(undefined)).toBeNull()
    expect(parseGateTransitionPayload(42)).toBeNull()
    expect(parseGateTransitionPayload('gate-open')).toBeNull()
    expect(parseGateTransitionPayload([])).toBeNull()
    expect(parseGateTransitionPayload({})).toBeNull()
    // Missing / empty / non-string gateId.
    expect(parseGateTransitionPayload(wireEvent('gate-open', { title: 'No id' }))).toBeNull()
    expect(
      parseGateTransitionPayload(wireEvent('gate-open', { gateId: '', title: 'T' }))
    ).toBeNull()
    expect(parseGateTransitionPayload(wireEvent('gate-open', { gateId: 7, title: 'T' }))).toBeNull()
    // Non-string title.
    expect(
      parseGateTransitionPayload(wireEvent('gate-open', { gateId: 'gate-x', title: 99 }))
    ).toBeNull()
    expect(parseGateTransitionPayload(wireEvent('gate-open', { gateId: 'gate-x' }))).toBeNull()
  })
})
