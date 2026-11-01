#!/usr/bin/env node
// Template commands (1/11): plan/done/blocked ép đúng khuôn §0.0 + G3.5;
// done thiếu flag phải từ chối; identity pane vẫn khóa tên qua send_msg.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, chmodSync } from 'node:fs'
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

// 5b) passthrough: --from/--channel không bị vòng parse template nuốt
r = run(['done', 'P', '--did', 'a', '--test', 'b', '--evidence', 'c', '--from', 'smith', '--channel', 'demo'])
ok(r.status === 0 && lastLine().from === 'smith' && lastLine().channel === 'demo',
  'done passthrough --from/--channel: ' + JSON.stringify(lastLine()))

// 5c) rooms registry: feature-open mở room, cleanup đóng room
import { spawnSync as _sp } from 'node:child_process'
const T2 = mkdtempSync(join(tmpdir(), 'pg-rooms-'))
const stubOrca = join(T2, 'orca')
writeFileSync(stubOrca, '#!/bin/bash\nif [ "$1" = worktree ] || [ "$1" = terminal ]; then echo OK; else echo \'{"result":{"run":{"id":"run_r"}}}\'; fi\n')
chmodSync(stubOrca, 0o755)
const roomsPath = join(T2, '.claude', 'chat', 'rooms.json')
const envRooms = {
  ...process.env,
  ORCA_BIN: stubOrca,
  TEAM_CHAT_LOG: join(T2, 'c.jsonl'),
  TEAM_EVENTS_LOG: join(T2, 'e.jsonl'),
  TEAM_TASK_GATES_DIR: join(T2, 'g'),
  TEAM_WORKERS_REG: join(T2, 'r.json'),
  HOME: T2
}
mkdirSync(join(T2, 'g')); mkdirSync(join(T2, 'wt'))
let rr = spawnSync('bash', [join(BIN, 'team-orch'), 'feature-open', '--name', 'pay', '--repo', 'shop'], { encoding: 'utf8', env: envRooms })
ok(rr.status === 0, 'feature-open room: ' + rr.stderr)
let rooms = JSON.parse(readFileSync(roomsPath, 'utf8'))
ok(rooms['shop-pay'] && rooms['shop-pay'].status === 'open' && rooms['shop-pay'].run === 'run_r', 'registry mở room shop-pay')
writeFileSync(join(T2, 'r.json'), JSON.stringify({ term_a: { name: 'w', worktree: join(T2, 'wt'), room: 'shop-pay' } }))
rr = spawnSync('bash', [join(BIN, 'team-orch'), 'cleanup', '--worktree', join(T2, 'wt')], { encoding: 'utf8', env: envRooms })
ok(rr.status === 0, 'cleanup room: ' + rr.stderr)
rooms = JSON.parse(readFileSync(roomsPath, 'utf8'))
ok(rooms['shop-pay'].status === 'closed', 'cleanup đóng room shop-pay')

// 6) TEMPLATES.md tồn tại trong skill + chứa đủ markers
const tpl = readFileSync(join(HERE, '..', 'skills', 'team-workflow', 'TEMPLATES.md'), 'utf8')
for (const marker of ['[PLAN]', 'DONE', 'BLOCKED', '📡', '[CEO→captain]', '🏁', '👷', '✅', 'run.created', 'lesson.proposed']) {
  ok(tpl.includes(marker), 'TEMPLATES.md thiếu marker: ' + marker)
}

rmSync(root, { recursive: true, force: true })
console.log('team-templates: 6 nhóm PASS (plan · done-enforce · done-format · blocked · identity · TEMPLATES.md)')
