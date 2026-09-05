import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { ArrowUp } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { gateResolveErrorHandling, type GateResolveErrorTone } from './gate-resolve-errors'
import type { GateResolveOutcome } from './gate-resolve-request'
import type { PendingGateRow } from './pending-gates-store'

export type MobileGateResolveSheetProps = {
  visible: boolean
  gate: PendingGateRow | null
  onClose: () => void
  onResolve: (gateId: string, resolution: string) => Promise<GateResolveOutcome | null>
}

// Resolve sheet for one gate (plan D2/D8): known options → choice buttons only;
// unknown/empty options → multiline free text. Every send passes an unconditional
// confirm Alert — Cancel never reaches the wire (decision #6, no bypass setting).
export function MobileGateResolveSheet({
  visible,
  gate,
  onClose,
  onResolve
}: MobileGateResolveSheetProps) {
  // Own copy at open time: a gate removed from the store mid-dialog must not crash
  // or blank the dialog; submitting a removed gate still proceeds (the server's
  // pending guard decides the outcome).
  const [gateSnapshot, setGateSnapshot] = useState<PendingGateRow | null>(() =>
    visible ? gate : null
  )
  const [resolutionText, setResolutionText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null)
  const [outcomeTone, setOutcomeTone] = useState<GateResolveErrorTone>('warning')
  const submittingRef = useRef(false)

  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setGateSnapshot(gate)
      setResolutionText('')
      setOutcomeMessage(null)
      setOutcomeTone('warning')
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (!gateSnapshot) {
    return null
  }

  const hasOptions = gateSnapshot.optionsKnown && gateSnapshot.options.length > 0
  const trimmedResolution = resolutionText.trim()

  const submit = async (resolution: string): Promise<void> => {
    if (submittingRef.current) {
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    try {
      const outcome = await onResolve(gateSnapshot.gateId, resolution)
      if (outcome?.kind === 'success') {
        onClose()
        return
      }
      if (outcome === null) {
        setOutcomeTone('warning')
        setOutcomeMessage('Resolve did not start — try again.')
        return
      }
      const handling = gateResolveErrorHandling(outcome)
      setOutcomeTone(handling.tone)
      setOutcomeMessage(handling.message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const confirmAndSubmit = (resolution: string): void => {
    Alert.alert(gateSnapshot.title, `Send this resolution?\n"${resolution}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: () => void submit(resolution) }
    ])
  }

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title} numberOfLines={2}>
          {gateSnapshot.title}
        </Text>
        {hasOptions ? (
          <View style={styles.options}>
            {gateSnapshot.options.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`Resolve: ${option}`}
                style={({ pressed }) => [styles.option, pressed && !submitting && styles.pressed]}
                onPress={() => confirmAndSubmit(option)}
                disabled={submitting}
              >
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.freeTextRow}>
            <TextInput
              style={styles.freeInput}
              value={resolutionText}
              onChangeText={setResolutionText}
              placeholder="Type your resolution…"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accentBlue}
              editable={!submitting}
              multiline
            />
            <Pressable
              accessibilityLabel="Submit resolution"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.freeSend,
                (submitting || trimmedResolution.length === 0) && styles.freeSendDisabled,
                pressed && trimmedResolution.length > 0 && !submitting && styles.pressed
              ]}
              onPress={() => confirmAndSubmit(trimmedResolution)}
              disabled={submitting || trimmedResolution.length === 0}
            >
              <ArrowUp
                size={18}
                color={trimmedResolution.length > 0 ? colors.bgBase : colors.textMuted}
                strokeWidth={2.6}
              />
            </Pressable>
          </View>
        )}
        {submitting ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
        {outcomeMessage ? (
          <Text style={outcomeTone === 'info' ? styles.outcomeInfoText : styles.outcomeText}>
            {outcomeMessage}
          </Text>
        ) : null}
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.bodySize + 2,
    fontWeight: '600',
    lineHeight: typography.bodySize + 8
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  optionText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  freeTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm
  },
  freeInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: colors.textPrimary,
    fontSize: typography.bodySize + 1,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm
  },
  freeSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentBlue
  },
  freeSendDisabled: {
    backgroundColor: colors.bgRaised
  },
  pressed: {
    opacity: 0.7
  },
  outcomeText: {
    color: colors.statusAmber,
    fontSize: typography.metaSize
  },
  outcomeInfoText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize
  }
})
