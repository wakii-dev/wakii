/** Recent file-search queries persisted to localStorage (most recent first). */
export const SEARCH_HISTORY_STORAGE_KEY = 'wakii.file-search-history'
export const SEARCH_HISTORY_MAX = 10

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadSearchHistory(storage: MinimalStorage): string[] {
  let raw: string | null = null
  try {
    raw = storage.getItem(SEARCH_HISTORY_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

export function saveSearchHistory(storage: MinimalStorage, history: readonly string[]): void {
  try {
    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // localStorage can be full or blocked — history is best-effort only.
  }
}

/** Prepends the query (deduped, trimmed); keeps at most SEARCH_HISTORY_MAX entries. */
export function recordSearchQuery(
  history: readonly string[],
  query: string,
  max: number = SEARCH_HISTORY_MAX
): string[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return [...history]
  }
  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, max)
}
