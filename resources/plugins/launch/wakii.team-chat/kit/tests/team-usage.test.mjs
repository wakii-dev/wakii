#!/usr/bin/env node
// FI-97 SF-C — team-usage: token usage per dispatch từ ledger room + session jsonl;
// team-chat done ghi endedAt vào ledger (lifecycle).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..')
const USAGE = join(KIT, 'bin', 'team-usage')
const CHAT = join(KIT, 'bin', 'team-chat')

const now = Date.now()
const T = (minAgo) => now - minAgo * 60000
const iso = (minAgo) => new Date(T(minAgo)).toISOString()
// Windows path fixture — munge phải biến \ + : thành - giống Claude Code projects dir
const WT = 'C:\\fake\\wt-alpha'
const MUNGED = 'C--fake-wt-alpha'

function scenario({ ledger = [], sessions = {}, bus = [], reg = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tc-usage-'))
  const chatDir = join(root, '.claude', 'chat')
  const projDir = join(root, '.claude', 'projects', MUNGED)
  mkdirSync(chatDir, { recursive: true })
  mkdirSync(projDir, { recursive: true })
  if (ledger.length) {
    mkdirSync(join(chatDir, 'ledger'), { recursive: true })
    writeFileSync(join(chatDir, 'ledger', 'alpha.jsonl'), ledger.join('\n') + '\n')
  }
  for (const [name, lines] of Object.entries(sessions)) {
    writeFileSync(join(projDir, name + '.jsonl'), lines.join('\n') + '\n')
  }
  if (bus.length) writeFileSync(join(chatDir, 'team-chat.jsonl'), bus.join('\n') + '\n')
  if (Object.keys(reg).length) writeFileSync(join(chatDir, '.workers.json'), JSON.stringify(reg))
  return {
    root,
    run(args) {
      return spawnSync('bash', [USAGE, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env, HOME: root, TEAM_LEDGER_DIR: join(chatDir, 'ledger'),
          TEAM_CHAT_LOG: join(chatDir, 'team-chat.jsonl'), PYTHONUTF8: '1',
        },
      })
    },
    chatRun(args, extraEnv = {}) {
      return spawnSync('bash', [CHAT, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env, HOME: root, TEAM_LEDGER_DIR: join(chatDir, 'ledger'),
          TEAM_CHAT_LOG: join(chatDir, 'team-chat.jsonl'),
          TEAM_WORKERS_REG: join(chatDir, '.workers.json'),
          TEAM_CHAT_MACHINE: '1', PYTHONUTF8: '1', ...extraEnv,
        },
      })
    },
    ledgerPath: join(chatDir, 'ledger', 'alpha.jsonl'),
  }
}

const asst = (minAgo, inp, out, cacheR, cacheW) => JSON.stringify({
  type: 'assistant', timestamp: iso(minAgo),
  message: { role: 'assistant', usage: { input_tokens: inp, output_tokens: out,
    cache_read_input_tokens: cacheR, cache_creation_input_tokens: cacheW } },
})
const noise = (minAgo) => JSON.stringify({ type: 'user', timestamp: iso(minAgo), message: { role: 'user' } })
const busMsg = (minAgo, from, role, text, channel = 'alpha') =>
  JSON.stringify({ at: T(minAgo), from, role, channel, text })

const dispatch = (pane, name, session, startedMinAgo, task, disp) => JSON.stringify({
  v: 1, kind: 'dispatch', pane, name, room: 'alpha', task, worktree: WT,
  dispatchId: disp, session, startedAt: T(startedMinAgo),
})

// ── 1) --top: rank theo in+out+cacheW, loại usage ngoài cửa sổ (sau endedAt) ──
const s1 = scenario({
  ledger: [
    dispatch('term_a', 'smith', 'sessA', 30, 't1', 'd1'), // đã DONE (end T(10))
    dispatch('term_b', 'vic', 'sessB', 20, 't2', 'd2'), // còn chạy → window tới now
    JSON.stringify({ v: 1, kind: 'end', pane: 'term_a', room: 'alpha', endedAt: T(10) }),
    '{dòng hỏng\n',
  ],
  sessions: {
    sessA: [noise(29), asst(28, 1000, 100, 0, 50), asst(25, 2000, 200, 5000, 150), asst(5, 99999, 99999, 0, 0), noise(3)],
    sessB: [asst(15, 500, 50, 100, 10)],
  },
})
const r1 = s1.run(['--room', 'alpha'])
if (r1.status !== 0) { console.error('1) exit ≠ 0: ' + r1.stderr); process.exit(1) }
const lines1 = r1.stdout.trim().split('\n')
// smith total = 1000+100+50 + 2000+200+150 = 3500 (dòng T(5) sau endedAt phải bị loại)
// vic total = 500+50+10 = 560
if (!lines1[1].startsWith('1 smith') || !lines1[1].includes('total=3500')) {
  console.error('1) rank/tổng smith sai:\n' + r1.stdout); process.exit(1)
}
if (!lines1[2].startsWith('2 vic') || !lines1[2].includes('total=560')) {
  console.error('1) rank/tổng vic sai:\n' + r1.stdout); process.exit(1)
}
if (lines1[1].includes('99999')) { console.error('1) usage sau endedAt vẫn được cộng'); process.exit(1) }

// ── 2) --why: tokens + round-trips + bus counts (blocked/hỏi/done từ tên worker) ──
const s2 = scenario({
  ledger: [dispatch('term_a', 'smith', 'sessA', 30, 't1', 'd1')],
  sessions: { sessA: [asst(28, 1000, 100, 0, 50), asst(25, 2000, 200, 5000, 150)] },
  bus: [
    busMsg(27, 'smith', 'worker', 'BLOCKED gate không mở'),
    busMsg(24, 'smith', 'worker', '[HỎI] chọn (a) hay (b)?'),
    busMsg(23, 'smith', 'worker', 'đang làm'), // không chip — không đếm
    busMsg(22, 'vic', 'worker', 'BLOCKED của worker khác — không đếm'),
    busMsg(1, 'smith', 'worker', 'DONE t1 — ① xong'), // sau startedAt — đếm done
  ],
})
const r2 = s2.run(['--why', 'term_a'])
if (r2.status !== 0) { console.error('2) exit ≠ 0: ' + r2.stderr); process.exit(1) }
const out2 = r2.stdout
for (const [key, val] of [['round-trips=2', 1], ['BLOCKED=1', 1], ['hỏi=1', 1], ['done=1', 1],
  ['total(in+out+cacheW)=3500', 1], ['task=t1', 1], ['dispatch=d1', 1]]) {
  if (!out2.includes(key)) { console.error(`2) thiếu "${key}":\n` + out2); process.exit(1) }
}

// ── 3) --why pane lạ + ledger trống → thông điệp, exit 0 ──
const r3 = s2.run(['--why', 'term_ghost'])
if (r3.status !== 0 || !r3.stdout.includes('không có dispatch')) { console.error('3): ' + r3.stdout + r3.stderr); process.exit(1) }
const s3 = scenario({})
const r3b = s3.run(['--room', 'alpha'])
if (r3b.status !== 0 || !r3b.stdout.includes('trống')) { console.error('3b) ledger trống: ' + r3b.stdout + r3b.stderr); process.exit(1) }

// ── 4) team-chat done → ghi endedAt vào ledger room (pane đã đăng ký) ──
const s4 = scenario({
  ledger: [dispatch('term_x', 'bee', '', 30, 't1', 'd1')],
  reg: { term_x: { name: 'bee', room: 'alpha', worktree: WT, at: T(31), task: 't1' } },
})
const r4 = s4.chatRun(['done', 't1', '--did', 'xong', '--test', 'node test', '--evidence', 'PASS', '--channel', 'alpha'],
  { ORCA_AGENT_PANE: 'term_x' })
if (r4.status !== 0) { console.error('4) done exit ≠ 0: ' + r4.stderr); process.exit(1) }
const ledgerAfter = readFileSync(s4.ledgerPath, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l) } catch { return {} } })
const endLine = ledgerAfter.find((l) => l.kind === 'end')
if (!endLine || endLine.pane !== 'term_x' || endLine.room !== 'alpha' || !endLine.endedAt) {
  console.error('4) thiếu dòng end sau done: ' + JSON.stringify(ledgerAfter)); process.exit(1)
}

// ── 5) done khi room CHƯA có ledger → không tạo file rác ──
const s5 = scenario({ reg: { term_y: { name: 'cal', room: 'beta', worktree: WT, at: T(5) } } })
const r5 = s5.chatRun(['done', 't9', '--did', 'x', '--test', 'y', '--evidence', 'z', '--channel', 'beta'],
  { ORCA_AGENT_PANE: 'term_y' })
if (r5.status !== 0) { console.error('5) done exit ≠ 0: ' + r5.stderr); process.exit(1) }
if (existsSync(join(s5.root, '.claude', 'chat', 'ledger', 'beta.jsonl'))) {
  console.error('5) done tự tạo ledger room chưa có dispatch'); process.exit(1)
}

console.log('PASS team-usage (FI-97 SF-C): rank theo in+out+cacheW + window startedAt→endedAt + --why bus counts + done ghi endedAt + không tạo ledger rác')
