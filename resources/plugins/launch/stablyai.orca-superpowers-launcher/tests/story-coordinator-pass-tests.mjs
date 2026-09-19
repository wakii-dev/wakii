#!/usr/bin/env node
// story-coordinator-pass tests — spawn bin thật với stub orca + stub story-resume
// (ORCA_BIN seam, hermetic như story-plan-validate-tests — KHÔNG đụng orca daemon
// thật). Phủ: foreign worker → skip-owned KHÔNG check; live worker của mình → xử;
// run mồ côi → nhận trách nhiệm; question → reply dẫn bracket; worker_done
// evidence thiếu → NEEDS-VERIFY; evidence đủ (git thật trong tmp) → chấp nhận;
// không run → idle exit 0; orca chết → idle=orca-unavailable exit 0; resume
// STALLED → --send đúng 1 lần; exit luôn 0.
// Chạy: node tests/story-coordinator-pass-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-coordinator-pass')
const BASH = 'bash'

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `coordinator-pass-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// stub orca: ghi argv vào $ARGV_LOG rồi trả fixture theo subcommand
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
case "$2" in
  run-list) cat "$RL_FIXTURE" ;;
  worker-list) cat "$WL_FIXTURE" ;;
  task-list) cat "$TL_FIXTURE" ;;
  check) cat "$CHECK_FIXTURE" ;;
  *) printf '%s\\n' '{"ok":true,"result":{}}' ;;
esac
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

// stub story-resume: --check in fixture; <sf> --send in SENT ✓
function makeResumeStub(dir) {
  const stub = join(dir, 'resume-stub.sh')
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
if [ "$1" = "--check" ]; then cat "$RESUME_CHECK_FIXTURE"; exit 0; fi
printf '%s\\n' 'SENT ✓ (stub)'
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function makeBrokenStub(dir) {
  const stub = join(dir, 'broken-stub.sh')
  writeFileSync(stub, '#!/bin/sh\nexit 7\n', 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function fixture(dir, name, obj) {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

// repo git thật trong tmp — chứng minh path "commit tồn tại chạm files"
function makeGitRepo(dir) {
  const repo = join(dir, 'wt-repo')
  spawnSync('git', ['init', '-q', repo])
  spawnSync('git', ['-C', repo, 'config', 'user.email', 't@t'])
  spawnSync('git', ['-C', repo, 'config', 'user.name', 't'])
  writeFileSync(join(repo, 'README.md'), 'demo\n')
  spawnSync('git', ['-C', repo, 'add', 'README.md'])
  spawnSync('git', ['-C', repo, 'commit', '-qm', 'demo commit'])
  return repo
}

function runPass(dir, stub, env = {}) {
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const stateFile = join(dir, 'verify-state')
  const r = spawnSync(BASH, [BIN], {
    encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      ORCA_BIN: stub,
      ORCA_COORDINATOR_HANDLE: 'term_self',
      PASS_NOTIFY: '0',
      PASS_CHECK_WAIT_MS: '1000',
      PASS_STATE_FILE: stateFile,
      ARGV_LOG: argvLog,
      ...env,
    },
  })
  const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), argv, stateFile, argvLog }
}

const NO_MSGS = { ok: true, result: { runId: 'x', messages: [], count: 0 } }

console.log('== P1 foreign worker live → SKIP-OWNED, KHÔNG check run đó ==')
{
  const dir = tempDir('p1')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_foreign', objective: 'FI-X SF-4', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_foreign', dispatchId: 'ctx_w1', workerState: 'running',
      terminalState: 'active', resource: { worktreeId: 'uuid::/tmp/x' },
      projection: { liveness: { verdict: 'live' } } },
  ] } })
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: wl, TL_FIXTURE: fixture(dir, 'tl.json', { ok: true, result: { tasks: [] } }), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS) })
  check('P1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('P1', 'summary skipped-owned=1', r.out.includes('skipped-owned=1'), r.out)
  check('P1', 'KHÔNG check run foreign', !r.argv.includes('check --run run_foreign'), r.argv)
  check('P1', 'log SKIP-OWNED nêu owner', r.out.includes('SKIP-OWNED run_foreign'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P2 live worker của chính mình + run mồ côi → được xử, không skip ==')
{
  const dir = tempDir('p2')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_mine', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
    { id: 'run_orphan', objective: 'LOCAL-2', coordinator_handle: null },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_mine', dispatchId: 'ctx_m1', workerState: 'running',
      terminalState: 'active', resource: { worktreeId: 'uuid::/tmp/y' },
      projection: { liveness: { verdict: 'live' } } },
  ] } })
  const tl = fixture(dir, 'tl.json', { ok: true, result: { tasks: [
    { id: 'task_a', status: 'dispatched' },
  ] } })
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: wl, TL_FIXTURE: tl, CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS) })
  check('P2', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P2', 'run của mình được check', r.argv.includes('check --run run_mine'), r.argv)
  check('P2', 'run mồ côi được nhận (check)', r.argv.includes('check --run run_orphan'), r.argv)
  check('P2', 'skipped-owned=0', r.out.includes('skipped-owned=0'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P3 question trong inbox → reply được gọi, body dẫn bracket ==')
{
  const dir = tempDir('p3')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_q', objective: 'LOCAL-1 câu hỏi', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_q', count: 1, messages: [
    { id: 'msg_q1', type: 'question', subject: 'SF-3 có nên block dispatch?', body: 'chi tiết' },
  ] } })
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }), TL_FIXTURE: fixture(dir, 'tl.json', { ok: true, result: { tasks: [{ id: 't', status: 'pending' }] } }), CHECK_FIXTURE: ck })
  check('P3', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P3', 'reply msg_q1 được gọi', /orchestration reply --id msg_q1/.test(r.argv), r.argv)
  check('P3', 'reply body dẫn brackets/', r.argv.includes('docs/superpowers/brackets/'), r.argv)
  check('P3', 'summary replied=1 processed=1', r.out.includes('replied=1') && r.out.includes('processed=1'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P4 worker_done evidence thiếu → NEEDS-VERIFY, KHÔNG chấp nhận ==')
{
  const dir = tempDir('p4')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_e', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_x', dispatchId: 'ctx_x', outcome: 'succeeded', filesModified: [] })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_e', count: 1, messages: [
    { id: 'msg_d1', type: 'worker_done', subject: 'xong rồi', payload },
  ] } })
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }), TL_FIXTURE: fixture(dir, 'tl.json', { ok: true, result: { tasks: [{ id: 't', status: 'pending' }] } }), CHECK_FIXTURE: ck })
  check('P4', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P4', 'NEEDS-VERIFY được ghi', r.out.includes('NEEDS-VERIFY'), r.out)
  check('P4', 'KHÔNG EVIDENCE-OK', !r.out.includes('EVIDENCE-OK'), r.out)
  check('P4', 'state file có trail', existsSync(r.stateFile) && readFileSync(r.stateFile, 'utf8').includes('msg_d1'), r.stateFile)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P5 worker_done evidence đủ (git thật) → EVIDENCE-OK ==')
{
  const dir = tempDir('p5')
  const stub = makeOrcaStub(dir)
  const repo = makeGitRepo(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_e2', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    // worker ĐÃ XONG (exited + released) — không tính live, nhưng cho path worktree
    { runId: 'run_e2', dispatchId: 'ctx_ok', workerState: 'completed',
      terminalState: 'released', resource: { worktreeId: `uuid::${repo}` },
      projection: { liveness: { verdict: 'exited' } } },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_y', dispatchId: 'ctx_ok', outcome: 'succeeded', filesModified: ['README.md'] })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_e2', count: 1, messages: [
    { id: 'msg_d2', type: 'worker_done', subject: 'xong có chứng minh', payload },
  ] } })
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: wl, TL_FIXTURE: fixture(dir, 'tl.json', { ok: true, result: { tasks: [{ id: 't', status: 'pending' }] } }), CHECK_FIXTURE: ck })
  check('P5', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P5', 'EVIDENCE-OK — chấp nhận', r.out.includes('EVIDENCE-OK'), r.out)
  check('P5', 'KHÔNG NEEDS-VERIFY', !r.out.includes('NEEDS-VERIFY'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P6 không run active → PASS: idle=no-active-runs, exit 0 ==')
{
  const dir = tempDir('p6')
  const stub = makeOrcaStub(dir)
  const r = runPass(dir, stub, { RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }), WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }), TL_FIXTURE: fixture(dir, 'tl.json', NO_MSGS), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS) })
  check('P6', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P6', 'PASS: idle=no-active-runs', r.out.includes('PASS: idle=no-active-runs'), r.out)
  check('P6', 'idle bỏ sớm — KHÔNG check/reply', !r.argv.includes('check') && !r.argv.includes('reply'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P7 orca chết → idle=orca-unavailable, exit 0 (pass không fail hard) ==')
{
  const dir = tempDir('p7')
  const r = runPass(dir, makeBrokenStub(dir), {})
  check('P7', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P7', 'idle=orca-unavailable', r.out.includes('PASS: idle=orca-unavailable'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P8 story-resume STALLED → --send đúng 1 lần (cap 1/pass) ==')
{
  const dir = tempDir('p8')
  const stub = makeOrcaStub(dir)
  const resume = makeResumeStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_r', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const rc = fixture(dir, 'rc.json', { ok: true, result: { runs: [] } })
  writeFileSync(rc, 'sf-2-demo|STALLED|terminal idle + 3h không commit\nsf-3-x|RUNNING|commit 1h trước\nsf-4-y|STALLED-COLD|không terminal\n')
  const r = runPass(dir, stub, { RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }), TL_FIXTURE: fixture(dir, 'tl.json', { ok: true, result: { tasks: [{ id: 't', status: 'pending' }] } }), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS), STORY_RESUME_BIN: resume, RESUME_CHECK_FIXTURE: rc })
  check('P8', 'exit 0', r.code === 0, `code=${r.code}`)
  check('P8', 'summary resumed=1 (cap 1)', r.out.includes('resumed=1'), r.out)
  check('P8', 'gửi --send cho sf stalled đầu', r.argv.includes('sf-2-demo --send'), r.argv)
  check('P8', 'KHÔNG gửi lần 2 (cap)', (r.argv.match(/--send/g) || []).length === 1, r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
