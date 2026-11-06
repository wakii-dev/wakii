// Wake Captain: 2 đường wake (🔔 panel + tin CEO auto-wake) + respawn worktree.
// Layer: cli-bin + bus ← wake (registry inject qua deps) — cấm import lên.
import { execFile as execFileCb } from 'node:child_process'
import { join } from 'node:path'
import { winBashBin, orcaBin } from './orca-cli-bin.mjs'
import { homeDir } from './bus.mjs'

// Brief Captain floating — đi qua param `prompt` của agent.launchFloating
// (binding có composer-wait chờ agent ready tới 1 phút; KHÔNG send trần —
// bug CEO 1/11: prompt rơi vào shell trống khi claude boot chậm).
export function floatingCaptainBrief(room) {
  return 'Bạn là CAPTAIN trực room #' + room + ' của Wakii team — terminal của bạn nằm trong Floating Workspace (không gắn worktree). HỢP ĐỒNG ĐẦY ĐỦ: ~/.claude/agents/captain.md — đọc NGAY (CHAT STYLE · PHÂN CÔNG cứng · Verify-first · Cleanup-on-done · Commit hygiene cấm trailer AI · HEARTBEAT · DISPATCH=CÓ CHỨNG CỨ · JOURNAL · BẢN GHẾ 6 chỗ). Mọi trả lời PHẢI kèm --channel ' + room + '. Điều phối: ~/.claude/bin/team-orch (feature-open/worker-start/gate-resolve/cleanup). Ngữ cảnh: ~/.claude/bin/team-chat read --last 15 --channel ' + room + '. Journal: ~/.claude/chat/notes/' + room + '.md. Xác nhận (ACK) bằng 1 tin team-chat vào room #' + room + ' rồi nằm chờ lệnh CEO.'
}

// Hai đường wake Captain (🔔 panel + tin CEO auto-wake) DÙNG CHUNG 1 in-flight
// set: check-AND-set trước launch, clear trong finally → race chỉ spawn 1.
// Room có worktree → team-captain-spawn; không → agent.launchFloating (op trả
// handle ngay, brief composer-wait fire-and-forget phía binding).
export async function wakeRoomCaptain(room, deps = {}) {
  const {
    inFlight = new Set(),
    resolveWorktree = async () => '',
    launchFloating = async () => ({}),
    spawnWorktree = async () => {},
    log = () => {},
  } = deps
  if (inFlight.has(room)) return null
  inFlight.add(room)
  try {
    const wt = await resolveWorktree(room)
    if (wt) {
      log('spawn worktree captain #' + room + ' → ' + wt)
      await spawnWorktree(room, wt)
      return { wt }
    }
    log('room #' + room + ' không worktree → captain floating')
    const r = await launchFloating({ agent: 'claude', title: 'Captain #' + room, prompt: floatingCaptainBrief(room) })
    return { floating: true, terminalId: r && r.terminalId }
  } finally { inFlight.delete(room) }
}

// Factory: wakeCaptainFor + các seam cục bộ. deps inject từ wiring main
// (resolveRoomWorktree từ registry, invalidateAliveCache phá cache pane mới).
export function createWake(orca, deps = {}) {
  const {
    resolveRoomWorktree = async () => '',
    invalidateAliveCache = () => {},
  } = deps
  const spawnWorktreeCaptain = (room, wt) => new Promise((res) => {
    const spawnBin = join(homeDir(), '.claude', 'bin', 'team-captain-spawn')
    execFileCb(winBashBin(), [spawnBin, '--room', room, '--repo', 'path:' + wt], { timeout: 120000, env: { ...process.env, ORCA_BIN: orcaBin() } }, () => res())
  })
  const wakingRooms = new Set()
  const wakeCaptainFor = async (room) => {
    const r = await wakeRoomCaptain(room, {
      inFlight: wakingRooms,
      resolveWorktree: resolveRoomWorktree,
      launchFloating: (params) => orca.host.call('agent.launchFloating', params),
      spawnWorktree: spawnWorktreeCaptain,
      log: (...a) => orca.log('[wake] ' + a.join(' ')),
    }).catch(() => null)
    if (r) invalidateAliveCache()
    return r
  }
  return { wakeCaptainFor, spawnWorktreeCaptain, wakingRooms }
}
