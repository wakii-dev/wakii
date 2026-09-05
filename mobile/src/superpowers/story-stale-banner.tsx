import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { STALE_STORY_BANNER_TEXT, STALE_STORY_REFRESH_ACTION } from './story-screen-copy'

// Shared warn banner for both story screens: the list's failed poll (stale flag,
// T3) and the detail's story_not_found answer (T4). Cached content keeps
// rendering underneath — the banner never replaces data. Existing tokens only.
export function StoryStaleBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.message}>{STALE_STORY_BANNER_TEXT}</Text>
      <Pressable
        testID="stale-banner-refresh"
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        onPress={onRefresh}
        accessibilityRole="button"
        accessibilityLabel={STALE_STORY_REFRESH_ACTION}
      >
        <Text style={styles.actionText}>{STALE_STORY_REFRESH_ACTION}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.statusAmber,
    borderRadius: radii.row,
    padding: spacing.md
  },
  message: {
    flex: 1,
    color: colors.statusAmber,
    fontSize: typography.metaSize
  },
  action: {
    backgroundColor: colors.bgPanel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  actionPressed: {
    backgroundColor: colors.bgRaised
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  }
})
