// linear-state — (c) Linear issue state cho panel chat.
//
// linearState(issueId) → {identifier, title, state, url, updatedAt}
// - Gọi `orca linear issue <id> --json` qua spawnSync, bọc trong bin
//   linear-rate-limit (`run`) — lỗi khớp signature rate-limit → exit 3.
// - FAIL-OPEN: Linear lỗi bất kỳ (rate-limit, exit khác, JSON hỏng, spawn lỗi)
//   → {state:'unavailable', reason} — KHÔNG crash.
// - Cache in-memory 60s theo issueId để pollPanel không gọi Linear mỗi nhịp.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE_LIMIT_BIN = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'bin', 'linear-rate-limit')
const CACHE_TTL_MS = 60_000
const cache = new Map()

export function linearState(issueId, opts = {}) {
  const now = opts.now ?? Date.now
  const spawn = opts.spawnSync ?? defaultSpawn
  const hit = cache.get(issueId)
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = fetchLinearState(issueId, spawn)
  if (value.state !== 'unavailable') cache.set(issueId, { at: now(), value }) // lỗi không cache — poll kế thử lại
  return value
}

export function clearLinearStateCache() {
  cache.clear()
}

function defaultSpawn(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000 })
}

function fetchLinearState(issueId, spawn) {
  if (!issueId || typeof issueId !== 'string') return unavailable('missing-issue-id')
  // Đang cooldown rate-limit máy-level → không gọi Linear
  if (isRateLimited(spawn)) return unavailable('rate-limited')
  let res
  try {
    res = spawn(RATE_LIMIT_BIN, ['run', '--bin', 'linear-state', '--', 'orca', 'linear', 'issue', issueId, '--json'])
  } catch {
    return unavailable('spawn-failed')
  }
  // Bin rate-limit không có trên đĩa (kit mới port) → gọi thẳng orca
  if (res && res.error && res.error.code === 'ENOENT') {
    try {
      res = spawn('orca', ['linear', 'issue', issueId, '--json'])
    } catch {
      return unavailable('spawn-failed')
    }
  }
  if (!res || res.error || res.status !== 0) {
    return unavailable(res && res.status === 3 ? 'rate-limited' : `exit-${res && typeof res.status === 'number' ? res.status : 'unknown'}`)
  }
  let payload
  try {
    payload = JSON.parse(res.stdout)
  } catch {
    return unavailable('bad-json')
  }
  const issue = payload && payload.ok && payload.result ? payload.result.issue : null
  if (!issue) return unavailable('no-issue')
  return {
    identifier: issue.identifier ?? issueId,
    title: issue.title ?? '',
    state: typeof issue.state === 'object' && issue.state !== null ? issue.state.name : (issue.state ?? 'unknown'),
    url: issue.url ?? '',
    updatedAt: issue.updatedAt ?? null,
  }
}

function isRateLimited(spawn) {
  try {
    const res = spawn(RATE_LIMIT_BIN, ['check'])
    return Boolean(res && res.status === 3)
  } catch {
    return false
  }
}

function unavailable(reason) {
  return { state: 'unavailable', reason }
}
