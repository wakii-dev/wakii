// Captain Supervisor (CEO 3/11): captain tự phục hồi — không cần CEO đánh thức.
// 3 lớp chạy mỗi tick (throttle 30s cho respawn/heal, 10 phút cho heartbeat):
//   1. REGISTRATION HEALER: pane sống + title "CAPTAIN" nhưng mất REG → re-register
//   2. DEATH DETECTOR: room open + captain pane chết → auto-respawn + brief
//   3. HEARTBEAT PING: captain im >10 phút → gửi ping giữ session tươi
// + WATCHDOG (CEO 1/11): worker pane chết/im lặng không còn âm thầm.
// Layer: cli-bin + bus + wake ← supervisor — cấm import lên.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile as execFileCb } from 'node:child_process'
import { orcaBin, winBashBin } from './orca-cli-bin.mjs'
import { homeDir, chatDir } from './bus.mjs'

export function createSupervisor(orca, deps = {}) {
  const {
    appendLine = async () => {},
    wakeCaptainFor = async () => null,
  } = deps

  // WATCHDOG (CEO 1/11): worker pane chết/im lặng không còn âm thầm — poller
  // so REG với terminal list + lastOutputAt, post tin ⚠️ vào room (mỗi sự kiện
  // 1 lần) và dọn REG chết. Best-effort: lỗi không được giết poller.
  const wdNotified = new Map() // paneHandle -> {kind, at}
  const watchWorkers = async () => {
    try {
      let reg = {}
      try { reg = JSON.parse(readFileSync(join(chatDir, '.workers.json'), 'utf8')) } catch { return }
      // FI-98: trước đây truyền bare `orcaBin` (function) vào execFileCb →
      // TypeError chết im trong best-effort catch — watchdog chưa bao giờ chạy.
      const cliBin = orcaBin()
      const listOut = await new Promise((res) => execFileCb(cliBin, ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!listOut) return
      const terms = JSON.parse(listOut).result.terminals
      const byHandle = new Map(terms.map((t) => [t.handle, t]))
      let dirty = false
      for (const [pane, e] of Object.entries(reg)) {
        if (!pane.startsWith('term_') || !e || typeof e !== 'object') continue
        const room = e.room || ''
        const t = byHandle.get(pane)
        const notify = (kind) => {
          const key = pane + ':' + kind
          const last = wdNotified.get(key)
          if (last && Date.now() - last < 30 * 60 * 1000) return
          wdNotified.set(key, Date.now())
          appendLine({ from: 'system', role: 'system', channel: room,
            text: '⚠️ WATCHDOG: worker ' + (e.name || pane.slice(0, 14)) + ' ' + kind + ' (room #' + room + '). Captain: verify worktree worker này ngay — việc có thể đã xong chưa kịp báo DONE; dở thì respawn --background.' }).catch(() => {})
        }
        if (!t) {
          notify('pane đã CHẾT')
          delete reg[pane]
          dirty = true
          continue
        }
        const staleMs = Date.now() - (t.lastOutputAt || 0)
        if (staleMs > 15 * 60 * 1000 && e.name && e.name !== 'captain') notify('im lặng >15 phút')
      }
      if (dirty) writeFileSync(join(chatDir, '.workers.json'), JSON.stringify(reg, null, 1))
    } catch { /* watchdog best-effort */ }
  }

  let supervisorAt = 0
  const supervisorRespawned = new Map() // room → timestamp (anti-spam 5')
  const supervisorMisses = new Map() // pane → {n, at} — chết phải xác nhận 2 tick + REG > 5 phút mới xoá
  const captainSupervisor = async () => {
    try {
      // Throttle: chạy tối đa mỗi 30s (heartbeat riêng 10 phút)
      const now = Date.now()
      const isHeartbeatTick = now - supervisorAt > 10 * 60 * 1000
      if (!isHeartbeatTick && now - supervisorAt < 30000) return
      supervisorAt = now

      // Đọc registry + REG
      let rooms = {}
      try { rooms = JSON.parse(readFileSync(join(chatDir, 'rooms.json'), 'utf8')) } catch { return }
      let reg = {}
      try { reg = JSON.parse(readFileSync(join(chatDir, '.workers.json'), 'utf8')) } catch { /* */ }

      // Terminal list — KHÔNG đặt tên `orcaBin` ở đây: đè function orcaBin() của
      // module làm Layer-2 respawn (orcaBin() env resolve) nổ TypeError chết im.
      const orcaCli = orcaBin()
      const listOut = await new Promise((res) => execFileCb(orcaCli, ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!listOut) return
      const terms = JSON.parse(listOut).result.terminals
      const byHandle = new Map(terms.map((t) => [t.handle, t]))

      let dirty = false
      const actions = []

      for (const [roomId, roomEntry] of Object.entries(rooms)) {
        if (!roomEntry || roomEntry.status !== 'open') continue
        const wt = roomEntry.worktree || ''

        // Tìm captain hiện tại trong REG
        let capPane = ''
        let capEntry = null
        for (const [pane, e] of Object.entries(reg)) {
          if (e && e.name === 'captain' && e.room === roomId) {
            capPane = pane
            capEntry = e
            break
          }
        }

        if (capPane && byHandle.has(capPane)) {
          supervisorMisses.delete(capPane)
        }

        // LAYER 1: REGISTRATION HEALER — chết phải xác nhận 2 tick liên tiếp
        // ĐÚNG độ tuổi REG > 5 phút. Terminal list eventual-consistency: captain
        // mới spawn chưa kịp xuất hiện là bị bỏ nhầm → churn orphan captain.
        if (capPane && !byHandle.has(capPane)) {
          const miss = supervisorMisses.get(capPane) || { n: 0 }
          miss.n++
          miss.at = miss.at || now
          supervisorMisses.set(capPane, miss)
          const regAge = now - (capEntry.at || 0)
          if (miss.n < 2 || regAge < 5 * 60 * 1000) {
            continue
          }
          delete reg[capPane]
          supervisorMisses.delete(capPane)
          dirty = true
          capPane = ''
          capEntry = null
          actions.push('heal: xoá REG chết cho #' + roomId + ' (xác nhận ' + miss.n + ' tick, tuổi ' + Math.round(regAge / 60000) + ' phút)')
        }

        // Re-register: ưu tiên handle có worktreePath khớp room worktree;
        // title-match chỉ là fallback cho room floating (không có worktree để so).
        if (!capPane) {
          const normWt = wt.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
          for (const [handle, t] of byHandle) {
            if (reg[handle]) continue
            const tPath = String(t.worktreePath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
            const title = String(t.title || '').toLowerCase()
            const wtMatch = normWt !== '' && tPath === normWt
            const titleMatch = title.includes('captain') && title.includes(roomId.toLowerCase().split('-')[0])
            if (!wtMatch && !titleMatch) continue
            reg[handle] = { name: 'captain', worktree: wt, task: '', run: '', repo: roomEntry.repo || '', room: roomId, at: Date.now() }
            supervisorMisses.delete(handle)
            dirty = true
            capPane = handle
            actions.push('heal: re-register ' + handle.slice(0, 14) + ' → captain #' + roomId)
            break
          }
        }

        // LAYER 2: DEATH DETECTOR — ADOPT orphan trước, spawn là giải pháp cuối
        if (!capPane && wt) {
          const normWt = wt.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
          for (const [handle, t] of byHandle) {
            if (reg[handle]) continue
            const tPath = String(t.worktreePath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
            if (tPath !== normWt) continue
            if (!String(t.title || '').toLowerCase().includes('claude')) continue
            reg[handle] = { name: 'captain', worktree: wt, task: '', run: '', repo: roomEntry.repo || '', room: roomId, at: Date.now() }
            supervisorMisses.delete(handle)
            dirty = true
            capPane = handle
            actions.push('adopt: orphan ' + handle.slice(0, 14) + ' → captain #' + roomId)
            break
          }
        }
        if (!capPane && !wt) {
          // Room không worktree → Captain floating: respawn qua agent.launchFloating
          // (nhánh này thiếu thì Captain floating chết không bao giờ tự hồi).
          const lastRespawn = supervisorRespawned.get(roomId)
          if (lastRespawn && now - lastRespawn < 5 * 60 * 1000) continue
          supervisorRespawned.set(roomId, now)
          actions.push('respawn: captain #' + roomId + ' chết → floating')
          void wakeCaptainFor(roomId).catch(() => {})
          appendLine({ from: 'system', role: 'system', channel: roomId,
            text: '🔄 Captain Supervisor: captain room không worktree đã chết — tự spawn lại trong Floating Workspace. Journal + chat history đảm bảo không mất ngữ cảnh.' }).catch(() => {})
        }
        if (!capPane && wt) {
          // Anti-spam: không respawn lại nếu vừa respawn <5 phút
          const lastRespawn = supervisorRespawned.get(roomId)
          if (lastRespawn && now - lastRespawn < 5 * 60 * 1000) continue

          supervisorRespawned.set(roomId, now)
          actions.push('respawn: captain #' + roomId + ' chết → tự spawn')
          const spawnBin = join(homeDir(), '.claude', 'bin', 'team-captain-spawn')
          execFileCb(winBashBin(), [spawnBin, '--room', roomId, '--repo', 'path:' + wt],
            { timeout: 120000, env: { ...process.env, ORCA_BIN: orcaBin() } },
            (e, so, se) => { orca.log('[captain-supervisor] spawn #' + roomId + ' rc=' + (e && e.code || 0) + ' out=' + String(so).slice(0, 100) + ' err=' + String(se).slice(0, 100)) })
          // Post tin hệ thống
          appendLine({ from: 'system', role: 'system', channel: roomId,
            text: '🔄 Captain Supervisor: captain pane đã chết — tự khởi động lại (worktree ' + wt + '). Journal + chat history đảm bảo không mất ngữ cảnh.' }).catch(() => {})
        }

        // LAYER 3: HEARTBEAT PING — captain im >10 phút
        if (isHeartbeatTick && capPane && byHandle.has(capPane)) {
          const t = byHandle.get(capPane)
          const lastOut = t.lastOutputAt || 0
          if (now - lastOut > 10 * 60 * 1000) {
            // FI-98: trước đây truyền bare `orcaBin` (function) → ping chết im.
            execFileCb(orcaCli, ['terminal', 'send', '--terminal', capPane, '--text',
              '[heartbeat] Captain còn đó không? Trả lời ngắn 1 tin team-chat vào room này.', '--enter'],
              { timeout: 15000 }, () => {})
            actions.push('ping: captain #' + roomId + ' im >10 phút')
          }
        }
      }

      if (dirty) {
        writeFileSync(join(chatDir, '.workers.json'), JSON.stringify(reg, null, 1))
      }
      if (actions.length > 0) {
        orca.log('[captain-supervisor] ' + actions.join(' | '))
      }
    } catch (e) {
      try { orca.log('[captain-supervisor] lỗi: ' + (e && e.message || e)) } catch { /* */ }
    }
  }

  return { captainSupervisor, watchWorkers }
}
