import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, ChevronLeft } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import { groupStoriesByWorktree, storyRowKey } from './story-list-groups'
import {
  PARSE_ERROR_ENTRY_LABEL,
  REFRESH_HINT,
  STALE_LIST_BANNER_TEXT,
  STORY_LIST_TITLE,
  storyProgressLabel
} from './story-screen-copy'
import { useMobileStoryList } from './use-mobile-story-list'
import { StoryStaleBanner } from './story-stale-banner'

type Props = {
  client: RpcClient | null
  hostId: string | undefined
  // Route layer turns this into the stories/[...storyId] push (story-detail-route.ts).
  onOpenStory: (storyId: string) => void
  bottomInset?: number
}

export function MobileStoryListScreen({ client, hostId, onOpenStory, bottomInset = 0 }: Props) {
  const router = useRouter()
  const { stories, stale, loading, refreshing, refresh } = useMobileStoryList({ client, hostId })
  const sections = useMemo(
    () =>
      groupStoriesByWorktree(stories).map((group) => ({
        key: group.key,
        title: group.title,
        data: group.stories
      })),
    [stories]
  )

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    )
  }
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
          <Text style={styles.heading}>{STORY_LIST_TITLE}</Text>
          <Text style={styles.subheading} numberOfLines={1}>
            Stories across this host's worktrees
          </Text>
        </View>
      </View>
      {stale ? (
        // Failed poll — the last good list keeps rendering under the banner.
        <View style={styles.bannerWrap}>
          <StoryStaleBanner message={STALE_LIST_BANNER_TEXT} onRefresh={refresh} />
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(story) => storyRowKey(story)}
        ListEmptyComponent={
          // Empty path (cold start, first fetch failed with no cache) keeps the
          // SectionList mounted so pull-to-refresh still works.
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{REFRESH_HINT}</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, { paddingBottom: spacing.lg + bottomInset }]}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => <StoryRow story={item} onOpenStory={onOpenStory} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.textSecondary}
            colors={[colors.textSecondary]}
          />
        }
      />
    </SafeAreaView>
  )
}

function StoryRow({
  story,
  onOpenStory
}: {
  story: SuperpowersStoryListItem
  onOpenStory: (storyId: string) => void
}) {
  // A parseError row has no valid detail behind it — the flag replaces progress
  // and tapping is disabled instead of navigating to a broken screen.
  return (
    <Pressable
      testID={`story-row:${storyRowKey(story)}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={story.parseError}
      onPress={() => onOpenStory(story.storyId)}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {story.title}
        </Text>
        <View style={styles.rowMeta}>
          {story.epicId ? <Text style={styles.rowEpic}>{story.epicId}</Text> : null}
          {story.parseError ? (
            <Text style={styles.rowFlag}>{PARSE_ERROR_ENTRY_LABEL}</Text>
          ) : (
            <Text style={styles.rowProgress}>
              {storyProgressLabel(story.sfDone, story.sfTotal)}
            </Text>
          )}
        </View>
      </View>
      {story.pendingGates > 0 && (
        <View style={styles.gateBadge} accessibilityLabel={`${story.pendingGates} pending gates`}>
          <Bell size={12} color={colors.statusAmber} />
          <Text style={styles.gateBadgeText}>{story.pendingGates}</Text>
        </View>
      )}
    </Pressable>
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
  list: {
    paddingTop: spacing.sm
  },
  bannerWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase
  },
  sectionTitle: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm
  },
  rowPressed: {
    backgroundColor: colors.bgRaised
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize
  },
  rowMeta: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  rowEpic: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  rowProgress: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  rowFlag: {
    color: colors.statusRed,
    fontSize: typography.metaSize
  },
  gateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  gateBadgeText: {
    color: colors.statusAmber,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bgBase
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.bodySize
  }
})
