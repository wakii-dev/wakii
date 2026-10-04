#!/usr/bin/env node
// story-pane-watch tests — detector 4-state qua stub-orca seam (Orchestrated HITL
// spec 04/10). Stub terminal list trả handle TĂNG DẦN theo file-counter (mỗi lần
// gọi = process stub mới — biến shell không giữ state), terminal read tra
// STUB_READS map handle→response. Phủ: W1 4 state đúng priority, W2 fail-open
// orca chết, W3 blocked thắng tail trộn signature, W4 lineage ưu tiên + fallback
// same-folder sf-N-.
// Chạy: node tests/story-pane-watch-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const BIN = join(pluginRoot, 'kit', 'bin', 'story-pane-watch')

let pass = 0, fail = 0
const check = (id, name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${id} ${name}`) }
  else { fail++; console.log(`  [FAIL] ${id} ${name}${detail ? ' — ' + detail : ''}`) }
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `spw-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function parseOut(out) {
  try { return JSON.parse(out) } catch { return null }
}

// stub orca: worktree list đọc file STUB_WTLIST; terminal list trả handle
// term_w<N> tăng dần qua file-counter STUB_CNT (process stub mới mỗi lần gọi);
// terminal read ($4 = handle) tra STUB_READS JSON map handle→response, key '*'
// làm default cho handle nào không có entry riêng.
function makeStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(join(dir, 'cnt'), '0\n', 'utf8')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "list" ]; then
  cat "\${STUB_WTLIST:?}"
  exit 0
fi
if [ "$1" = "terminal" ] && [ "$2" = "list" ]; then
  read N < "\${STUB_CNT:?}"
  N=$((N=N+1))
  printf '%s\\n' "$N" > "\${STUB_CNT:?}"
  printf '{"terminals":[{"handle":"term_w%s"}]}' "$N"
  exit 0
fi
if [ "$1" = "terminal" ] && [ "$2" = "read" ]; then
  STUB_HANDLE="$4" node -e 'const m=JSON.parse(process.env.STUB_READS);const e=m[process.env.STUB_HANDLE]||m["*"];process.stdout.write(JSON.stringify(e[0]))'
  exit 0
fi
exit 0
`, 'utf8')
  chmodSync(stub, 0o755)
  // seam PATH: copy thành <dir>/bin/orca để bin fallback `command -v orca` tìm thấy
  mkdirSync(join(dir, 'bin'), { recursive: true })
  copyFileSync(stub, join(dir, 'bin', 'orca'))
  chmodSync(join(dir, 'bin', 'orca'), 0o755)
  return stub
}

function runWatch(dir, env = {}) {
  const r = spawnSync('bash', [BIN, '--story', join(dir, 'hub'), '--json'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

// dựng hub dir thật (bin check -d) + wtlist file + env chung qua stub
function setupCase(dir, wtlist) {
  mkdirSync(join(dir, 'hub'), { recursive: true })
  writeFileSync(join(dir, 'wtlist.json'), JSON.stringify(wtlist), 'utf8')
}

console.log('== W1 classify 4 state (lineage) ==')
{
  const dir = tempDir('w1')
  const hubId = 'r::/x/hub'
  const wt = (n) => ({ id: `r::/x/sf-${n}`, path: join(dir, `sf-${n}`), lineage: { parentWorktreeId: hubId } })
  const wtlist = { worktrees: [{ id: hubId, path: join(dir, 'hub') }, wt('1-a'), wt('2-b'), wt('3-c'), wt('4-d')] }
  setupCase(dir, wtlist)
  // thứ tự handle = thứ tự children trong wtlist (bin lặp theo filter order)
  const reads = {
    term_w1: [{ terminal: { status: 'running', tail: ['BLOCKED: acceptance sf-1-a thiếu evidence — leo user'] } }],
    term_w2: [{ terminal: { status: 'running', tail: ['CHECK? npx drizzle-kit push', 'Do you want to proceed?', '❯ 1. Yes'] } }],
    term_w3: [{ terminal: { status: 'running', tail: ['✻ Forming… 30s · ↓ 2k tokens', '❯'] } }],
    term_w4: [{ terminal: { status: 'running', tail: ['✻ Forming… 30s · ↓ 2k tokens'] } }],
  }
  const stub = makeStub(dir)
  // PATH-seam: KHÔNG set ORCA_BIN — bin fallback command -v orca → dir/bin/orca
  const r = runWatch(dir, {
    STUB_WTLIST: join(dir, 'wtlist.json'),
    STUB_READS: JSON.stringify(reads),
    STUB_CNT: join(dir, 'cnt'),
    PATH: join(dir, 'bin') + ':' + process.env.PATH,
  })
  const rows = parseOut(r.out)
  check('W1', 'exit 0 + 4 panes', r.code === 0 && Array.isArray(rows) && rows.length === 4, `code=${r.code} out=${r.out.slice(0, 200)}`)
  const byWt = Object.fromEntries((rows || []).map(x => [x.worktree, x.state]))
  check('W1', 'sf-1-a blocked', byWt['sf-1-a'] === 'blocked', JSON.stringify(byWt))
  check('W1', 'sf-2-b waiting-approval', byWt['sf-2-b'] === 'waiting-approval', JSON.stringify(byWt))
  check('W1', 'sf-3-c idle-done', byWt['sf-3-c'] === 'idle-done', JSON.stringify(byWt))
  check('W1', 'sf-4-d working', byWt['sf-4-d'] === 'working', JSON.stringify(byWt))
  const row1 = (rows || []).find(x => x.worktree === 'sf-1-a')
  check('W1', 'blocked question chứa chữ ký', row1 && /BLOCKED/.test(row1.question || ''), JSON.stringify(row1))
  const row2 = (rows || []).find(x => x.worktree === 'sf-2-b')
  check('W1', 'waiting-approval question = dòng cuối', row2 && /Yes/.test(row2.question || ''), JSON.stringify(row2))
  const row2h = (rows || []).find(x => x.worktree === 'sf-2-b')
  check('W1', 'handle theo cặp worktree', row2h && /^term_w\d+$/.test(row2h.handle || ''), JSON.stringify(row2h))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W2 fail-open (orca chết) ==')
{
  const dir = tempDir('w2')
  setupCase(dir, { worktrees: [] })
  // ORCA_BIN env là override tường minh — path chết dùng luôn, KHÔNG rơi vào orca thật
  const r = runWatch(dir, { ORCA_BIN: join(dir, 'nope') })
  const rows = parseOut(r.out)
  check('W2', 'orca chết → [] + exit 0', r.code === 0 && Array.isArray(rows) && rows.length === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W3 blocked thắng tail trộn signature ==')
{
  const dir = tempDir('w3')
  const hubId = 'r::/x/hub'
  const wtlist = { result: { worktrees: [   // shape 2: {result:{worktrees}} — parser phải nhận cả 2
    { id: hubId, path: join(dir, 'hub') },
    { id: 'r::/x/sf-9-z', path: join(dir, 'sf-9-z'), lineage: { parentWorktreeId: hubId } },
  ] } }
  setupCase(dir, wtlist)
  const reads = { '*': [{ terminal: { status: 'running', tail: [
    'Bắt đầu chạy acceptance…',
    'BLOCKED: acceptance sf-9-z thiếu evidence — leo user',
    'Do you want to proceed?',
    '❯ 1. Yes',
  ] } }] }
  const stub = makeStub(dir)
  const r = runWatch(dir, {
    ORCA_BIN: stub,
    STUB_WTLIST: join(dir, 'wtlist.json'),
    STUB_READS: JSON.stringify(reads),
    STUB_CNT: join(dir, 'cnt'),
  })
  const rows = parseOut(r.out)
  const row = (rows || [])[0]
  check('W3', 'blocked thắng mọi signature khác', row && row.state === 'blocked', JSON.stringify(rows))
  check('W3', 'question = dòng chứa BLOCKED', row && /BLOCKED/.test(row.question || ''), row && row.question)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W4 lineage ưu tiên + fallback same-folder sf-N- ==')
{
  const dir = tempDir('w4')
  const hubId = 'r::hub'
  const wtlist = { worktrees: [
    { id: hubId, path: join(dir, 'hub') },
    { id: 'r::l', path: join(dir, 'nest', 'sf-5-l'), lineage: { parentWorktreeId: hubId } },           // lineage khác folder → nhận
    { id: 'r::f', path: join(dir, 'sf-6-f') },                                                          // cùng folder + prefix, không lineage → nhận
    { id: 'r::n', path: join(dir, 'random-x') },                                                        // cùng folder, không prefix → loại
    { id: 'r::o', path: join(dir, 'elsewhere', 'sf-7-o'), lineage: { parentWorktreeId: 'r::khac' } },   // khác folder + lineage khác → loại
  ] }
  setupCase(dir, wtlist)
  const reads = { '*': [{ terminal: { status: 'running', tail: ['❯'] } }] }
  const stub = makeStub(dir)
  const r = runWatch(dir, {
    ORCA_BIN: stub,
    STUB_WTLIST: join(dir, 'wtlist.json'),
    STUB_READS: JSON.stringify(reads),
    STUB_CNT: join(dir, 'cnt'),
  })
  const rows = parseOut(r.out)
  const names = (rows || []).map(x => x.worktree).sort()
  check('W4', 'chỉ 2 children hợp lệ', Array.isArray(rows) && rows.length === 2, JSON.stringify(rows))
  check('W4', 'nhận lineage khác-folder + fallback same-folder', JSON.stringify(names) === JSON.stringify(['sf-5-l', 'sf-6-f']), JSON.stringify(names))
  check('W4', 'loại no-prefix + lineage-khác', !names.includes('random-x') && !names.includes('sf-7-o'), JSON.stringify(names))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W5 shell-prompt dòng cuối → idle-done (F1) ==')
{
  const dir = tempDir('w5')
  const hubId = 'r::/x/hub'
  const wtlist = { worktrees: [
    { id: hubId, path: join(dir, 'hub') },
    { id: 'r::/x/sf-11-a', path: join(dir, 'sf-11-a'), lineage: { parentWorktreeId: hubId } },
    { id: 'r::/x/sf-12-b', path: join(dir, 'sf-12-b'), lineage: { parentWorktreeId: hubId } },
  ] }
  setupCase(dir, wtlist)
  // worker đã exit về shell: oh-my-zsh prompt + bare $ prompt — done-or-stalled
  const reads = {
    term_w1: [{ terminal: { status: 'exited', tail: ['✻ Đang build acceptance…', '➜ orca git:(features-orchestrated-hitl) ✗'] } }],
    term_w2: [{ terminal: { status: 'exited', tail: ['npm run test', 'bash-5.2$ '] } }],
  }
  const stub = makeStub(dir)
  const r = runWatch(dir, {
    ORCA_BIN: stub,
    STUB_WTLIST: join(dir, 'wtlist.json'),
    STUB_READS: JSON.stringify(reads),
    STUB_CNT: join(dir, 'cnt'),
  })
  const rows = parseOut(r.out)
  const byWt = Object.fromEntries((rows || []).map(x => [x.worktree, x.state]))
  check('W5', 'zsh git-prompt → idle-done', byWt['sf-11-a'] === 'idle-done', JSON.stringify(byWt))
  check('W5', 'bare $-prompt → idle-done', byWt['sf-12-b'] === 'idle-done', JSON.stringify(byWt))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W6 anchor regex: permission thường ≠ approval (F2) ==')
{
  const dir = tempDir('w6')
  const hubId = 'r::/x/hub'
  const wtlist = { worktrees: [
    { id: hubId, path: join(dir, 'hub') },
    { id: 'r::/x/sf-13-a', path: join(dir, 'sf-13-a'), lineage: { parentWorktreeId: hubId } },
    { id: 'r::/x/sf-14-b', path: join(dir, 'sf-14-b'), lineage: { parentWorktreeId: hubId } },
  ] }
  setupCase(dir, wtlist)
  const reads = {
    // "permission"/"unblocked" chữ thường trong output working — KHÔNG được dương tính
    term_w1: [{ terminal: { status: 'running', tail: ['Sửa permission handling — unblocked các file test', '✻ Editing… 10s'] } }],
    term_w2: [{ terminal: { status: 'running', tail: ['Sửa permission handling', 'Do you want to permit?'] } }],
  }
  const stub = makeStub(dir)
  const r = runWatch(dir, {
    ORCA_BIN: stub,
    STUB_WTLIST: join(dir, 'wtlist.json'),
    STUB_READS: JSON.stringify(reads),
    STUB_CNT: join(dir, 'cnt'),
  })
  const rows = parseOut(r.out)
  const byWt = Object.fromEntries((rows || []).map(x => [x.worktree, x.state]))
  check('W6', '"permission"/"unblocked" → working, không approval/blocked', byWt['sf-13-a'] === 'working', JSON.stringify(byWt))
  check('W6', '"permit?" → waiting-approval', byWt['sf-14-b'] === 'waiting-approval', JSON.stringify(byWt))
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
