// Race/serialization unit test cho 2 đường wake Captain (SF-2 · FI-89, P1-2):
// 🔔 wake cmd + tin CEO auto-wake DÙNG CHUNG 1 in-flight set — check-AND-set
// trước launch, clear trong finally → race chỉ spawn 1 Captain. Live không tái
// lập được race → unit test là exit criterion (SF-2 acceptance #2).
// Chạy: node tests/wake-floating-race-tests.mjs
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const { wakeRoomCaptain, floatingCaptainBrief } = await import(
  pathToFileURL(join(pluginRoot, 'main.mjs'))
)

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}`) }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`) }
}

const TEXT_MAX = 4096 // khớp schema host: agent.launchFloating params.prompt.max

function makeDeps({ wt = '', resolveDelay = 0, launchError = null } = {}) {
  const calls = { floating: [], spawn: [] }
  const inFlight = new Set()
  const deps = {
    inFlight,
    resolveWorktree: async () => {
      if (resolveDelay) await new Promise((r) => setTimeout(r, resolveDelay))
      return wt
    },
    launchFloating: async (params) => {
      if (launchError) throw launchError
      calls.floating.push(params)
      return { terminalId: 'term_test_' + calls.floating.length }
    },
    spawnWorktree: async (room, path) => { calls.spawn.push({ room, wt: path }) },
    log: () => {},
  }
  return { deps, calls, inFlight }
}

// 1 — room không worktree → floating, KHÔNG spawn bin, KHÔNG rơi wts[0]
{
  const { deps, calls } = makeDeps()
  const r = await wakeRoomCaptain('general', deps)
  ok('room không wt → trả {floating:true}', r && r.floating === true, JSON.stringify(r))
  ok('đúng 1 lệnh agent.launchFloating', calls.floating.length === 1, String(calls.floating.length))
  ok('không gọi team-captain-spawn', calls.spawn.length === 0, String(calls.spawn.length))
  const p = calls.floating[0] || {}
  ok('params.agent = claude', p.agent === 'claude', JSON.stringify(p.agent))
  ok("params.title = 'Captain #general'", p.title === 'Captain #general', JSON.stringify(p.title))
  ok('brief đi qua param prompt (composer-wait)', typeof p.prompt === 'string' && p.prompt.length > 0)
}

// 2 — race: 2 đường wake đồng thời cùng room → chỉ 1 launch
{
  const { deps, calls } = makeDeps({ resolveDelay: 25 })
  const [a, b] = await Promise.all([
    wakeRoomCaptain('general', deps),
    wakeRoomCaptain('general', deps),
  ])
  ok('race 2 đường → đúng 1 launch', calls.floating.length === 1, String(calls.floating.length))
  ok('đường thắng trả {floating:true}', a && a.floating === true)
  ok('đường thua trả null (no-op)', b === null, JSON.stringify(b))
}

// 3 — room CÓ worktree → giữ đường spawn bin, không floating
{
  const { deps, calls } = makeDeps({ wt: 'C:/repo/worktrees/feat-x' })
  const r = await wakeRoomCaptain('feat-x', deps)
  ok('room có wt → trả {wt}', r && r.wt === 'C:/repo/worktrees/feat-x', JSON.stringify(r))
  ok('spawn bin đúng room + path', calls.spawn.length === 1 && calls.spawn[0].room === 'feat-x'
    && calls.spawn[0].wt === 'C:/repo/worktrees/feat-x', JSON.stringify(calls.spawn))
  ok('không gọi launchFloating', calls.floating.length === 0, String(calls.floating.length))
}

// 4 — in-flight clear trong finally: xong lần 1, lần 2 chạy lại được
{
  const { deps, calls } = makeDeps()
  await wakeRoomCaptain('general', deps)
  const r2 = await wakeRoomCaptain('general', deps)
  ok('sau khi xong, wake kế tiếp không bị chặn', r2 && r2.floating === true, JSON.stringify(r2))
  ok('2 lượt liên tiếp = 2 launch', calls.floating.length === 2, String(calls.floating.length))
  ok('inFlight rỗng sau cả 2 lượt', deps.inFlight.size === 0, String(deps.inFlight.size))
}

// 5 — launch fail → vẫn clear in-flight (finally), không kẹt room vĩnh viễn
{
  const { deps, inFlight } = makeDeps({ launchError: new Error('host down') })
  let threw = false
  try { await wakeRoomCaptain('general', deps) } catch { threw = true }
  ok('launchFloating lỗi → wakeRoomCaptain reject', threw === true)
  ok('finally vẫn clear in-flight khi lỗi', inFlight.size === 0, String(inFlight.size))
}

// 6 — brief: dưới TEXT_MAX, trỏ hợp đồng captain.md, ACK vào room
{
  const brief = floatingCaptainBrief('general')
  ok('brief < TEXT_MAX (4096)', brief.length <= TEXT_MAX, String(brief.length))
  ok('brief trỏ ~/.claude/agents/captain.md', brief.includes('captain.md'))
  ok('brief nhắc room ACK', brief.includes('#general'))
  const briefLong = floatingCaptainBrief('room-ten-dai-voi-khoang-trang-khong-anh-huong')
  ok('brief cho room khác cũng < TEXT_MAX', briefLong.length <= TEXT_MAX, String(briefLong.length))
}

// 7 — room khác song song không chặn lẫn nhau (in-flight theo room)
{
  const { deps, calls } = makeDeps({ resolveDelay: 25 })
  const [a, b] = await Promise.all([
    wakeRoomCaptain('general', deps),
    wakeRoomCaptain('room-b', deps),
  ])
  ok('2 room khác nhau → cả 2 đều launch', calls.floating.length === 2, String(calls.floating.length))
  ok('cả 2 đường đều thắng', a && a.floating === true && b && b.floating === true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
