// Wakii save (panel → canonical mindmaps/*.wakii) — fail-closed qua
// wakii-validate + merge machine-owned state. Layer L3: kit-bins + story-snapshot ← wakii-save.
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises'
import { accessSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { runKit, truncateReason } from './kit-bins.mjs'
import { scanWakiiDir, focusedWorktreePath, storyScanRoots } from './story-snapshot.mjs'
import { homeDir } from './bus.mjs'

const execFileAsync = promisify(execFileCb)

const WAKII_SAVE_MAX_BYTES = 200 * 1024 // storage cap 256KB trừ JSON-escape
// overhead của pretty-print doc (mỗi newline/quote escape phình 10-25%)
const WAKII_STATE_ENUM = new Set(['pending', 'in-progress', 'blocked', 'done', 'complete'])

export async function saveWakiiStory(orca, fileName, content, baseGeneratedAt, deletedIds, deps = {}) {
  try {
    if (typeof fileName !== 'string' || !fileName.endsWith('.wakii')
        || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { ok: false, error: 'tên file .wakii không hợp lệ: ' + String(fileName) }
    }
    if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'content rỗng' }
    if (Buffer.byteLength(content, 'utf8') > WAKII_SAVE_MAX_BYTES) {
      return { ok: false, error: 'wakii doc vượt transport cap 200KB (storage 256KB trừ JSON-escape overhead) — không round-trip qua panel được' }
    }
    const delSet = new Set(Array.isArray(deletedIds) ? deletedIds.filter(x => typeof x === 'string') : [])
    let incoming = null
    try { incoming = JSON.parse(content) } catch { return { ok: false, error: 'content không phải JSON' } }
    if (!incoming || incoming.wakiiMindmap !== 1 || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
      return { ok: false, error: 'content không phải wakii doc schema v1' }
    }
    // deps injection cho test hermetic (roots: scan roots; runKit: validator)
    const scanRoots = Array.isArray(deps.roots) ? async () => deps.roots : storyScanRoots
    const runValidator = deps.runKit || runKit

    // Locate target: file sẵn có theo storyScanRoots; chưa có → focused/first root
    let target = null
    for (const r of await scanRoots()) {
      const p = join(r, 'docs', 'superpowers', 'mindmaps', fileName)
      try { accessSync(p); target = p; break } catch { continue }
    }
    if (!target) {
      const base = deps.roots ? deps.roots[0] : ((await focusedWorktreePath()) || (await storyScanRoots())[0])
      if (!base) return { ok: false, error: 'không có workspace root để ghi: ' + fileName }
      target = join(base, 'docs', 'superpowers', 'mindmaps', fileName)
      mkdirSync(dirname(target), { recursive: true })
    }

    // Validate fail-closed: tmp cùng dir → wakii-validate --json (exit 1 FAIL / 2 usage)
    const tmp = join(dirname(target), '.' + basename(target) + '.tmp-' + process.pid)
    await writeFile(tmp, content, 'utf8')
    try {
      const val = await runValidator('wakii-validate', [tmp, '--json'])
      if (!val.ok) {
        return { ok: false, error: 'wakii-validate FAIL — không ghi: ' + truncateReason(val.error || 'exit != 0', 800) }
      }
    } finally {
      await unlink(tmp).catch(() => {})
    }

    // State-race merge: disk tiến trước panel (baseGeneratedAt lệch) → copy
    // state machine-owned của sf/epic cùng id từ disk (panel không edit state)
    let disk = null
    try { disk = JSON.parse(await readFile(target, 'utf8')) } catch { /* missing/corrupt → new file */ }
    let merged = incoming
    let stateMerged = false
    if (disk?.wakiiMindmap === 1 && baseGeneratedAt && disk.meta?.generatedAt !== baseGeneratedAt) {
      merged = structuredClone(incoming)
      const diskStates = new Map((disk.nodes || [])
        .filter(n => n && (n.kind === 'sf' || n.kind === 'epic')
                     && typeof n.state === 'string' && WAKII_STATE_ENUM.has(n.state))
        .map(n => [n.id, n.state]))
      for (const n of merged.nodes || []) {
        if (n && (n.kind === 'sf' || n.kind === 'epic') && diskStates.has(n.id) && n.state !== diskStates.get(n.id)) {
          n.state = diskStates.get(n.id); stateMerged = true
        }
      }
    }
    // Stale guard: disk có sf id không có trong incoming lẫn deletedIds → file
    // bị regenerate dưới chân panel — không đoán merge, bảo panel reload
    if (disk && Array.isArray(disk.nodes)) {
      const inIds = new Set((merged.nodes || []).map(n => n?.id))
      const stale = disk.nodes.filter(n => n?.kind === 'sf' && !inIds.has(n.id) && !delSet.has(n.id))
      if (stale.length) return { ok: false, error: 'stale-doc', staleSfs: stale.map(n => n.id).slice(0, 10) }
    }

    // Idempotent: payload giống disk (bỏ generatedAt) → không write, không bump
    const stripGen = (d) => { const c = structuredClone(d); if (c?.meta) delete c.meta.generatedAt; return stableJson(c) }
    if (disk && stripGen(disk) === stripGen(merged)) {
      return { ok: true, stdout: 'unchanged: ' + fileName }
    }
    // Atomic write: tmp cùng dir + rename (mirror story-mindmap writeAtomic)
    const tmpW = join(dirname(target), '.' + basename(target) + '.w-' + process.pid)
    writeFileSync(tmpW, JSON.stringify(merged, null, 2) + '\n', 'utf8')
    renameSync(tmpW, target)
    return { ok: true, stdout: 'saved wakii: ' + target + (stateMerged ? ' (merge state từ disk)' : '') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('wakii save failed: ' + message)
    return { ok: false, error: message }
  }
}

// Chuỗi hoá ổn định thứ tự key — so sánh payload không phụ thuộc key order
function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}'
  }
  return JSON.stringify(v) ?? 'null'
}

async function collectStoryOps(orca) {
  try {
    const out = { sfs: [], fetchedAt: new Date().toISOString() }
    const chk = await runKit('story-resume', ['--check'])
    if (chk.ok) {
      for (const line of chk.stdout.split('\n')) {
        const parts = line.split('|')
        if (parts.length >= 2 && parts[0].trim().startsWith('sf-')) {
          const sf = parts[0].trim()
          // repo: scan workspaces tìm worktree sf-* (cho heartbeat path)
          let repo = ''
          try { for (const r of await readdir(join(homeDir(), 'orca', 'workspaces'))) {
            try { await readFile(join(homeDir(), 'orca', 'workspaces', r, sf, '.git'), 'utf8'); repo = r; break } catch {}
          } } catch {}
          out.sfs.push({ sf, repo, verdict: parts[1].trim(), stallDetail: parts.slice(2).join('|').trim() })
        }
      }
    } else {
      out.error = 'story-resume: ' + chk.error
    }
    const ver = await runKit('story-verify', ['--json'])
    if (ver.ok) {
      try {
        for (const v of JSON.parse(ver.stdout)) {
          let row = out.sfs.find(s => s.sf === v.sf)
          if (!row) { row = { sf: v.sf }; out.sfs.push(row) }
          row.dod = v.verdict
          row.steps = v.steps || null
          row.detail = v.detail || ''
        }
      } catch { out.errorVerify = 'verify JSON parse failed' }
    } else {
      out.errorVerify = 'story-verify: ' + ver.error
    }
    // ── GAP queue: REQUIREMENT-GAP chưa có GAP-ANSWER trên mọi epic đang chạy
    out.gaps = []
    out.complete = []
    try {
      const keyFile = join(homeDir(), '.claude', '.linear-key')
      let key = process.env.LINEAR_API_KEY || ''
      if (!key) { try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch {} }
      if (key) {
        // candidates {epic, file} — mindmaps canonical first, brackets shadowed
        const cands = new Map()
        for (const r of await storyScanRoots()) {
          for (const w of await scanWakiiDir(r)) {
            if (w.linear && !cands.has(w.linear)) cands.set(w.linear, w.file)
          }
          let ents = []
          try { ents = await readdir(join(r, 'docs', 'superpowers', 'brackets')) } catch { continue }
          for (const f of ents.filter(x => x.endsWith('.md'))) {
            let text = ''
            try { text = await readFile(join(r, 'docs', 'superpowers', 'brackets', f), 'utf8') } catch { continue }
            const hm = text.match(/^# Story:\s*([A-Za-z]+-\d+)/m)
            if (hm && !cands.has(hm[1])) cands.set(hm[1], f)
          }
        }
        for (const [epic, file] of cands) {
          const gq = `query{issue(id:"${epic}"){state{name} title comments(first:50){nodes{body createdAt}} children(first:20){nodes{state{name}}}}}`
          const rr = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gq }) })
          const jj = await rr.json()
          const iss = jj?.data?.issue
          if (!iss || iss.state?.name === 'Done') continue
          const ch = iss.children?.nodes || []
          if (ch.length && ch.every(c => c.state?.name === 'Done')) {
            out.complete.push({ epic, title: (iss.title || file).slice(0, 40) })
          }
          const cs = iss.comments?.nodes || []
          const answered = cs.some(c => /^\s*GAP-ANSWER/m.test(c.body || ''))
          for (const c of cs) {
            const b = c.body || ''
            const gm = b.match(/REQUIREMENT-GAP[:：][^\n]{0,160}/)
            if (gm && !answered) out.gaps.push({ epic, file: file.replace(/\.(wakii|md)$/, ''), snippet: gm[0].slice(0, 140), at: c.createdAt })
          }
        }
      }
    } catch { /* gap queue optional */ }

    // heartbeat: commit cuối + dirty per SF (worktree git — kiểu story-top)
    for (const row of out.sfs) {
      try {
        const wt = join(homeDir(), 'orca', 'workspaces', row.repo || '', row.sf)
        const { execFile: ef } = await import('node:child_process')
        const { promisify: pf } = await import('node:util')
        const efa = pf(ef)
        const gl = await efa('git', ['-C', wt, 'log', '-1', '--format=%ct|%s'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
        const [cts, ...rest] = (gl.stdout || '').split('|')
        if (cts) {
          row.commitAge = Math.round((Date.now() / 1000) - Number(cts))
          row.commitSubj = rest.join('|').slice(0, 40)
        }
        const gs = await efa('git', ['-C', wt, 'status', '--short'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
        row.dirty = (gs.stdout || '').split('\n').filter(l => l.trim() && !l.includes('.agent-session')).length
      } catch { /* heartbeat optional */ }
    }
    await orca.host.call('storage.set', { key: 'story.ops', value: out })
    return { ok: true, sfs: out.sfs.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story ops failed: ' + message)
    return { ok: false, error: message }
  }
}

// GAP-ANSWER: user trả lời REQUIREMENT-GAP ngay từ panel — worker post
// comment lên EPIC qua GraphQL (keychain độc lập, mọi SF thấy đáp án).
async function postGapAnswer(epic, text) {
  try {
    const keyFile = join(homeDir(), '.claude', '.linear-key')
    let key = process.env.LINEAR_API_KEY || ''
    if (!key) {
      try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch { key = '' }
    }
    if (!key) return { ok: false, error: 'không có Linear key (~/.claude/.linear-key)' }
    const iss = await (async () => {
      const b = JSON.stringify({ query: `query{issue(id:"${epic}"){id}}` })
      const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: b })
      return (await r.json()).data?.issue?.id || null
    })()
    if (!iss) return { ok: false, error: 'epic không tìm thấy: ' + epic }
    const body = JSON.stringify({ query: `mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}`,
      variables: { i: { issueId: iss, body: `GAP-ANSWER (từ panel): ${text}` } } })
    const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body })
    const j = await r.json()
    const okFlag = j?.data?.commentCreate?.success === true
    return { ok: okFlag, stdout: okFlag ? `Đã post GAP-ANSWER lên ${epic}` : JSON.stringify(j).slice(0, 300) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// CLOSE story: epic → Done + audit STORY-COMPLETE (panel button)
async function postCloseStory(epic) {
  try {
    const keyFile = join(homeDir(), '.claude', '.linear-key')
    let key = process.env.LINEAR_API_KEY || ''
    if (!key) { try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch { key = '' } }
    if (!key) return { ok: false, error: 'không có Linear key' }
    const iss = await (async () => {
      const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `query{issue(id:"${epic}"){id team{states{nodes{id name}}}}}` }) })
      return (await r.json()).data?.issue
    })()
    if (!iss) return { ok: false, error: 'epic không tìm thấy: ' + epic }
    const done = iss.team?.states?.nodes?.find(x => x.name === 'Done')
    if (!done) return { ok: false, error: 'không tìm state Done' }
    const r1 = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation($id:String!,$u:IssueUpdateInput!){issueUpdate(id:$id,input:$u){success}}', variables: { id: iss.id, u: { stateId: done.id } } }) })
    const ok1 = (await r1.json())?.data?.issueUpdate?.success === true
    const r2 = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}', variables: { i: { issueId: iss.id, body: `**STORY-COMPLETE** — đóng từ panel. Code trên nhánh đích; merge main là việc USER.` } } }) })
    const ok2 = (await r2.json())?.data?.commentCreate?.success === true
    return { ok: ok1 && ok2, stdout: `epic ${epic} → Done + audit ${ok2 ? '✓' : '✗'}` }
  } catch (err) { return { ok: false, error: err.message } }
}

// ---- Kit manifest pre-flight (fail-loud) ----
// Zero-dep (không ajv): schema tay + two-way provides ↔ đĩa. Chạy MỖI lần
// activate, TRƯỚC marker early-return — kit hỏng phải được biết ngay, không
// chết lặng lẽ. Trả mảng problems (rỗng = hợp lệ).

