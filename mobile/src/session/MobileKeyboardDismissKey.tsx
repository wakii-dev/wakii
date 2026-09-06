import { View, Pressable } from 'react-native'
import { ChevronDown, Keyboard as KeyboardIcon } from 'lucide-react-native'

import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'

// Why: fixed keyboard escape hatch; outside ScrollView + shortcut path so it can't scroll away or be hidden (#5106).
export function MobileKeyboardDismissKey({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.keyboardDismissKey, pressed && styles.accessoryKeyPressed]}
      onPress={onDismiss}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Dismiss keyboard"
      accessibilityHint="Hides the software keyboard and keeps the current terminal session open."
    >
      <View style={styles.keyboardDismissGlyph}>
        <KeyboardIcon size={15} color={colors.textSecondary} strokeWidth={2} />
        <ChevronDown
          size={10}
          color={colors.textSecondary}
          strokeWidth={2.5}
          style={styles.keyboardDismissChevron}
        />
      </View>
    </Pressable>
  )
}
