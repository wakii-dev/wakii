import type { SuperpowersSfStatus } from '../../shared/superpowers/story-rpc-contract'
import { getStatus } from '../linear/client'
import { getIssue } from '../linear/linear-issue-lookups'

// Shared TTL cache for BOTH story methods — repeated polls inside the window
// cost zero Linear reads (Alt 4-ii). Key = bracket `linear:` identifier.
const STATUS_TTL_MS = 30_000

type SfStatusEntry = { status: SuperpowersSfStatus; fetchedAt: number }
const statusCache = new Map<string, SfStatusEntry>()

// state.type is a plain wire string — known values map, everything else
// (incl. 'canceled', '') degrades to 'unknown', never guessed (spec rev 3).
export function mapLinearStateType(stateType: string): SuperpowersSfStatus {
  switch (stateType) {
    case 'completed':
      return 'done'
    case 'started':
      return 'in-progress'
    case 'unstarted':
    case 'backlog':
      return 'todo'
    default:
      return 'unknown'
  }
}

// getIssue already degrades per-id (auth handled, others warned + null); the
// catch keeps the contract "story methods never fail because of Linear".
async function fetchSfStatus(id: string, now: () => number): Promise<SfStatusEntry> {
  try {
    const issue = await getIssue(id)
    return { status: mapLinearStateType(issue?.state.type ?? ''), fetchedAt: now() }
  } catch {
    return { status: 'unknown', fetchedAt: now() }
  }
}

export async function readSfStatuses(
  linearIds: readonly string[],
  opts?: { now?: () => number }
): Promise<Map<string, SuperpowersSfStatus>> {
  const now = opts?.now ?? Date.now
  const result = new Map<string, SuperpowersSfStatus>()
  if (linearIds.length === 0) {
    return result
  }
  let connected: boolean
  try {
    connected = getStatus().connected
  } catch {
    connected = false
  }
  if (!connected) {
    // Not connected → 'unknown' for every id, zero Linear traffic.
    for (const id of linearIds) {
      result.set(id, 'unknown')
    }
    return result
  }
  const staleIds = [...new Set(linearIds)].filter((id) => {
    const cached = statusCache.get(id)
    if (cached && now() - cached.fetchedAt < STATUS_TTL_MS) {
      result.set(id, cached.status)
      return false
    }
    return true
  })
  await Promise.all(
    staleIds.map(async (id) => {
      const entry = await fetchSfStatus(id, now)
      statusCache.set(id, entry)
      result.set(id, entry.status)
    })
  )
  return result
}

export function resetSfStatusCacheForTests(): void {
  statusCache.clear()
}
