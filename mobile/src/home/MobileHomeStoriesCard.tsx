import { BookOpen, ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing } from '../theme/mobile-theme'

export function MobileHomeStoriesCard(props: {
  enabled: boolean
  hostName: string | null
  onOpen: () => void
}) {
  return (
    <Pressable
      disabled={!props.enabled}
      style={({ pressed }) => [
        styles.card,
        !props.enabled && styles.cardDisabled,
        pressed && styles.cardPressed
      ]}
      onPress={() => props.onOpen()}
    >
      <View style={styles.icon}>
        <BookOpen size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.main}>
        <Text style={styles.title}>Stories</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {props.hostName ? `Stories on ${props.hostName}` : 'No desktop connected'}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    minHeight: 72,
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingVertical: 12
  },
  cardDisabled: { opacity: 0.45 },
  cardPressed: { backgroundColor: colors.bgRaised },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3 }
})
