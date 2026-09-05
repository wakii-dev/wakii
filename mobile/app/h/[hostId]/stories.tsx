import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileStoryListScreen } from '../../../src/superpowers/MobileStoryListScreen'
import { createStoryDetailHref } from '../../../src/superpowers/story-detail-route'
import { useHostClient } from '../../../src/transport/client-context'

// Story list for one host — thin route wrapper; grouping/data logic lives in src/superpowers.
export default function StoryListRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { client } = useHostClient(hostId)
  return (
    <MobileStoryListScreen
      client={client}
      hostId={hostId}
      bottomInset={insets.bottom}
      onOpenStory={(storyId) => {
        if (!hostId) {
          return
        }
        router.push(createStoryDetailHref({ hostId, storyId }))
      }}
    />
  )
}
