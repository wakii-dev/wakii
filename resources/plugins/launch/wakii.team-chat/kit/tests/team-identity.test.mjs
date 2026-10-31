#!/usr/bin/env node
// P0 (31/10): danh tính pane + guard chữ ký ghi + chống tự duyệt + worker-start wiring.
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN = join(HERE, '..', 'bin')
const root = mkdtempSync(join(tmpdir(), 'pg-id-'))
const gates = join(root, 'gates')
const reg = join(root, 'reg.json')
const chatLog = join(root, 'chat.jsonl')
const eventsLog = join(root, 'events.jsonl')
const wt = join(root, 'wt-demo')
mkdirSync(gates)
mkdirSync(wt)
const env = {
  ...process.env,
  TEAM_TASK_GATES_DIR: gates,
  TEAM_WORKERS_REG: reg,
  TEAM_CHAT_LOG: chatLog,
  TEAM_EVENTS_LOG: eventsLog,
  ORCA_BIN: '/usr/bin/false'
}
const b64 = Buffer.from(wt).toString('base64url')
const markerPath = join(gates, b64 + '.json')
writeFileSync(markerPath, JSON.stringify({ taskId: 't1', planGateOpen: true, worktreePath: wt }))
const guard = (payload) =>
  spawnSync('python3', [join(BIN, 'story-guard-plan-gate')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env
  })
const run = (bin, args, extraEnv = {}) =>
  spawnSync('bash', [join(BIN, bin), ...args], {
    encoding: 'utf8',
    env: { ...env, ...extraEnv }
  })
const ok = (cond, msg) => {
  if (!cond) {
    console.error('FAIL: ' + msg)
    process.exit(1)
  }
}

// ── 1) Guard: chữ ký ghi mới (P2-1) ──
for (const cmd of [
  "python3 -c \"open('x','w')\"",
  'node -e "fs.writeFileSync(1,2)"',
  'cp a b',
  'mv a b',
  'dd if=a of=b',
  'git commit -m x'
]) {
  const r = guard({ tool_name: 'Bash', cwd: wt, tool_input: { command: cmd } })
  ok(r.status === 2, `guard phải chặn: ${cmd} (exit ${r.status})`)
}
for (const cmd of ['rg pattern dir', 'ls -la', 'echo hello', 'cat README.md']) {
  const r = guard({ tool_name: 'Bash', cwd: wt, tool_input: { command: cmd } })
  ok(r.status === 0, `guard phải cho qua: ${cmd} (exit ${r.status})`)
}

// ── 2) Registration + identity lock (P0-2) ──
let r = run('team-orch', [
  'register',
  '--pane',
  'term_smith',
  '--name',
  'smith',
  '--worktree',
  wt,
  '--task',
  't1',
  '--run',
  'r1',
  '--repo',
  'demo',
  '--room',
  'demo-hello'
])
ok(r.status === 0, 'register phải exit 0: ' + r.stderr)
const regData = JSON.parse(readFileSync(reg, 'utf8'))
ok(regData.term_smith?.name === 'smith', 'registration ghi pane→name')

// pane đã đăng ký, giả danh weaver → exit 1; đúng tên smith → exit 0
r = run('team-chat', ['send', 'giả danh', '--from', 'weaver'], { ORCA_AGENT_PANE: 'term_smith' })
ok(r.status === 1 && /TỪ CHỐI/.test(r.stderr), 'spoof phải bị từ chối exit 1')
r = run('team-chat', ['send', 'smith thật', '--from', 'smith'], { ORCA_AGENT_PANE: 'term_smith' })
ok(r.status === 0, 'gửi đúng tên phải OK: ' + r.stderr)
const lines = readFileSync(chatLog, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
ok(lines.at(-1).from === 'smith', 'bus ghi tên smith')

// pane KHÔNG đăng ký → tự do (CEO/Captain terminal)
r = run('team-chat', ['send', 'từ terminal tự do', '--from', 'captain'], {
  ORCA_AGENT_PANE: 'term_other'
})
ok(r.status === 0, 'pane chưa đăng ký phải tự do')

// ── 3) Chống tự duyệt (P0-2) ──
r = run(
  'team-orch',
  ['gate-resolve', '--id', 'g1', '--resolution', 'approved', '--plan', '--worktree', wt],
  { ORCA_AGENT_PANE: 'term_smith' }
)
ok(r.status === 3 && /không tự duyệt/.test(r.stderr), 'worker tự duyệt phải exit 3')
const markerAfter = JSON.parse(readFileSync(markerPath, 'utf8'))
ok(markerAfter.planGateOpen === true, 'marker phải CÒN OPEN sau lần từ chối')

// Captain (pane không đăng ký) → stub orca thành công → marker đóng
const stub = join(root, 'orca-stub.sh')
writeFileSync(stub, '#!/bin/bash\necho "Gate g1 resolved: approved"\n')
chmodSync(stub, 0o755)
run(
  'team-orch',
  ['gate-resolve', '--id', 'g1', '--resolution', 'approved', '--plan', '--worktree', wt],
  {
    ORCA_BIN: stub,
    ORCA_AGENT_PANE: ''
  }
)
const env2 = { ...env, ORCA_BIN: stub }
const r2 = spawnSync(
  'bash',
  [
    join(BIN, 'team-orch'),
    'gate-resolve',
    '--id',
    'g1',
    '--resolution',
    'approved',
    '--plan',
    '--worktree',
    wt
  ],
  {
    encoding: 'utf8',
    env: { ...env2, ORCA_AGENT_PANE: '' }
  }
)
ok(r2.status === 0, 'captain duyệt phải exit 0: ' + r2.stderr)
ok(
  JSON.parse(readFileSync(markerPath, 'utf8')).planGateOpen === false,
  'marker đóng sau captain duyệt'
)

// ── 4) worker-start wiring (P0-1): stub receipt → hooks + registration + marker ──
const wt2 = join(root, 'wt-worker')
mkdirSync(wt2)
const stubStart = join(root, 'orca-worker-stub.sh')
writeFileSync(
  stubStart,
  `#!/bin/bash
echo '{"result":{"worker":{"terminal":"term_newworker","workspace":"${wt2}"}}}'
`
)
chmodSync(stubStart, 0o755)
const env3 = { ...env, ORCA_BIN: stubStart }
const r3 = spawnSync(
  'bash',
  [
    join(BIN, 'team-orch'),
    'worker-start',
    '--task',
    't2',
    '--worktree',
    'new-top-level',
    '--agent',
    'claude',
    '--name',
    'weaver-ui',
    '--repo',
    'demo',
    '--run',
    'r1',
    '--require-plan-approval'
  ],
  {
    encoding: 'utf8',
    env: env3
  }
)
ok(r3.status === 0, 'worker-start (stub) phải exit 0: ' + r3.stderr + r3.stdout)
// hooks cài vào wt2
const settingsPath = join(wt2, '.claude', 'settings.json')
ok(existsSync(settingsPath), 'worker-start cài .claude/settings.json vào worktree')
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
const pre = settings.hooks?.PreToolUse?.find((h) => h.matcher?.includes('Bash'))
const ss = settings.hooks?.SessionStart?.[0]
ok(pre?.hooks?.[0]?.command?.endsWith('story-guard-plan-gate'), 'PreToolUse hook trỏ guard')
ok(ss?.hooks?.[0]?.command?.endsWith('team-session-brief'), 'SessionStart hook trỏ brief')
// idempotent: chạy lần 2 không nhân đôi hook
spawnSync(
  'bash',
  [
    join(BIN, 'team-orch'),
    'worker-start',
    '--task',
    't2',
    '--worktree',
    'new-top-level',
    '--agent',
    'claude',
    '--name',
    'weaver-ui',
    '--repo',
    'demo',
    '--run',
    'r1',
    '--require-plan-approval'
  ],
  { encoding: 'utf8', env: env3 }
)
const settings2 = JSON.parse(readFileSync(settingsPath, 'utf8'))
ok(
  settings2.hooks.PreToolUse.filter((h) => h.matcher?.includes('Bash')).length === 1,
  'hook không nhân đôi'
)
// registration tự ghi từ receipt
const reg2 = JSON.parse(readFileSync(reg, 'utf8'))
ok(
  reg2.term_newworker?.name === 'weaver',
  'pane từ receipt được đăng ký: ' + JSON.stringify(reg2.term_newworker)
)
// marker mở theo worktree thật bóc từ receipt
const b642 = Buffer.from(wt2).toString('base64url')
const marker2 = JSON.parse(readFileSync(join(gates, b642 + '.json'), 'utf8'))
ok(
  marker2.planGateOpen === true && marker2.worktreePath === wt2,
  'plan-gate mở theo path từ receipt'
)

// ── 5) team-session-brief (P0-1) ──
writeFileSync(
  chatLog,
  JSON.stringify({
    at: 1,
    from: 'captain',
    role: 'captain',
    channel: 'demo-hello',
    text: 'bắt đầu nhé'
  }) + '\n'
)
const r5 = spawnSync('python3', [join(BIN, 'team-session-brief')], {
  encoding: 'utf8',
  env: { ...env, ORCA_AGENT_PANE: 'term_newworker', TEAM_WORKTREE: wt2, PWD: wt2 }
})
ok(r5.status === 0, 'brief exit 0')
ok(/bạn là weaver/.test(r5.stdout), 'brief xưng danh weaver')
ok(/PLAN-GATE ĐANG OPEN/.test(r5.stdout), 'brief báo gate OPEN + Bước 0')
ok(/\[PLAN\]/.test(r5.stdout), 'brief chỉ thị post [PLAN]')

// unregister dọn
r = run('team-orch', ['unregister', '--pane', 'term_newworker'])
ok(
  r.status === 0 && !JSON.parse(readFileSync(reg, 'utf8')).term_newworker,
  'unregister xoá đăng ký'
)

rmSync(root, { recursive: true, force: true })
console.log(
  'team-identity: 5 nhóm PASS (guard signatures · identity lock · chống tự duyệt · worker wiring · brief)'
)
