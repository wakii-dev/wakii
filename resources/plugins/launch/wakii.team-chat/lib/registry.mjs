// Registry + caches panel-side: roster mirror, .workers.json/.rooms.json đọc,
// cache terminal sống (aliveCache/termsCache), publish slots cho panel,
// resolve worktree room. Layer: cli-bin + bus ← registry (cấm import lên).
import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFile as execFileCb } from 'node:child_process'
import { orcaBin } from './orca-cli-bin.mjs'
import { chatDir, homeDir } from './bus.mjs'

// Factory nhận `orca` (capability-gated host API) — closures từng là biến
// trong activate(); tách module phải nhận host qua tham số tường minh.
export function createRegistry(orca) {
  // Mirror roster + settings (panel settings ghi storage) ra file cho
  // Captain/bins/CLI đọc: ~/.claude/chat/roster.json {ceo, concurrency, members}
  let rosterMirror = ''
  const mirrorRoster = async () => {
    try {
      const [nm, ro, st] = await Promise.all([
        orca.host.call('storage.get', { key: 'team.chat.name' }).catch(() => null),
        orca.host.call('storage.get', { key: 'team.chat.roster' }).catch(() => null),
        orca.host.call('storage.get', { key: 'team.chat.settings' }).catch(() => null)
      ])
      const data = {
        ceo: (nm && nm.value) || 'CEO',
        concurrency: (st && st.value && st.value.concurrency) || 3,
        members: (ro && Array.isArray(ro.value)) ? ro.value : []
      }
      const s = JSON.stringify(data)
      if (s !== rosterMirror) {
        rosterMirror = s
        await writeFile(join(chatDir, 'roster.json'), s + '\n')
      }
    } catch { /* mirror best-effort */ }
  }

  // ── Captain room-scoped: mỗi room = 1 worktree + 1 captain trực ──
  let aliveCache = { at: 0, panes: new Set() }
  const livePanes = async () => {
    if (Date.now() - aliveCache.at < 20000) return aliveCache.panes
    let panes = new Set()
    try {
      const bin = orcaBin()
      const out = await new Promise((res) => execFileCb(bin, ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (out) for (const t of JSON.parse(out).result.terminals) panes.add(t.handle)
    } catch { /* list fail → rỗng để wake */ }
    aliveCache = { at: Date.now(), panes }
    return panes
  }
  // wake/adopt phải phá cache ngay (pane mới chưa kịp 20s TTL)
  const invalidateAliveCache = () => { aliveCache = { at: 0, panes: new Set() } }

  let termsCache = { at: 0, sig: '' }
  const publishTerminals = async () => {
    if (Date.now() - termsCache.at < 10000) return
    termsCache.at = Date.now()
    try {
      const bin = orcaBin()
      const out = await new Promise((res) => execFileCb(bin, ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!out) return
      const list = JSON.parse(out).result.terminals.map((t) => ({ handle: t.handle, title: (t.title || '').slice(0, 60), worktreePath: t.worktreePath || '' }))
      const sig = JSON.stringify(list)
      if (sig !== termsCache.sig) { termsCache.sig = sig; await orca.host.call('storage.set', { key: 'team.chat.terminals', value: list }).catch(() => {}) }
    } catch { /* best-effort */ }
  }

  const captainEntries = async () => {
    try {
      const reg = JSON.parse(await readFile(join(homeDir(), '.claude', 'chat', '.workers.json'), 'utf8'))
      return Object.entries(reg)
        .filter(([, e]) => e && e.name === 'captain')
        .map(([pane, e]) => ({ pane, room: e.room || null, worktree: e.worktree || '' }))
    } catch { return [] }
  }

  // .wakii live embed trong chat room: metadata.mindmap (path, ghi bởi team-chat
  // mindmap) → đọc file (cache theo mtime) → publish slot để panel render cây
  // tương tác ngay trong room; file đổi là card cập nhật theo. Toàn bộ
  // best-effort: embed fail (file thiếu, host từ chối…) KHÔNG được làm chết poller.
  const mmCache = new Map()
  const publishMindmaps = async () => {
    try {
      let rooms = {}
      try { rooms = JSON.parse(readFileSync(join(chatDir, 'rooms.json'), 'utf8')) } catch { return }
      const out = {}
      for (const [room, e] of Object.entries(rooms)) {
        const p = e && e.mindmap
        if (typeof p !== 'string' || !p.endsWith('.wakii')) continue
        const abs = p.startsWith('/') ? p : join(String(e.worktree || ''), p)
        if (!abs.startsWith('/')) continue
        let st
        try {
          st = statSync(abs)
        } catch { continue }
        const c = mmCache.get(room)
        if (c && c.mtime === st.mtimeMs && c.size === st.size) { out[room] = c.data; continue }
        const raw = readFileSync(abs, 'utf8')
        const tree = raw.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim()
        const data = { path: p, abs, mtime: st.mtimeMs, tree }
        mmCache.set(room, { mtime: st.mtimeMs, size: st.size, data })
        out[room] = data
      }
      if (Object.keys(out).length || mmCache.size) {
        await orca.host.call('storage.set', { key: 'team.chat.mindmaps', value: out }).catch(() => {})
      }
    } catch (e) {
      try { orca.log('wakii.team-chat mindmaps LỖI (best-effort): ' + ((e && e.message) || e)) } catch {}
    }
  }

  // Danh sách project đang mở cho create-room (CEO 1/11 tối: phải load được
  // current project / select project — hết cảnh gõ tay repo rồi fallback "team").
  // current = worktree của terminal active mới nhất; items = repo duy nhất từ
  // worktree list. Throttle 60s như terminals.
  let projectsAt = 0
  const publishProjects = async () => {
    try {
      if (Date.now() - projectsAt < 60000) return
      projectsAt = Date.now()
      const out = await new Promise((res) => execFileCb(orcaBin(), ['worktree', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!out) return
      const wts = JSON.parse(out).result.worktrees
      const items = []
      const seen = new Set()
      for (const w of wts) {
        // Chuẩn hoá \ → / để match /workspaces/ và tách tên trên cả path Windows.
        const p = String(w.path || '').replace(/\\/g, '/')
        if (!p.startsWith('/') && !/^[a-z]:/i.test(p)) continue
        const m = p.match(/\/workspaces\/([^/]+)\//)
        const name = m ? m[1] : (p.split('/').filter(Boolean).slice(-1)[0] || p)
        if (seen.has(name)) continue
        seen.add(name)
        items.push({ name, path: m ? p.slice(0, p.indexOf('/workspaces/')) : p })
      }
      let current = ''
      let currentPath = ''
      // Ưu tiên FOCUS (CEO ruling 2/11): workspace.readContext trả workspace
      // đang focus + terminal ids — project default = project của terminal
      // CEO đang focus, không phải terminal "ồn nhất".
      try {
        const ctx = await orca.host.call('workspace.readContext').catch(() => null)
        const ft = ctx && ctx.value && Array.isArray(ctx.value.terminals) && ctx.value.terminals[0]
        if (ft) {
          const tOut2 = await new Promise((res) => execFileCb(orcaBin(), ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
          if (tOut2) {
            const t2 = JSON.parse(tOut2).result.terminals.find((x) => x.handle === ft.handle || x.handle === ft)
            const w2 = t2 && String(t2.worktreePath || '').replace(/\\/g, '/')
            if (w2) {
              const m2 = w2.match(/\/workspaces\/([^/]+)\//)
              current = m2 ? m2[1] : (w2.split('/').filter(Boolean).slice(-1)[0] || '')
              currentPath = w2
            }
          }
        }
      } catch { /* focus best-effort */ }
      if (!current) {
        try {
          const tOut = await new Promise((res) => execFileCb(orcaBin(), ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
          if (tOut) {
            const terms = JSON.parse(tOut).result.terminals
            const withWt = terms.filter((t) => t.worktreePath).sort((a, b) => (b.lastOutputAt || 0) - (a.lastOutputAt || 0))
            const wt = withWt[0] && String(withWt[0].worktreePath).replace(/\\/g, '/')
            if (wt) {
              const mm = wt.match(/\/workspaces\/([^/]+)\//)
              current = mm ? mm[1] : (wt.split('/').filter(Boolean).slice(-1)[0] || '')
              currentPath = wt
            }
          }
        } catch { /* current best-effort — fallback heuristic */ }
      }
      await orca.host.call('storage.set', { key: 'team.chat.projects', value: {
        current,
        currentPath,
        // root workspaces để panel ghép path worktree dự kiến khi gõ room name
        root: join(homeDir(), 'orca', 'workspaces').replace(/\\/g, '/'),
        items
      } }).catch(() => {})
    } catch { /* projects best-effort */ }
  }

  const resolveRoomWorktree = async (room) => {
    // (0) metadata worktree room ghi tường minh trong rooms.json — nguồn chuẩn nhất
    // (đặt trước match-by-repo: endsWith('/'+repo) dính main checkout trước room worktree).
    try {
      const rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
      const meta = rooms[room] && rooms[room].worktree
      if (meta) return meta
    } catch { /* chưa có rooms.json */ }
    try {
      const reg = JSON.parse(await readFile(join(chatDir, '.workers.json'), 'utf8'))
      const wt = Object.values(reg).find((e) => e && e.room === room && e.worktree && e.name !== 'captain')?.worktree
      if (wt) return wt
    } catch { /* chưa có registration */ }
    try {
      const rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
      const repo = rooms[room] && rooms[room].repo
      const out = await new Promise((res) => execFileCb(orcaBin(), ['worktree', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!out) return ''
      const wts = JSON.parse(out).result.worktrees.map((w) => String(w.path || '').replace(/\\/g, '/'))
      return wts.find((p) => repo && p.endsWith('/' + repo)) || wts.find((p) => repo && p.includes(repo)) || ''
    } catch { return '' }
  }

  return {
    mirrorRoster,
    livePanes,
    invalidateAliveCache,
    publishTerminals,
    captainEntries,
    publishMindmaps,
    publishProjects,
    resolveRoomWorktree,
  }
}
