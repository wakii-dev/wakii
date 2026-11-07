// Wakii Team Chat — plugin worker entry (pluginApi 1).
//
// Runs inside the out-of-process plugin worker (plain Node, no Electron).
// The default export receives the `orca` API: command registration + the
// capability-gated host API.
//
// Panel bridge (wakii fork 31/10): panels may call storage.get/storage.set
// (plugin-private store, session-bound to this plugin) plus
// workspace.readContext/notifications.show. Chat flow: panel writes
// 'team.chat.send' single-slot → poller below appends to the JSONL bus and
// refreshes 'team.chat.tail' (500 tin cuối) mỗi 2s cho panel poll.
// CLI bins (team-chat/team-orch/…) append thẳng bus — một nguồn sự thật.

// Các phần domain đã tách sang lib/ (FI-98 SF-D): activate dưới đây chỉ còn
// wiring + tick poller. Exports cũ được re-export giữ tương thích tests +
// kit-rehash-check (import computeKitHash từ main.mjs).
import { execFile as execFileCb } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { orcaBin, winBashBin } from './lib/orca-cli-bin.mjs'
import { homeDir, chatDir, chatLog, readTail, appendLine } from './lib/bus.mjs'
import { linearState } from './kit/lib/linear-state.mjs'
import { parseMindmap } from './kit/lib/mindmap-parse.mjs'
import { createRegistry } from './lib/registry.mjs'
import { createWake } from './lib/wake.mjs'
import { createSupervisor } from './lib/supervisor.mjs'
import { createRouter } from './lib/router.mjs'
import { setKitGuardLogger } from './lib/kit-bins.mjs'
import { installKit } from './lib/kit-install.mjs'

export default function activate(orca) {
  setKitGuardLogger((line) => orca.log(line))
  installKit(orca)

  // ── Commands (manifest declares team.chat / team.doctor) ────────────────
  // Command invoke là trigger đánh thức worker này (worker lazy-start);
  // activate() mới là nơi poller chat sống. Không có action declarative
  // "open panel" nên team.chat báo qua notification + trả trạng thái bus.
  // Auto-activate on workspace.changed (CEO 3/11: plugin lazy-start means
  // every app restart requires manually opening the panel; subscribing to
  // workspace.changed ensures the plugin host activates this worker when the
  // app restores workspaces on startup, keeping chat + captain supervisor alive.)
  try {
    if (orca.events && typeof orca.events.on === 'function') {
      orca.events.on('workspace.changed', () => {
        orca.log('[team-chat] workspace.changed event received')
        void tick()
      })
    }
  } catch { /* events API optional */ }

  orca.commands.register('panelWake', async () => ({ ok: true }))
  orca.commands.register('team.chat', async () => {
    const tail = await readTail(5)
    await orca.host.call('notifications.show', {
      title: 'Wakii Team Chat',
      body: `Chat bus đang chạy — mở panel Team Chat ở sidebar phải. ${tail.length} tin mới nhất trên bus.`
    })
    return { ok: true, recent: tail.length }
  })
  orca.commands.register('team.doctor', async () => {
    await orca.host.call('notifications.show', {
      title: 'Wakii Team Doctor',
      body: 'Chạy `story-doctor` trong terminal để kiểm tra toolbox (kit bins + guards).'
    })
    return { ok: true }
  })

  // ── Team Chat bus (HOI-16): log JSONL là nguồn sự thật duy nhất ──────────
  // bus + registry đã tách sang lib/ (FI-98 SF-D) — main chỉ còn wiring.
  // Outbound: poller refresh storage 'team.chat.tail' (500 tin cuối) mỗi 2s cho panel.
  const _oldReadTail = async (limit = 500) => {
    try {
      const raw = await readFile(chatLog, 'utf8')
      return raw.split('\n').filter((l) => l.trim()).slice(-limit)
    } catch {
      return []
    }
  }

  const {
    mirrorRoster,
    livePanes,
    invalidateAliveCache,
    publishTerminals,
    captainEntries,
    publishMindmaps,
    publishProjects,
    resolveRoomWorktree,
  } = createRegistry(orca)
  const { wakeCaptainFor } = createWake(orca, { resolveRoomWorktree, invalidateAliveCache })
  const { captainSupervisor, watchWorkers } = createSupervisor(orca, { appendLine, wakeCaptainFor })
  const { captainAck, captainRoute } = createRouter(orca, { appendLine, captainEntries, livePanes, wakeCaptainFor })

  let lastSendAt = 0
  let lastTailLen = -1
  let lastTailSig = ''
  // Captain luôn online (CEO ruling 1/11): poller là router — mọi tin của
  // Owner/@captain được ACK ngay vào room + chuyển tiếp vào terminal Captain
  // (claude thật) nếu đã cấu hình storage 'team.captain.terminal' = handle.
  let lastRoomCmdAt = 0
  let lastCaptainCmdAt = 0
  let captainSeenAt = Date.now()
  let lastOwnerCommandAt = 0
  let stalledNotified = false
  let lastCaptainSig = ''
  let roomListSeen = []
  // Room info evidence (CEO 07/11 — F): Captain ghi ~/.claude/chat/room-info/<room>.json
  // (format kit/lib/room-info.mjs công bố — đọc tolerant: ảnh mới nhất lấy
  // screenshot.path hoặc latestMedia[0], đường ~ mở rộng về home). Panel không
  // đọc được file → worker publish slot meta 'team.chat.roomInfo' + slot ảnh
  // chunked 'team.chat.roomInfo.img.<room>[.k]' (dataUrl base64; slot host cap
  // 256KB — mẫu team.chat.img.*). Re-publish chỉ khi mtime+size đổi; slot room
  // biến mất được xoá (storage total cap 5MB).
  const roomInfoState = { lastMetaSig: '', pubImg: {} } // pubImg[room] = { sig, chunks }
  const MEDIA_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
  const MEDIA_CHUNK_CHARS = 240000
  const MEDIA_MAX_FILE_BYTES = 900 * 1024
  const roomInfoMediaPath = (info) => {
    const raw = info && info.screenshot && info.screenshot.path
      ? String(info.screenshot.path)
      : (info && Array.isArray(info.latestMedia) && info.latestMedia.length ? String(info.latestMedia[0]) : '')
    if (!raw) return ''
    let p = raw
    if (p === '~') p = homeDir()
    else if (p.startsWith('~/')) p = join(homeDir(), p.slice(2))
    else if (!p.startsWith('/')) p = join(chatDir, p)
    return p
  }
  const roomInfoAt = (info, fallbackMs) => {
    const t = info && info.screenshot && info.screenshot.capturedAt ? Date.parse(info.screenshot.capturedAt)
      : info && info.updatedAt ? Date.parse(info.updatedAt) : NaN
    return Number.isNaN(t) ? fallbackMs : t
  }
  const publishRoomInfo = async (roomSet) => {
    const infoByRoom = {}
    for (const r of roomSet) {
      let info = null
      try { info = JSON.parse(await readFile(join(chatDir, 'room-info', r + '.json'), 'utf8')) } catch { /* room chưa có evidence */ }
      if (!info || typeof info !== 'object' || Array.isArray(info)) continue
      const p = roomInfoMediaPath(info)
      if (!p) continue
      let st = null
      try { st = await stat(p) } catch { continue }
      if (!st.isFile()) continue
      infoByRoom[r] = { path: p, at: roomInfoAt(info, Math.round(st.mtimeMs)), mtime: Math.round(st.mtimeMs), size: st.size }
    }
    const metaSig = JSON.stringify(infoByRoom)
    if (metaSig !== roomInfoState.lastMetaSig) {
      roomInfoState.lastMetaSig = metaSig
      await orca.host.call('storage.set', { key: 'team.chat.roomInfo', value: infoByRoom }).catch(() => {})
    }
    for (const [r, meta] of Object.entries(infoByRoom)) {
      const sig = meta.mtime + ':' + meta.size
      const pub = roomInfoState.pubImg[r]
      if (pub && pub.sig === sig) continue
      const mime = MEDIA_MIME[extname(meta.path).toLowerCase()]
      let b64 = ''
      if (mime && meta.size > 0 && meta.size <= MEDIA_MAX_FILE_BYTES) {
        try { b64 = (await readFile(meta.path)).toString('base64') } catch { /* đọc lỗi → thử lại lần sau */ }
      }
      const chunks = b64 ? Math.ceil(b64.length / MEDIA_CHUNK_CHARS) : 0
      await orca.host.call('storage.set', { key: 'team.chat.roomInfo.img.' + r, value: { at: meta.at, path: meta.path, mime: mime || '', chunks: chunks } }).catch(() => {})
      for (let k = 0; k < chunks; k++) {
        await orca.host.call('storage.set', { key: 'team.chat.roomInfo.img.' + r + '.' + k, value: { part: b64.slice(k * MEDIA_CHUNK_CHARS, (k + 1) * MEDIA_CHUNK_CHARS) } }).catch(() => {})
      }
      for (let k = chunks; k < (pub ? pub.chunks : 0); k++) {
        await orca.host.call('storage.delete', { key: 'team.chat.roomInfo.img.' + r + '.' + k }).catch(() => {})
      }
      roomInfoState.pubImg[r] = { sig: b64 ? sig : sig + ':skip', chunks: chunks }
    }
    for (const old of Object.keys(roomInfoState.pubImg)) {
      if (!infoByRoom[old]) {
        const gone = roomInfoState.pubImg[old]
        delete roomInfoState.pubImg[old]
        await orca.host.call('storage.delete', { key: 'team.chat.roomInfo.img.' + old }).catch(() => {})
        for (let k = 0; k < gone.chunks; k++) {
          await orca.host.call('storage.delete', { key: 'team.chat.roomInfo.img.' + old + '.' + k }).catch(() => {})
        }
      }
    }
  }
  // Room status C/D/E (lane UI 08/11): slot 'team.chat.roomStatus' — (c) linear
  // (kit/lib/linear-state — fail-open; lib chỉ cache thành công nên throttle tự
  // 60s tránh spawn mỗi tick khi Linear lỗi), (d) mindmap (kit/lib/mindmap-parse —
  // path rooms.json meta, tương đối ghép worktree room), (e) tcGate (room-info
  // JSON). Slot media 'team.chat.roomInfo' ở trên giữ nguyên.
  const roomStatusState = { lastSig: '', linearTry: {} }
  const linearIdentifierOf = (v) => {
    const s = v && typeof v === 'object' ? (v.identifier || v.key || '') : v
    if (typeof s !== 'string') return ''
    const m = s.match(/([A-Z][A-Z0-9]+-\d+)/)
    return m ? m[1] : ''
  }
  const MINDMAP_MAX_NODES = 400
  const capMindmapTree = (node, counter) => {
    if (!node || counter.n >= MINDMAP_MAX_NODES) return null
    counter.n++
    return { text: node.text, depth: node.depth, children: (node.children || []).map((c) => capMindmapTree(c, counter)).filter(Boolean) }
  }
  const publishRoomStatus = async (roomSet, roomsReg) => {
    const byRoom = {}
    for (const r of roomSet) {
      const meta = (roomsReg && roomsReg[r]) || {}
      let info = null
      try { info = JSON.parse(await readFile(join(chatDir, 'room-info', r + '.json'), 'utf8')) } catch { /* room chưa có room-info */ }
      // (c) Linear: issue id ưu tiên room meta, fallback room-info JSON
      const issueId = linearIdentifierOf(meta.linearIssue) || (info ? linearIdentifierOf(info.linearIssue) : '')
      let lin = null
      if (issueId) {
        const t = roomStatusState.linearTry[issueId]
        if (t && Date.now() - t.at < 60_000 && t.value.state === 'unavailable') lin = t.value
        else { lin = linearState(issueId); roomStatusState.linearTry[issueId] = { at: Date.now(), value: lin } }
      }
      // (d) Mindmap: path room meta, tương đối → ghép worktree room
      let mm = null
      const mmRaw = meta.mindmap || (info && info.mindmap && info.mindmap.path) || ''
      if (mmRaw) {
        let p = String(mmRaw)
        if (!p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p)) p = join(meta.worktree || '', p)
        const tree = parseMindmap(p)
        if (tree) mm = { path: p, tree: capMindmapTree(tree, { n: 0 }) }
      }
      // (e) tcGate: Captain heartbeat ghi room-info JSON
      const g = info && info.tcGate && typeof info.tcGate === 'object' ? info.tcGate : null
      const tcGate = g ? { state: String(g.state ?? g.status ?? ''), commit: String(g.commit ?? g.baseline ?? ''), at: String(g.at ?? g.checkedAt ?? '') } : null
      if (lin || mm || tcGate) byRoom[r] = { linear: lin, mindmap: mm, tcGate: tcGate }
    }
    const sig = JSON.stringify(byRoom)
    if (sig !== roomStatusState.lastSig) {
      roomStatusState.lastSig = sig
      await orca.host.call('storage.set', { key: 'team.chat.roomStatus', value: byRoom }).catch(() => {})
    }
  }
  const tick = async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'team.chat.send' })
      const req = stored?.value?.value !== undefined ? stored.value.value : stored?.value
      if (req && typeof req === 'object' && typeof req.at === 'number' && req.at !== lastSendAt
          && typeof req.text === 'string' && req.text.trim()) {
        lastSendAt = req.at
        await appendLine({ from: req.from, role: req.role, channel: req.channel, text: req.text })
        await orca.host.call('storage.set', { key: 'team.chat.send', value: null }).catch(() => {})
      }
      // Wake Captain từ panel settings: spawn terminal claude gắn worktree của room.
      // Worker không có API tạo terminal nhưng CÓ child_process + ORCA_BIN (app
      // inject) → chạy bin team-captain-spawn của kit.
      const cc = await orca.host.call('storage.get', { key: 'team.chat.captainCmd' }).catch(() => null)
      const ccReq = cc && cc.value
      if (ccReq && typeof ccReq === 'object' && ccReq.at && ccReq.at !== lastCaptainCmdAt
          && (ccReq.action === 'wake' || ccReq.action === 'adopt' || ccReq.action === 'release')) {
        lastCaptainCmdAt = ccReq.at
        const room = ccReq.room || 'general'
        orca.log('[wake] nhận lệnh wake room=' + room)
        if (ccReq.action !== 'wake') {
          // Adopt/release điều phối file thuần (.workers.json) — không cần spawn:
          // CEO chọn terminal đang sống làm Captain, hoặc gỡ Captain hiện tại.
          void (async () => {
            try {
              const roomsPath = join(chatDir, 'rooms.json')
              const workersPath = join(chatDir, '.workers.json')
              let reg = {}
              try { reg = JSON.parse(await readFile(workersPath, 'utf8')) } catch { /* chưa có */ }
              for (const pane of Object.keys(reg).filter((p) => reg[p] && reg[p].name === 'captain')) delete reg[pane]
              let note = ''
              if (ccReq.action === 'adopt' && /^term_[A-Za-z0-9-]+$/.test(ccReq.pane || '')) {
                let wt = ''
                try {
                  const rooms = JSON.parse(await readFile(roomsPath, 'utf8'))
                  wt = (rooms[room] && rooms[room].worktree) || ''
                } catch { /* rooms.json chưa có */ }
                reg[ccReq.pane] = { name: 'captain', worktree: wt, task: '', run: '', repo: 'team', room, at: Date.now() }
                note = '🤝 Captain mới #' + room + ': ' + ccReq.pane + (wt ? ' — worktree ' + wt : '')
                // GỬI BRIEF vào terminal (CEO bug 3/11: adopt chỉ đăng ký mà
                // không phân vai — terminal không biết mình là captain)
                const orcaBin2 = process.env.ORCA_BIN || 'orca'
                const brief = 'Bạn được CEO chỉ định làm CAPTAIN trực room #' + room + ' của Wakii team. HỢP ĐỒNG ĐẦY ĐỦ: ~/.claude/agents/captain.md — đọc NGAY (CHAT STYLE · PHÂN CÔNG cứng · Verify-first · Cleanup-on-done · Commit hygiene cấm trailer AI · HEARTBEAT · DISPATCH=CÓ CHỨNG CỨ · JOURNAL · BẢN GHẾ 6 chỗ). Mọi trả lời PHẢI kèm --channel ' + room + '. Điều phối: ~/.claude/bin/team-orch (feature-open/worker-start/gate-resolve/cleanup). Ngữ cảnh: ~/.claude/bin/team-chat read --last 15 --channel ' + room + '. Journal: ~/.claude/chat/notes/' + room + '.md. Worktree: ' + wt + '. Xác nhận bằng 1 tin team-chat (CHAT STYLE, vào room #' + room + ') rồi nằm chờ lệnh CEO.'
                execFileCb(orcaBin2, ['terminal', 'send', '--terminal', ccReq.pane, '--text', brief, '--enter'], { timeout: 15000 }, () => {})
              } else {
                note = '🔓 Released Captain #' + room + ' — bấm 🔔 hoặc gửi tin để tự đánh thức.'
              }
              await mkdir(chatDir, { recursive: true })
              await writeFile(workersPath, JSON.stringify(reg, null, 1))
              invalidateAliveCache()
              await appendLine({ from: 'system', role: 'system', channel: room, text: note }).catch(() => {})
            } catch (e) { orca.log('[adopt] lỗi: ' + (e && e.message || e)) }
          })()
          await orca.host.call('storage.set', { key: 'team.chat.captainCmd', value: null }).catch(() => {})
          return
        }
        void (async () => {
          try {
            // Alive-check (registration + terminal list — floating terminal CÓ
            // trong unscoped terminal list): Captain còn sống → no-op.
            const entries = await captainEntries()
            const live = await livePanes()
            const alive = entries.find((c) => c.room === room && live.has(c.pane))
            if (alive) {
              orca.log('[wake] captain #' + room + ' còn sống (' + alive.pane + ') — no-op')
              await orca.host.call('notifications.show', {
                title: 'Wakii Team — Captain đang online',
                body: 'Captain #' + room + ' còn sống — không spawn thêm.'
              }).catch(() => {})
              return
            }
            const r = await wakeCaptainFor(room)
            if (!r) {
              await orca.host.call('notifications.show', {
                title: 'Wakii Team — đang đánh thức',
                body: 'Captain #' + room + ' đang được đánh thức — bỏ qua lệnh trùng.'
              }).catch(() => {})
              return
            }
            if (r.floating) {
              await orca.host.call('notifications.show', {
                title: 'Wakii Team — Captain đã online',
                body: 'Captain #' + room + ' nổi trong Floating Workspace (room không worktree) — không cần kéo tay.'
              }).catch(() => {})
            } else {
              await orca.host.call('notifications.show', {
                title: 'Wakii Team — Captain đã online',
                body: 'Terminal Captain gắn worktree ' + r.wt + ' (room #' + room + '). Kéo tab vào floating workspace nếu muốn — router theo handle.'
              }).catch(() => {})
            }
          } catch (e) { orca.log('[wake] lỗi: ' + ((e && e.message) || e)) }
        })()
        await orca.host.call('storage.set', { key: 'team.chat.captainCmd', value: null }).catch(() => {})
      }
      // Room commands từ panel settings: close (🔒 giữ lịch sử) / delete (xoá tab + purge tin)
      const rc = await orca.host.call('storage.get', { key: 'team.chat.roomCmd' }).catch(() => null)
      const rcReq = rc && rc.value
      if (rcReq && typeof rcReq === 'object' && rcReq.at && rcReq.at !== lastRoomCmdAt && rcReq.room) {
        lastRoomCmdAt = rcReq.at
        try {
          await mkdir(chatDir, { recursive: true })
          const roomsPath = join(chatDir, 'rooms.json')
          let rooms = {}
          try { rooms = JSON.parse(await readFile(roomsPath, 'utf8')) } catch { /* chưa có */ }
          if (rcReq.action === 'create') {
            let room = String(rcReq.room || '').toLowerCase()
            const repo = String(rcReq.repo || 'team').toLowerCase()
            room = String(room).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
            if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(room)) throw new Error('tên room không hợp lệ (sau chuẩn hoá vẫn rỗng — dùng ký tự a-z 0-9)')
            if (rooms[room] && rooms[room].status !== 'deleted') throw new Error('room #' + room + ' đã tồn tại')
            const feature = room.includes('-') ? room.split('-').slice(1).join('-') : room
            rooms[room] = { feature, repo, run: '', status: 'open', createdAt: Date.now() }
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
            lastTailLen = -1 // ép publish tabs mới
            appendLine({ from: 'captain', role: 'captain', channel: room,
              text: '🏁 Room #' + room + ' mở — đang tạo worktree cho room…' }).catch(() => {})
            // CEO ruling: 1 room = 1 worktree = 1 captain; workers dùng CHUNG
            // worktree room (chỉ tách khi bắt buộc). Worktree/captain fail không
            // chặn room (linh hoạt không block) — báo vào room để CEO biết.
            void (async () => {
              try {
                const orcaCli = process.env.ORCA_BIN || 'orca'
                // resolve repo path từ worktree list (match tên repo)
                let repoPath = ''
                try {
                  const out = await new Promise((res) => execFileCb(orcaCli, ['worktree', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
                  if (out) {
                    const wts = JSON.parse(out).result.worktrees.map((w) => String(w.path || '').replace(/\\/g, '/'))
                    // repo khớp tên → dùng; 'team' (bỏ trống) KHÔNG match mù theo
                    // substring nữa mà rơi về worktree project đang hoạt động
                    // (currentPath từ publishProjects) — hết cảnh wts[0] trỏ
                    // nhầm project khác với project CEO đang đứng (2/11).
                    const matched = wts.find((p) => p.endsWith('/' + repo))
                      || (repo && repo !== 'team' ? wts.find((p) => p.includes(repo)) : '')
                    let curWt = ''
                    try {
                      const pj = await orca.host.call('storage.get', { key: 'team.chat.projects' }).catch(() => null)
                      const cp = pj && pj.value && pj.value.currentPath
                      if (cp) curWt = String(cp).replace(/\\/g, '/')
                    } catch { /* slot best-effort */ }
                    repoPath = matched || (curWt && wts.find((p) => p === curWt)) || wts[0] || ''
                  }
                } catch { /* list fail */ }
                let wtPath = ''
                if (repoPath) {
                  try {
                    // Branch mặc định của CLI là <branch-đang-đứng>/<tên> — repo có
                    // branch gốc dạng wakii-dev/main thì git cấm tạo wakii-dev/<tên>
                    // (ref conflict). Room dùng format chuẩn của repo: features/<feature>.
                    const out = await new Promise((res) => execFileCb(orcaCli, ['worktree', 'create', '--repo', 'path:' + repoPath, '--name', feature, '--branch', 'features/' + feature, '--no-parent', '--json'], { timeout: 60000 }, (e, o, se) => {
                      if (e) orca.log('[create-room] worktree create lỗi: ' + String(se || e.message || '').split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 300))
                      res(e ? '' : o)
                    }))
                    if (out) {
                      try { wtPath = JSON.parse(out).result.worktree.path || '' } catch { wtPath = '' }
                    }
                  } catch { /* create fail */ }
                }
                let roomsNow = {}
                try { roomsNow = JSON.parse(await readFile(roomsPath, 'utf8')) } catch { /* rỗng */ }
                if (roomsNow[room]) { roomsNow[room].worktree = wtPath; await writeFile(roomsPath, JSON.stringify(roomsNow, null, 1)) }
                appendLine({ from: 'system', role: 'system', channel: room,
                  text: wtPath ? '📁 Worktree room: ' + wtPath + ' — captain + workers đều làm ở đây.'
                    : '⚠ Chưa tạo được worktree (repo "' + repo + '" chưa mở trong app?). Room chat vẫn dùng được; mở repo rồi tạo lại metadata worktree trong ⋮.' }).catch(() => {})
                // captain trực room, đứng trên worktree room
                if (wtPath) {
                  const spawnBin = join(homeDir(), '.claude', 'bin', 'team-captain-spawn')
                  execFileCb(winBashBin(), [spawnBin, '--room', room, '--repo', 'path:' + wtPath], { timeout: 120000, env: { ...process.env, ORCA_BIN: orcaBin() } }, () => {})
                }
              } catch (e) { orca.log('[create-room] lỗi: ' + (e && e.message || e)) }
            })()
          } else if (rcReq.action === 'update') {
            // Metadata room do CEO định nghĩa trong settings: name/description/
            // worktree/ticket/files/artifacts/plan/mindmap/linearIssue (ruling CEO 06/11: 1 room ↔ 1 issue)…
            const meta = (rcReq.meta && typeof rcReq.meta === 'object') ? rcReq.meta : {}
            if (!rooms[rcReq.room]) rooms[rcReq.room] = { feature: rcReq.room, status: 'open', createdAt: Date.now() }
            for (const k of ['name', 'description', 'worktree', 'ticket', 'linearIssue', 'files', 'artifacts', 'plan', 'mindmap', 'repo', 'run']) {
              if (meta[k] !== undefined) rooms[rcReq.room][k] = String(meta[k]).slice(0, 2000)
            }
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
          } else if (rcReq.action === 'close' || rcReq.action === 'open') {
            if (rooms[rcReq.room]) rooms[rcReq.room].status = rcReq.action === 'close' ? 'closed' : 'open'
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
          } else if (rcReq.action === 'delete') {
            delete rooms[rcReq.room]
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
            const raw = await readFile(chatLog, 'utf8').catch(() => '')
            const kept = raw.split('\n').filter((l) => {
              if (!l.trim()) return false
              try { return (JSON.parse(l).channel || 'general') !== rcReq.room } catch { return true }
            })
            await writeFile(chatLog, kept.map((l) => l + '\n').join(''))
            lastTailLen = -1 // buộc publish lại tail + rooms
          }
        } catch (e) { orca.log('[room-cmd] lỗi: ' + (e && e.message || e)) }
        // Luôn ép publish lại tail+rooms — close/open không đổi độ dài tail nên
        // không được ràng vào điều kiện đó (bug 'nút không phản hồi' CEO bắt).
        lastTailLen = -1
        await orca.host.call('storage.set', { key: 'team.chat.roomCmd', value: null }).catch(() => {})
      }
      // readTail trong try riêng (3/11: error từ router/send nuốt block →
      // tail không update → CEO không send/nhận được chat)
      let tail = []
      try { tail = await readTail() } catch { /* best-effort */ }
      // So LAST LINE thay vì length (bug 2/11: bus > 200 dòng → readTail cap 200
      // → length không bao giờ đổi → panel đứng hình từ khi bus đầy).
      const lastSig = tail.length ? String(JSON.parse(tail[tail.length - 1]).at || 0) + ':' + String(JSON.parse(tail[tail.length - 1]).from || '') : ''
      if (lastSig !== lastTailSig || tail.length !== lastTailLen) {
        lastTailLen = tail.length
        lastTailSig = lastSig
        await orca.host.call('storage.set', { key: 'team.chat.tail', value: tail }).catch(() => {})
        // Room list cho panel tabs: registry (rooms.json) + mọi channel từng
        // xuất hiện trong tail (room tự phát vẫn hiện tab).
        let rooms = {}
        try {
          rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
        } catch { /* chưa có registry */ }
        const seen = new Map()
        for (const line of tail) {
          try {
            const m = JSON.parse(line)
            if (m.channel) seen.set(m.channel, (seen.get(m.channel) || 0) + 1)
          } catch { /* skip dòng hỏng */ }
        }
        const list = [...new Set([...Object.keys(rooms), ...seen.keys()])]
          .filter((c) => !rooms[c] || rooms[c].status !== 'deleted') // xoá là xoá hẳn — không hồi sinh
          .map((c) => ({
            id: c,
            status: rooms[c] ? rooms[c].status : 'open',
            feature: rooms[c] ? rooms[c].feature : null,
            run: rooms[c] ? rooms[c].run : null,
            meta: rooms[c] || null,
            msgs: seen.get(c) || 0,
            lastAt: Math.max(...tail.filter((l) => { try { return JSON.parse(l).channel === c } catch { return false } }).map((l) => { try { return JSON.parse(l).at } catch { return 0 } }), 0)
          }))
          .sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : b.lastAt - a.lastAt))
        await orca.host.call('storage.set', { key: 'team.chat.rooms', value: list }).catch(() => {})
      }
      void publishTerminals()
      void publishProjects()
      void publishMindmaps().catch(() => {})
      void watchWorkers().catch(() => {})
      void captainSupervisor().catch(() => {})
      // Captain status cho settings panel: theo TỪNG room (room = worktree + captain trực).
      // Room-set tự tính mỗi tick (registry + kênh trong tail) — không phụ thuộc
      // biến chỉ cập nhật khi tail đổi (bug settings 🔴 dù captain online).
      try {
        const entries = await captainEntries()
        const live = await livePanes()
        let roomsReg = {}
        try { roomsReg = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8')) } catch { /* chưa có */ }
        const roomSet = new Set(Object.keys(roomsReg).filter((r) => roomsReg[r].status !== 'deleted'))
        for (const line of tail) {
          try {
            const ch = JSON.parse(line).channel
            if (ch && !(roomsReg[ch] && roomsReg[ch].status === 'deleted')) roomSet.add(ch)
          } catch { /* skip */ }
        }
        const byRoom = {}
        for (const r of roomSet) {
          const hit = entries.find((c) => c.room === r && live.has(c.pane))
          byRoom[r] = hit ? { online: true, pane: hit.pane, worktree: hit.worktree } : { online: false }
        }
        const sig = JSON.stringify(byRoom)
        if (sig !== lastCaptainSig) { lastCaptainSig = sig; await orca.host.call('storage.set', { key: 'team.chat.captain', value: byRoom }).catch(() => {}) }
        void publishRoomInfo(roomSet).catch((e) => orca.log('[room-info] lỗi: ' + ((e && e.message) || e)))
        void publishRoomStatus(roomSet, roomsReg).catch((e) => orca.log('[room-status] lỗi: ' + ((e && e.message) || e)))
      } catch (e) { orca.log('[captain-status] lỗi: ' + (e && e.message || e)) }
      void mirrorRoster()
      // Router Captain: quét tin mới từ outside (owner/@captain) kể từ lần trước.
      for (const line of tail) {
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (typeof m.at !== 'number' || m.at <= captainSeenAt) continue
        if (m.from === 'captain') {
          captainSeenAt = m.at
          if (!m.text.startsWith('📡')) { lastOwnerCommandAt = 0; stalledNotified = false }
          continue
        }
        if (m.role === 'owner' || /@captain/i.test(String(m.text || ''))) {
          captainSeenAt = m.at
          await captainAck(m)
          await captainRoute(m)
          lastOwnerCommandAt = m.at
          stalledNotified = false
        }
      }
      // Watchman mini: lệnh CEO > 10 phút không thấy captain trả lời thật → cảnh báo CEO 1 lần.
      if (lastOwnerCommandAt && Date.now() - lastOwnerCommandAt > 10 * 60 * 1000 && !stalledNotified) {
        stalledNotified = true
        await orca.host.call('notifications.show', {
          title: 'Wakii Team — Captain im lặng >10 phút',
          body: 'Có lệnh CEO chưa được Captain trả lời. Kiểm tra terminal Captain (có thể kẹt turn dài).'
        }).catch(() => {})
      }
    } catch { /* chat là best-effort — không chặn activate */ }
  }
  orca.log('wakii.team-chat activate: tick đầu…')
  void tick().catch((e) => orca.log('wakii.team-chat tick đầu LỖI: ' + ((e && e.stack) || e)))
  const chatTimer = setInterval(() => {
    tick().catch((e) => orca.log('wakii.team-chat tick LỖI (bỏ qua, tick kế tiếp): ' + ((e && e.stack) || e)))
  }, 2000)

  orca.log('wakii.team-chat v1.0.0: chat bus sẵn sàng — ' + chatLog)
  return () => clearInterval(chatTimer)
}

// Brief Captain floating + 2 đường wake đã tách sang lib/wake.mjs (FI-98)
// — re-export giữ tương thích import của tests + kit-rehash-check.
export { floatingCaptainBrief, wakeRoomCaptain } from './lib/wake.mjs'

// Re-exports tương thích — tests + kit-rehash-check import qua main.mjs.
export { setKitGuardLogger, resetKitRepeatGuard, kitBinCatalog, computeKitHash, installedKitIntact, assertCapability, runKit } from './lib/kit-bins.mjs'
export { installKit } from './lib/kit-install.mjs'
export { buildStoryHookGroups, readKitHookManifests, mergeStoryHookSettings, mergeStoryHooks } from './lib/story-hooks.mjs'
export { parseWakiiMeta } from './lib/story-snapshot.mjs'
export { saveWakiiStory } from './lib/wakii-save.mjs'
