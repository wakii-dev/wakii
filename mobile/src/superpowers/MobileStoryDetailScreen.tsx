import { useMemo } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type {
  SuperpowersSfStatus,
  SuperpowersStoryDetailResult,
  SuperpowersStoryDetailSf
} from '../../../src/shared/superpowers/story-rpc-contract'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import {
  GATES_SECTION_TITLE,
  UNTITLED_STORY_TITLE,
  gatePendingCountLabel,
  gateStatusLabel,
  sfStatusLabel,
  storyDependsLabel,
  storyProgressLabel,
  storyTierLabel
} from './story-screen-copy'
import { countDoneSfs, groupSfsByTier } from './story-detail-tiers'
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

export function MobileStoryDetailScreen({ client, hostId, storyId, bottomInset = 0 }: Props) {
  // notFound/stale banners are T9 — T6 keeps those states visually neutral and
  // renders the detail whenever one exists (cached copy included).
  const { detail, loading, refreshing, refresh } = useMobileStoryDetail({ client, hostId, storyId })
  const tierGroups = useMemo(() => (detail ? groupSfsByTier(detail.story.sfs) : []), [detail])

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
        {detail.gates.length > 0 ? <GateSection gates={detail.gates} /> : null}
      </ScrollView>
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

function GateSection({ gates }: { gates: SuperpowersStoryDetailResult['gates'] }) {
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
        <View key={gate.gateId} style={styles.gateRow}>
          <Text style={styles.gateTitle}>{gate.title}</Text>
          <View testID={`gate-chip:${gate.gateId}`} style={styles.chip}>
            <Text style={[styles.chipText, { color: GATE_STATUS_CHIP_COLORS[gate.status] }]}>
              {gateStatusLabel(gate.status)}
            </Text>
          </View>
        </View>
      ))}
    </View>
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
