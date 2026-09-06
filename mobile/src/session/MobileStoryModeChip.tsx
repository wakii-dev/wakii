import { Text, Pressable } from 'react-native'
import { BookOpen } from 'lucide-react-native'

import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'

// Why: buffered-input affordance — ON means the composed text is sent wrapped
// as a create-story prompt instead of a raw terminal command.
export function MobileStoryModeChip({
  active,
  onToggle
}: {
  active: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      style={[styles.storyModeChip, active && styles.storyModeChipActive]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel="Story mode"
      accessibilityHint={
        active
          ? 'Story mode is on — send wraps the text as a create-story prompt'
          : 'Wraps the composed text as a create-story prompt for the desktop agent'
      }
    >
      <BookOpen size={13} color={active ? colors.onAccent : colors.textSecondary} strokeWidth={2} />
      <Text style={[styles.storyModeChipText, active && styles.storyModeChipTextActive]}>
        Story
      </Text>
    </Pressable>
  )
}
