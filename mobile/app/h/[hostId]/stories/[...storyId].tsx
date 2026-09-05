import { useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileStoryDetailScreen } from '../../../../src/superpowers/MobileStoryDetailScreen'
import { normalizeStoryDetailRouteParams } from '../../../../src/superpowers/story-detail-route'
import { colors, typography } from '../../../../src/theme/mobile-theme'
import { useHostClient } from '../../../../src/transport/client-context'

// Story detail for one host — thin route wrapper; tier/gate rendering lives in
// src/superpowers. The catch-all hands storyId back as string[] segments, so
// params must go through the normalizer (story-detail-route.ts).
export default function StoryDetailRoute() {
  const params = useLocalSearchParams<{ hostId: string; storyId?: string | string[] }>()
  const insets = useSafeAreaInsets()
  const route = normalizeStoryDetailRouteParams(params)
  const { client } = useHostClient(route.ok ? route.hostId : undefined)
  if (!route.ok) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateText}>{route.message}</Text>
      </View>
    )
  }
  return (
    <MobileStoryDetailScreen
      client={client}
      hostId={route.hostId}
      storyId={route.storyId}
      bottomInset={insets.bottom}
    />
  )
}

const styles = StyleSheet.create({
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBase
  },
  stateText: {
    color: colors.textMuted,
    fontSize: typography.bodySize
  }
})
