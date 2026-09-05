import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SuperpowersStoryDetailResult } from '../../../src/shared/superpowers/story-rpc-contract'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { GATES_SECTION_TITLE, gatePendingCountLabel, gateStatusLabel } from './story-screen-copy'
import type { PendingGateRow } from './pending-gates-store'

// Contract gate → sheet row (T9): detail responses always carry options, and the
// storyId mapping mirrors the sweep reconcile's storyLinked rule in pending-gates-store.
export function toPendingGateRow(
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

// Distinct existing tokens per status — mirrors SF_STATUS_CHIP_COLORS in the detail screen.
const GATE_STATUS_CHIP_COLORS: Record<
  SuperpowersStoryDetailResult['gates'][number]['status'],
  string
> = {
  pending: colors.statusAmber,
  resolved: colors.statusGreen,
  timeout: colors.textMuted
}

export function GateSection({
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
  gateSection: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm
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
  chip: {
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  chipText: {
    fontSize: typography.metaSize,
    fontWeight: '600'
  }
})
