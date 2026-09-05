import { useLocalSearchParams } from 'expo-router'
import { MobilePendingGatesScreen } from '../../../src/superpowers/MobilePendingGatesScreen'

export default function MobileGatesRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  if (!hostId) {
    return null
  }
  return <MobilePendingGatesScreen hostId={hostId} />
}
