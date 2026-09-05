import { useCallback, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import type {
  SuperpowersSfStatus,
  SuperpowersStoryDetailResult,
  SuperpowersStoryDetailSf
} from '../../../src/shared/superpowers/story-rpc-contract'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileGateResolveSheetProps } from './MobileGateResolveSheet'
import type { PendingGateRow } from './pending-gates-store'
import { useMobileGateResolve } from './use-mobile-gate-resolve'
import {
  GATES_SECTION_TITLE,
  STALE_STORY_BANNER_TEXT,
  UNTITLED_STORY_TITLE,
  gatePendingCountLabel,
  gateStatusLabel,
  sfStatusLabel,
  storyDependsLabel,
  storyProgressLabel,
  storyTierLabel
} from './story-screen-copy'
import { countDoneSfs, groupSfsByTier } from './story-detail-tiers'
import { StoryStaleBanner } from './story-stale-banner'
import { useMobileStoryDetail } from './use-mobile-story-detail'

type Props = {
  client: RpcClient | null
  hostId: string | undefined
  storyId: string | undefined
  bottomInset?: number
}

// Distinct existing tokens per status; 'unknown' stays neutral (textMuted) —
// never a warn/error color (canceled also lands on 'unknown' per the mapping).
const SF_STATUS_CHIP_COLORS: Record<SuperpowersSfStatus, string> = {
  todo: colors.textSecondary,
  'in-progress': colors.statusAmber,
  done: colors.statusGreen,
  unknown: colors.textMuted
}

const GATE_STATUS_CHIP_COLORS: Record<
  SuperpowersStoryDetailResult['gates'][number]['status'],
  string
> = {
  pending: colors.statusAmber,
  resolved: colors.statusGreen,
  timeout: colors.textMuted
}

// Contract gate → sheet row (T9): detail responses always carry options, and the
// storyId mapping mirrors the sweep reconcile's storyLinked rule in pending-gates-store.
function toPendingGateRow(
  gate: SuperpowersStoryDetailResult['gates'][number],
  storyId: string
): PendingGateRow {
  return {
    ...gate,
    status: 'pending',
    storyId: gate.storyLinked ? storyId : null,
    source: 'sweep',
    optionsKnown: true
  }
}

export function MobileStoryDetailScreen({ client, hostId, storyId, bottomInset = 0 }: Props) {
  // T9: story_not_found raises the banner over the cached detail (kept rendering);
  // a failed fetch (stale) stays neutral here — unreachable host is not evidence
  // the story is gone. Nothing cached → neutral empty either way.
  const { detail, notFound, loading, refreshing, refresh } = useMobileStoryDetail({
    client,
    hostId,
    storyId
  })
  const tierGroups = useMemo(() => (detail ? groupSfsByTier(detail.story.sfs) : []), [detail])
  // Pending gates reuse the SF-3 resolve sheet + hook. hostId is always set once a
  // detail exists (the fetch requires it) — '' only flows into an unused store key.
  const { submitGateResolution } = useMobileGateResolve({ hostId: hostId ?? '', client })
  const [resolveGate, setResolveGate] = useState<PendingGateRow | null>(null)
  const [resolveVisible, setResolveVisible] = useState(false)
  const [ResolveSheet, setResolveSheet] =
    useState<ComponentType<MobileGateResolveSheetProps> | null>(null)
  const sheetLoadStartedRef = useRef(false)

  // Why dynamic import: same reanimated-under-test-mocks reason as the gates screen.
  const openResolveSheet = useCallback((row: PendingGateRow) => {
    setResolveGate(row)
    setResolveVisible(true)
    if (!sheetLoadStartedRef.current) {
      sheetLoadStartedRef.current = true
      void import('./MobileGateResolveSheet').then(
        (module) => setResolveSheet(() => module.MobileGateResolveSheet),
        () => {
          // Sheet chunk failed to load — close the empty dialog instead of half-mounting.
          sheetLoadStartedRef.current = false
          setResolveVisible(false)
          setResolveGate(null)
        }
      )
    }
  }, [])

  const handleResolve = useCallback(
    async (gateId: string, resolution: string) => {
      const outcome = await submitGateResolution(gateId, resolution)
      if (outcome?.kind === 'success') {
        refresh() // the gate row flips to resolved on the refetch, not on the next poll
      }
      return outcome
    },
    [submitGateResolution, refresh]
  )

  if (!detail) {
    return (
      <View style={styles.state}>
        {loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
      </View>
    )
  }

  const done = countDoneSfs(detail.story.sfs)
  const total = detail.story.sfs.length
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg + bottomInset }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.textSecondary}
            colors={[colors.textSecondary]}
          />
        }
      >
        {notFound ? (
          <StoryStaleBanner message={STALE_STORY_BANNER_TEXT} onRefresh={refresh} />
        ) : null}
        <Text style={styles.title}>
          {detail.story.title.trim().length > 0 ? detail.story.title : UNTITLED_STORY_TITLE}
        </Text>
        <View style={styles.metaRow}>
          {detail.story.epicId ? <Text style={styles.metaEpic}>{detail.story.epicId}</Text> : null}
          {detail.story.workspaceName ? (
            <Text style={styles.metaWorkspace}>{detail.story.workspaceName}</Text>
          ) : null}
        </View>
        {detail.story.destination ? (
          <Text style={styles.destination}>{detail.story.destination}</Text>
        ) : null}
        {total > 0 ? (
          <View style={styles.progress}>
            <View style={styles.progressTrack}>
              <View
                testID="progress-fill"
                style={[styles.progressFill, { width: `${Math.round((done / total) * 100)}%` }]}
              />
            </View>
            <Text style={styles.progressLabel}>{storyProgressLabel(done, total)}</Text>
          </View>
        ) : null}
        {tierGroups.map((group) => (
          <View key={group.tier}>
            <Text style={styles.sectionTitle}>{storyTierLabel(group.tier)}</Text>
            {group.sfs.map((sf) => (
              <SfRow key={sf.name} sf={sf} />
            ))}
          </View>
        ))}
        {detail.gates.length > 0 ? (
          <GateSection
            gates={detail.gates}
            onGatePress={(gate) => openResolveSheet(toPendingGateRow(gate, detail.story.storyId))}
          />
        ) : null}
      </ScrollView>
      {ResolveSheet && resolveGate ? (
        <ResolveSheet
          visible={resolveVisible}
          gate={resolveGate}
          onClose={() => setResolveVisible(false)}
          onResolve={handleResolve}
        />
      ) : null}
    </View>
  )
}

function SfRow({ sf }: { sf: SuperpowersStoryDetailSf }) {
  const depends = storyDependsLabel(sf.dependsOn)
  return (
    <View style={styles.sfRow}>
      <View style={styles.sfMain}>
        <View style={styles.sfTitleRow}>
          <Text style={styles.sfName}>{sf.name}</Text>
          <Text style={styles.sfTitle}>{sf.title}</Text>
        </View>
        {depends ? <Text style={styles.sfDepends}>{depends}</Text> : null}
      </View>
      <View testID={`sf-chip:${sf.name}`} style={styles.chip}>
        <Text style={[styles.chipText, { color: SF_STATUS_CHIP_COLORS[sf.status] }]}>
          {sfStatusLabel(sf.status)}
        </Text>
      </View>
    </View>
  )
}

function GateSection({
  gates,
  onGatePress
}: {
  gates: SuperpowersStoryDetailResult['gates']
  onGatePress: (gate: SuperpowersStoryDetailResult['gates'][number]) => void
}) {
  const pending = gates.filter((gate) => gate.status === 'pending').length
  return (
    <View style={styles.gateSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{GATES_SECTION_TITLE}</Text>
        <Text
          style={[
            styles.gatePending,
            { color: pending > 0 ? colors.statusAmber : colors.textMuted }
          ]}
        >
          {gatePendingCountLabel(pending)}
        </Text>
      </View>
      {gates.map((gate) => (
        <GateRow key={gate.gateId} gate={gate} onPress={onGatePress} />
      ))}
    </View>
  )
}

// Only pending gates are resolvable here (T9); resolved/timeout stay read-only
// (spec §3b — timeout is terminal).
function GateRow({
  gate,
  onPress
}: {
  gate: SuperpowersStoryDetailResult['gates'][number]
  onPress: (gate: SuperpowersStoryDetailResult['gates'][number]) => void
}) {
  const content = (
    <>
      <Text style={styles.gateTitle}>{gate.title}</Text>
      <View testID={`gate-chip:${gate.gateId}`} style={styles.chip}>
        <Text style={[styles.chipText, { color: GATE_STATUS_CHIP_COLORS[gate.status] }]}>
          {gateStatusLabel(gate.status)}
        </Text>
      </View>
    </>
  )
  if (gate.status !== 'pending') {
    return <View style={styles.gateRow}>{content}</View>
  }
  return (
    <Pressable
      style={styles.gateRow}
      accessibilityRole="button"
      accessibilityLabel={gate.title}
      onPress={() => onPress(gate)}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: '700'
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  metaEpic: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  metaWorkspace: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  destination: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  progress: {
    gap: spacing.xs
  },
  progressTrack: {
    height: 4,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised,
    overflow: 'hidden'
  },
  progressFill: {
    height: 4,
    borderRadius: radii.button,
    backgroundColor: colors.statusGreen
  },
  progressLabel: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm
  },
  sfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2
  },
  sfMain: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  sfTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm
  },
  sfName: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  sfTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    flexShrink: 1
  },
  sfDepends: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  chip: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  chipText: {
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  gateSection: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  gatePending: {
    fontSize: typography.metaSize
  },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2
  },
  gateTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.bodySize
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBase
  }
})
