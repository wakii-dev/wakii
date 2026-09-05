import AsyncStorage from '@react-native-async-storage/async-storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storyListHappyPath, storyListWithParseError } from './story-rpc-fixtures'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn()
  }
}))

// Module state (memory cache + pending throttle timer) must be fresh per test.
async function importCache(): Promise<typeof import('./story-screen-cache')> {
  return await import('./story-screen-cache')
}

describe('story screen cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(AsyncStorage.getItem).mockReset()
    vi.mocked(AsyncStorage.setItem).mockReset()
    vi.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads a persisted snapshot for the host', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ lists: { 'host-1': { stories: storyListHappyPath.stories, savedAt: 7 } } })
    )
    const { loadStoryListSnapshot } = await importCache()

    const snapshot = await loadStoryListSnapshot('host-1')

    expect(snapshot).toEqual({ stories: storyListHappyPath.stories, savedAt: 7 })
  })

  it('returns null for an unknown host in a persisted snapshot', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ lists: { 'host-1': { stories: storyListHappyPath.stories, savedAt: 7 } } })
    )
    const { loadStoryListSnapshot } = await importCache()

    await expect(loadStoryListSnapshot('host-2')).resolves.toBeNull()
  })

  it('returns null when nothing is persisted, on corrupt JSON, and on wrong shape', async () => {
    // None of these failure paths populate the memory cache, so each load re-reads storage.
    const { loadStoryListSnapshot } = await importCache()

    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    await expect(loadStoryListSnapshot('host-1')).resolves.toBeNull()

    vi.mocked(AsyncStorage.getItem).mockResolvedValue('{not json')
    await expect(loadStoryListSnapshot('host-1')).resolves.toBeNull()

    vi.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({ something: 'else' }))
    await expect(loadStoryListSnapshot('host-1')).resolves.toBeNull()
  })

  it('serves from memory after a save without touching AsyncStorage', async () => {
    const { loadStoryListSnapshot, saveStoryListSnapshot } = await importCache()
    saveStoryListSnapshot('host-1', storyListHappyPath.stories)

    const snapshot = await loadStoryListSnapshot('host-1')

    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(snapshot?.stories).toEqual(storyListHappyPath.stories)
  })

  it('throttles persisted writes to the latest snapshot', async () => {
    const { saveStoryListSnapshot } = await importCache()
    saveStoryListSnapshot('host-1', storyListHappyPath.stories)
    saveStoryListSnapshot('host-1', storyListWithParseError.stories)
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(vi.mocked(AsyncStorage.setItem).mock.calls[0][1]))
    expect(payload.lists['host-1'].stories).toEqual(storyListWithParseError.stories)
    expect(typeof payload.lists['host-1'].savedAt).toBe('number')
  })

  it('merges over storage at flush time so saving one host never drops another', async () => {
    // Prior session persisted host-b; this session saves host-a without ever loading.
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({
        lists: { 'host-b': { stories: storyListWithParseError.stories, savedAt: 3 } }
      })
    )
    const { saveStoryListSnapshot } = await importCache()
    saveStoryListSnapshot('host-a', storyListHappyPath.stories)

    await vi.advanceTimersByTimeAsync(250)

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(vi.mocked(AsyncStorage.setItem).mock.calls[0][1]))
    expect(payload.lists['host-a'].stories).toEqual(storyListHappyPath.stories)
    expect(payload.lists['host-b'].stories).toEqual(storyListWithParseError.stories)
  })

  it('keeps hosts isolated inside one versioned key', async () => {
    const { saveStoryListSnapshot } = await importCache()
    saveStoryListSnapshot('host-1', storyListHappyPath.stories)
    await vi.advanceTimersByTimeAsync(250)

    const storageKey = String(vi.mocked(AsyncStorage.setItem).mock.calls[0][0])
    expect(storageKey).toBe('orca:story-screen:v1')

    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      String(vi.mocked(AsyncStorage.setItem).mock.calls[0][1])
    )
    vi.resetModules()
    const reloaded = await importCache()
    await expect(reloaded.loadStoryListSnapshot('host-1')).resolves.toMatchObject({
      stories: storyListHappyPath.stories
    })
    await expect(reloaded.loadStoryListSnapshot('host-2')).resolves.toBeNull()
  })
})
