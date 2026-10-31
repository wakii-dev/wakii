#!/usr/bin/env node
// Template commands (1/11): plan/done/blocked ép đúng khuôn §0.0 + G3.5;
// done thiếu flag phải từ chối; identity pane vẫn khóa tên qua send_msg.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN = join(HERE, '..', 'bin')
const root = mkdtempSync(join(tmpdir(), 'pg-tpl-'))
const chatLog = join(root, 'chat.jsonl')
const reg = join(root, 'reg.json')
const env = {
  ...process.env,
  TEAM_CHAT_LOG: chatLog,
  TEAM_EVENTS_LOG: join(root, 'ev.jsonl'),
  TEAM_WORKERS_REG: reg,
  TEAM_TASK_GATES_DIR: join(root, 'gates')
}
mkdirSync(join(root, 'gates'))
const run = (args, extraEnv = {}) => spawnSync('bash', [join(BIN, 'team-chat'), ...args], {
  encoding: 'utf8', env: { ...env, ...extraEnv }
})
const ok = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1) } }
const lastLine = () => JSON.parse(readFileSync(chatLog, 'utf8').trim().split('\n').at(-1))

// 1) plan → [PLAN] prefix, role worker
let r = run(['plan', 'tạo X.md 2 dòng, verify cat', '--channel', 'demo'])
ok(r.status === 0, 'plan exit 0: ' + r.stderr)
let m = lastLine()
ok(m.text.startsWith('[PLAN] tạo X.md'), 'plan tiền tố [PLAN]: ' + m.text)
ok(m.role === 'worker', 'plan role worker')

// 2) done thiếu flag → exit 2 + usage
r = run(['done', 'X.md', '--did', 'tạo file'])
ok(r.status === 2 && /3 phần/.test(r.stderr), 'done thiếu --test/--evidence phải exit 2: ' + r.status)

// 3) done đủ 3 flag → khuôn ①②③
r = run(['done', 'X.md', '--did', 'tạo file 2 dòng', '--test', 'cat X.md', '--evidence', 'wc -l = 2'])
ok(r.status === 0, 'done đủ flag exit 0: ' + r.stderr)
m = lastLine()
ok(/^DONE X\.md — ① Đã làm: tạo file 2 dòng ② Cách test: cat X\.md ③ Bằng chứng: wc -l = 2$/.test(m.text),
  'done khuôn ①②③ đúng: ' + m.text)

// 4) blocked → prefix
r = run(['blocked', 'thiếu API key, đã thử env + .env'])
ok(r.status === 0, 'blocked exit 0')
m = lastLine()
ok(m.text.startsWith('BLOCKED thiếu API key'), 'blocked prefix: ' + m.text)

// 5) identity: pane đã đăng ký smith → plan tự ghi tên smith, spoof bị chặn
writeFileSync(reg, JSON.stringify({ term_s: { name: 'smith', worktree: '/tmp/w' } }))
r = run(['plan', 'việc của smith'], { ORCA_AGENT_PANE: 'term_s' })
ok(r.status === 0, 'plan với pane đăng ký OK')
m = lastLine()
ok(m.from === 'smith', 'plan from=smith theo registration: ' + m.from)
r = run(['plan', 'giả danh', '--from', 'weaver'], { ORCA_AGENT_PANE: 'term_s' })
ok(r.status === 1, 'plan spoof qua --from phải bị chặn')

// 6) TEMPLATES.md tồn tại trong skill + chứa đủ markers
const tpl = readFileSync(join(HERE, '..', 'skills', 'team-workflow', 'TEMPLATES.md'), 'utf8')
for (const marker of ['[PLAN]', 'DONE', 'BLOCKED', '📡', '[CEO→captain]', '🏁', '👷', '✅', 'run.created', 'lesson.proposed']) {
  ok(tpl.includes(marker), 'TEMPLATES.md thiếu marker: ' + marker)
}

rmSync(root, { recursive: true, force: true })
console.log('team-templates: 6 nhóm PASS (plan · done-enforce · done-format · blocked · identity · TEMPLATES.md)')
