// Why: persist the story list/detail so cold-start / resume-from-kill paints the last
// known data instantly (Alt 3-B), then updates in place when fresh RPC data
// arrives. A failed refresh never clears this — staleness lives in hook state.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  SuperpowersStoryDetailResult,
  SuperpowersStoryListItem
} from '../../../src/shared/superpowers/story-rpc-contract'

const STORAGE_KEY = 'orca:story-screen:v1'
const WRITE_THROTTLE_MS = 250

export type StoryListSnapshot = {
  stories: SuperpowersStoryListItem[]
  savedAt: number
}

export type StoryDetailSnapshot = {
  detail: SuperpowersStoryDetailResult
  savedAt: number
}

type StoryScreenSnapshot = {
  lists: Record<string, StoryListSnapshot>
  details?: Record<string, StoryDetailSnapshot>
}

let memoryCache: StoryScreenSnapshot | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

// Lookup is always key-build-then-read — the composite is never parsed back, so
// ':' inside hostId or storyId cannot collide.
function detailCacheKey(hostId: string, storyId: string): string {
  return `${hostId}:${storyId}`
}

async function readScreenSnapshot(): Promise<StoryScreenSnapshot | null> {
  if (memoryCache) {
    return memoryCache
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as StoryScreenSnapshot
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.lists !== 'object' ||
      parsed.lists === null
    ) {
      return null
    }
    memoryCache = parsed
    return parsed
  } catch {
    return null
  }
}

export async function loadStoryListSnapshot(hostId: string): Promise<StoryListSnapshot | null> {
  const snapshot = await readScreenSnapshot()
  return snapshot ? readValidList(snapshot, hostId) : null
}

export async function loadStoryDetailSnapshot(
  hostId: string,
  storyId: string
): Promise<StoryDetailSnapshot | null> {
  const snapshot = await readScreenSnapshot()
  return snapshot ? readValidDetail(snapshot, detailCacheKey(hostId, storyId)) : null
}

// Why: throttle writes so polls and pull-to-refresh don't hammer AsyncStorage
// (pattern home-snapshot-cache).
export function saveStoryListSnapshot(hostId: string, stories: SuperpowersStoryListItem[]): void {
  const snapshot: StoryScreenSnapshot = {
    lists: { ...memoryCache?.lists, [hostId]: { stories, savedAt: Date.now() } },
    details: memoryCache?.details
  }
  memoryCache = snapshot
  scheduleFlush()
}

export function saveStoryDetailSnapshot(
  hostId: string,
  storyId: string,
  detail: SuperpowersStoryDetailResult
): void {
  const snapshot: StoryScreenSnapshot = {
    lists: memoryCache?.lists ?? {},
    details: {
      ...memoryCache?.details,
      [detailCacheKey(hostId, storyId)]: { detail, savedAt: Date.now() }
    }
  }
  memoryCache = snapshot
  scheduleFlush()
}

function scheduleFlush(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }
  writeTimer = setTimeout(() => {
    writeTimer = null
    void flushSnapshot(memoryCache)
  }, WRITE_THROTTLE_MS)
}

async function flushSnapshot(memory: StoryScreenSnapshot | null): Promise<void> {
  if (!memory) {
    return
  }
  try {
    // Why: memory may only hold entries saved this session — replacing storage wholesale
    // would drop snapshots persisted by earlier sessions that were never loaded.
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const onDisk = raw ? (JSON.parse(raw) as StoryScreenSnapshot) : null
    const merged: StoryScreenSnapshot = {
      lists: {
        ...(onDisk && typeof onDisk === 'object' && onDisk.lists ? onDisk.lists : {}),
        ...memory.lists
      },
      details: {
        ...(onDisk && typeof onDisk === 'object' && onDisk.details ? onDisk.details : {}),
        ...memory.details
      }
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // Persisted cache is best-effort; the in-memory snapshot stays authoritative.
  }
}

function readValidList(snapshot: StoryScreenSnapshot, hostId: string): StoryListSnapshot | null {
  const entry = snapshot.lists[hostId]
  return entry && Array.isArray(entry.stories) ? entry : null
}

// Tolerant like the list read: only the minimum shape is checked — old or partial
// payloads without `details`, or entries missing `detail.story`, just read as null.
function readValidDetail(snapshot: StoryScreenSnapshot, key: string): StoryDetailSnapshot | null {
  const entry = snapshot.details?.[key]
  return entry &&
    entry.detail &&
    typeof entry.detail.story === 'object' &&
    entry.detail.story !== null
    ? entry
    : null
}
