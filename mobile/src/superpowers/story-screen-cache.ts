// Why: persist the story list so cold-start / resume-from-kill paints the last
// known list instantly (Alt 3-B), then updates in place when fresh RPC data
// arrives. A failed refresh never clears this — staleness lives in hook state.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SuperpowersStoryListItem } from '../../../src/shared/superpowers/story-rpc-contract'

const STORAGE_KEY = 'orca:story-screen:v1'
const WRITE_THROTTLE_MS = 250

export type StoryListSnapshot = {
  stories: SuperpowersStoryListItem[]
  savedAt: number
}

type StoryScreenSnapshot = {
  lists: Record<string, StoryListSnapshot>
}

let memoryCache: StoryScreenSnapshot | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

export async function loadStoryListSnapshot(hostId: string): Promise<StoryListSnapshot | null> {
  if (memoryCache) {
    return readValidList(memoryCache, hostId)
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
    return readValidList(parsed, hostId)
  } catch {
    return null
  }
}

// Why: throttle writes so polls and pull-to-refresh don't hammer AsyncStorage
// (pattern home-snapshot-cache).
export function saveStoryListSnapshot(hostId: string, stories: SuperpowersStoryListItem[]): void {
  const snapshot: StoryScreenSnapshot = {
    lists: { ...memoryCache?.lists, [hostId]: { stories, savedAt: Date.now() } }
  }
  memoryCache = snapshot
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
    // Why: memory may only hold hosts saved this session — replacing storage wholesale
    // would drop snapshots persisted by earlier sessions that were never loaded.
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const onDisk = raw ? (JSON.parse(raw) as StoryScreenSnapshot) : null
    const merged: StoryScreenSnapshot = {
      lists: {
        ...(onDisk && typeof onDisk === 'object' && onDisk.lists ? onDisk.lists : {}),
        ...memory.lists
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
