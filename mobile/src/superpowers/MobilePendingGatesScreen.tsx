import { useCallback, useRef, useState, type ComponentType } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, RefreshCw } from 'lucide-react-native'
import { useHostClient } from '../transport/host-client-hooks'
import { colors, spacing } from '../theme/mobile-theme'
import { gateResolveErrorHandling, type GateResolveErrorTone } from './gate-resolve-errors'
import type { PendingGateRow } from './pending-gates-store'
import type { MobileGateResolveSheetProps } from './MobileGateResolveSheet'
import { useMobileGateResolve } from './use-mobile-gate-resolve'
import { useMobilePendingGates } from './use-mobile-pending-gates'

// T3 seam: rows invoke this optional callback before the built-in resolve sheet opens.
export type MobilePendingGatesScreenProps = {
  hostId: string
  onGatePress?: (gate: PendingGateRow) => void
}

function formatGateCreatedAt(createdAt: number): string | null {
  if (!createdAt) {
    return null
  }
  return new Date(createdAt).toLocaleString()
}

type ScreenNotice = { message: string; tone: GateResolveErrorTone }

export function MobilePendingGatesScreen({ hostId, onGatePress }: MobilePendingGatesScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { client, state: connState } = useHostClient(hostId)
  const { sections, unavailable, lastSweepAt, refreshing, refresh } = useMobilePendingGates({
    hostId,
    client,
    connected: connState === 'connected'
  })
  const connected = connState === 'connected'
  const { submitGateResolution } = useMobileGateResolve({ hostId, client })
  const [resolveGate, setResolveGate] = useState<PendingGateRow | null>(null)
  const [resolveVisible, setResolveVisible] = useState(false)
  const [notice, setNotice] = useState<ScreenNotice | null>(null)
  const [ResolveSheet, setResolveSheet] =
    useState<ComponentType<MobileGateResolveSheetProps> | null>(null)
  const sheetLoadStartedRef = useRef(false)

  // Outcome plumbing (plan D7): the resolve hook owns store removal; the screen adds
  // the background sweep on settled-elsewhere races and a transient notice for
  // outcomes landing after the sheet was dismissed. Notice clears on refresh or the
  // next gate open (app pattern — no toast system).
  // resolveVisibleRef is written at the open/close transition sites, not during
  // render — an outcome landing between onClose's setState and the re-render commit
  // must already see the sheet as closed (review T4 P2).
  const resolveVisibleRef = useRef(false)
  const connectedRef = useRef(connected)
  connectedRef.current = connected

  const handleResolve = useCallback(
    async (gateId: string, resolution: string) => {
      const outcome = await submitGateResolution(gateId, resolution)
      if (!outcome || outcome.kind === 'success') {
        if (outcome) {
          setNotice(null)
        }
        return outcome
      }
      const handling = gateResolveErrorHandling(outcome)
      // Sweep only while connected — a dropped socket would fail the sweep and
      // mis-flag the host unavailable; reconnect re-sweeps.
      if (handling.refreshAfter && connectedRef.current) {
        refresh()
      }
      if (!resolveVisibleRef.current) {
        setNotice({ message: handling.message, tone: handling.tone })
      }
      return outcome
    },
    [submitGateResolution, refresh]
  )

  const handleRefresh = useCallback(() => {
    setNotice(null)
    refresh()
  }, [refresh])

  // Why dynamic import: the sheet pulls BottomDrawer → reanimated, which cannot
  // evaluate under the react-native test mocks (no TurboModuleRegistry) — a static
  // import here would break the screen tests. Metro resolves it normally on device.
  const openResolveSheet = useCallback((row: PendingGateRow) => {
    setResolveGate(row)
    resolveVisibleRef.current = true
    setResolveVisible(true)
    setNotice(null)
    if (!sheetLoadStartedRef.current) {
      sheetLoadStartedRef.current = true
      void import('./MobileGateResolveSheet').then(
        (module) => setResolveSheet(() => module.MobileGateResolveSheet),
        () => {
          // Sheet chunk failed to load — close the empty dialog instead of half-mounting.
          sheetLoadStartedRef.current = false
          resolveVisibleRef.current = false
          setResolveVisible(false)
          setResolveGate(null)
        }
      )
    }
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.heading}>Gates</Text>
          <Text style={styles.subheading} numberOfLines={1}>
            Pending decision gates on this host
          </Text>
        </View>
        <Pressable
          style={styles.iconButton}
          onPress={handleRefresh}
          disabled={!client || refreshing || !connected}
          accessibilityRole="button"
          accessibilityLabel="Refresh gates"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <RefreshCw size={18} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        {notice ? (
          <View style={styles.banner}>
            <Text style={notice.tone === 'info' ? styles.infoBannerText : styles.bannerText}>
              {notice.message}
            </Text>
          </View>
        ) : null}
        {unavailable ? (
          <View style={styles.banner}>
            {/* Distinct copy/tones (review T2 P2#4): a past successful sweep proves the
                host HAS gate sync, so a later unavailable is transient; never-swept is
                the old-desktop case. */}
            <Text style={lastSweepAt === null ? styles.bannerText : styles.infoBannerText}>
              {lastSweepAt === null
                ? 'Gate list unavailable — this host runs an older Orca desktop without gate sync. Update the desktop app.'
                : "Couldn't refresh the gate list — pull to retry."}
            </Text>
          </View>
        ) : null}
        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, index) => (
                <Pressable
                  key={row.gateId}
                  style={[styles.row, index > 0 && styles.rowBordered]}
                  onPress={() => {
                    onGatePress?.(row)
                    openResolveSheet(row)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={row.title}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {row.title}
                  </Text>
                  {formatGateCreatedAt(row.createdAt) ? (
                    <Text style={styles.rowMeta}>{formatGateCreatedAt(row.createdAt)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        {!unavailable && sections.length === 0 ? (
          <Text style={styles.emptyText}>
            {connected ? 'No pending gates' : 'Connecting to host…'}
          </Text>
        ) : null}
      </ScrollView>

      {ResolveSheet && resolveGate ? (
        <ResolveSheet
          visible={resolveVisible}
          gate={resolveGate}
          onClose={() => {
            resolveVisibleRef.current = false
            setResolveVisible(false)
          }}
          onResolve={handleResolve}
        />
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm
  },
  backButton: {
    padding: spacing.xs
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600'
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: 12
  },
  iconButton: {
    padding: spacing.xs
  },
  scroll: {
    paddingHorizontal: spacing.md
  },
  banner: {
    backgroundColor: colors.bgRaised,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  bannerText: {
    color: colors.statusAmber,
    fontSize: 13
  },
  infoBannerText: {
    color: colors.textSecondary,
    fontSize: 13
  },
  section: {
    marginBottom: spacing.lg
  },
  sectionHeader: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.sm
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 6
  },
  row: {
    padding: spacing.md,
    gap: 2
  },
  rowBordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 14
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl
  }
})
