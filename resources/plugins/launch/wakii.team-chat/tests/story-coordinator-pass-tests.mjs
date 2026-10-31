#!/usr/bin/env node
// story-coordinator-pass tests — spawn bin thật với stub orca + stub story-resume
// (ORCA_BIN / STORY_RESUME_BIN seam, hermetic như story-plan-validate-tests —
// KHÔNG đụng orca daemon thật). Matrix merge 2 nguồn (commit 6974ce74 + pass
// executor term_5e1eb396 sau collision 22:39 — provenance trong audit LOCAL-1):
//   discovery active filter (window + worker live, không N+1 run cũ) ·
//   ownership probe: foreign worker live → skip-owned KHÔNG check · foreign
//   coordinator terminal CÒN SỐNG → skip · foreign terminal ĐÃ CHẾT (stale
//   handle — automation reuseSession:false) → self-heal xử · run mồ côi → xử ·
//   question → reply body DẪN FILE bracket · escalation không reply ·
//   worker_done: evidence thiếu / hash fake → NEEDS-VERIFY; hash thật +
//   files ⊆ diff (git tmp thật) → chấp nhận · idle + orca chết → exit 0 ·
//   resume chỉ STALLED, cap 1/pass · PASS SUMMARY 1 dòng · notify không crash
//   khi osascript thiếu.
// Chạy: node tests/story-coordinator-pass-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, copyFileSync, chmodSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
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
  const dir = mkdtempSync(join(tmpdir(), `coord-pass-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// stub orca: log argv vào $ARGV_LOG rồi trả fixture theo subcommand.
// reply: REPLY_PLAIN=1 → in text thường rc0 (không JSON); REPLY_FAIL=1 → exit 1.
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
case "$2" in
  run-list) cat "$RL_FIXTURE" ;;
  worker-list) cat "$WL_FIXTURE" ;;
  task-list) cat "$TL_FIXTURE" ;;
  check)
    if [ -n "$FENCE" ] && ! grep -qFx "$4" "$BOUND_FILE" 2>/dev/null; then
      printf '%s\\n' '{"ok":false,"error":{"code":"run_required","message":"No Run is bound"}}'
    else
      cat "$CHECK_FIXTURE"
    fi ;;
  list) if [ -n "$TERM_PLAIN" ]; then printf 'garbage-not-json\n'; else cat "$TERM_FIXTURE"; fi ;;
  reply)
    [ -n "$REPLY_FAIL" ] && exit 1
    if [ -n "$REPLY_PLAIN" ]; then printf 'Replied msg_plain_text\n'; else printf '%s\\n' '{"ok":true,"result":{"message":{"id":"replied"}}}'; fi ;;
  run-use)
    [ -n "$RUN_USE_FAIL" ] && exit 1
    printf '%s\\n' "$3" >> "$BOUND_FILE"
    printf '%s\\n' '{"ok":true,"result":{"run":{}}}' ;;
  *) printf '%s\\n' '{"ok":true,"result":{}}' ;;
esac
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

// stub story-resume: --check in fixture; <sf> --send in SENT
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
  writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj))
  return p
}

// repo git thật trong tmp — chứng minh "commit tồn tại + files ⊆ diff"
function makeGitRepo(dir, files = ['README.md']) {
  const repo = join(dir, 'wt-repo')
  spawnSync('git', ['init', '-q', repo])
  spawnSync('git', ['-C', repo, 'config', 'user.email', 't@t'])
  spawnSync('git', ['-C', repo, 'config', 'user.name', 't'])
  for (const f of files) {
    writeFileSync(join(repo, f), 'demo\n')
    spawnSync('git', ['-C', repo, 'add', f])
  }
  spawnSync('git', ['-C', repo, 'commit', '-qm', 'demo commit'])
  const h = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  return { repo, hash: (h.stdout || '').trim() }
}

function runPass(dir, stub, env = {}) {
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const stateFile = join(dir, 'verify-state')
  const r = spawnSync(BASH, [BIN], {
    encoding: 'utf8', timeout: 60000, cwd: env.PASS_CWD || dir,
    env: {
      ...process.env,
      ORCA_BIN: stub,
      STORY_RESUME_BIN: join(dir, 'resume-missing.sh'),
      ORCA_TERMINAL_HANDLE: 'term_self',
      ORCA_COORDINATOR_HANDLE: 'term_self',
      PASS_NOTIFY: '0',
      PASS_CHECK_WAIT_MS: '1000',
      PASS_STATE_FILE: stateFile,
      ARGV_LOG: argvLog,
      ...env,
    },
  })
  delete env.PASS_CWD
  const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), argv, stateFile }
}

const NO_MSGS = { ok: true, result: { runId: 'x', messages: [], count: 0 } }
const NO_WORKERS = { ok: true, result: { workers: [] } }
const OPEN_TASK = { ok: true, result: { runId: 'x', tasks: [{ id: 't', status: 'pending' }] } }
const TERM_ME_ONLY = { ok: true, result: { terminals: [{ handle: 'term_self' }] } }

console.log('== C1 foreign worker live → SKIP-OWNED, KHÔNG check run đó ==')
{
  const dir = tempDir('c1')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_foreign', objective: 'FI-X SF-4', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_foreign', dispatchId: 'ctx_w1', workerState: 'running',
      terminalState: 'active', resource: { worktreeId: 'uuid::/tmp/x' },
      projection: { liveness: { verdict: 'live' } } },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: wl,
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C1', 'summary skipped-owned=1', r.out.includes('skipped-owned=1'), r.out)
  check('C1', 'KHÔNG check run foreign', !r.argv.includes('check --run run_foreign'), r.argv)
  check('C1', 'log SKIP-OWNED nêu owner', r.out.includes('SKIP-OWNED run_foreign'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C2 live worker của mình + run mồ côi → được xử, không skip ==')
{
  const dir = tempDir('c2')
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
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: wl,
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C2', 'exit 0', r.code === 0, `code=${r.code}`)
  check('C2', 'run của mình được check', r.argv.includes('check --run run_mine'), r.argv)
  check('C2', 'run mồ côi được nhận (check)', r.argv.includes('check --run run_orphan'), r.argv)
  check('C2', 'skipped-owned=0', r.out.includes('skipped-owned=0'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C3 foreign coordinator terminal CÒN SỐNG (không worker live) → skip ==')
{
  const dir = tempDir('c3')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_bound', objective: 'FI-Y SF-1', coordinator_handle: 'term_other_alive' },
  ] } })
  const terms = { ok: true, result: { terminals: [{ handle: 'term_self' }, { handle: 'term_other_alive' }] } }
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', terms),
  })
  check('C3', 'skipped-owned=1', r.out.includes('skipped-owned=1'), r.out)
  check('C3', 'KHÔNG check', !r.argv.includes('check --run run_bound'), r.argv)
  check('C3', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C4 foreign coordinator terminal ĐÃ CHẾT (stale handle) → self-heal xử ==')
{
  const dir = tempDir('c4')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_stranded', objective: 'FI-Z SF-2', coordinator_handle: 'term_dead_ago' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C4', 'stale handle → check được xử', r.argv.includes('check --run run_stranded'), r.argv)
  check('C4', 'skipped-owned=0', r.out.includes('skipped-owned=0'), r.out)
  check('C4', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C5 question → reply body DẪN FILE bracket (epic từ objective) ==')
{
  const dir = tempDir('c5')
  const stub = makeOrcaStub(dir)
  const docs = join(dir, 'docs', 'superpowers', 'brackets')
  mkdirSync(docs, { recursive: true })
  writeFileSync(join(docs, 'local-1-self-sustain-24-7.md'), '# Story: LOCAL-1\n')
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_q', objective: 'LOCAL-1 SF-1: Coordinator pass bin', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_q', count: 1, messages: [
    { id: 'msg_q1', type: 'question', subject: 'SF-3 có nên block dispatch?', body: 'chi tiết' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    PASS_CWD: dir,
  })
  check('C5', 'reply msg_q1 được gọi', /orchestration reply --id msg_q1/.test(r.argv), r.argv)
  check('C5', 'reply body dẫn FILE bracket local-1', r.argv.includes('brackets/local-1-self-sustain-24-7.md'), r.argv)
  check('C5', 'summary replied=1 processed=1', r.out.includes('replied=1') && r.out.includes('processed=1'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C6 question nhưng không tìm được bracket file → vẫn reply, dẫn thư mục ==')
{
  const dir = tempDir('c6')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_q2', objective: 'LOCAL-1 câu hỏi', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_q2', count: 1, messages: [
    { id: 'msg_q2', type: 'question', subject: 'hỏi không epic', body: 'x' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    PASS_CWD: dir,
  })
  check('C6', 'vẫn reply', /orchestration reply --id msg_q2/.test(r.argv), r.argv)
  check('C6', 'body dẫn docs/superpowers/brackets/', r.argv.includes('docs/superpowers/brackets/'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C7 escalation → KHÔNG reply, báo needs-user ==')
{
  const dir = tempDir('c7')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_esc', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_esc', count: 1, messages: [
    { id: 'msg_e1', type: 'escalation', subject: 'cần xoá branch main?', body: 'y' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C7', 'KHÔNG reply', !r.argv.includes('reply'), r.argv)
  check('C7', 'escalation được ghi needs-user', r.out.includes('needs-user'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C8 worker_done evidence thiếu (files rỗng) → NEEDS-VERIFY + trail ==')
{
  const dir = tempDir('c8')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_e', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_x', dispatchId: 'ctx_x', outcome: 'succeeded', filesModified: [] })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_e', count: 1, messages: [
    { id: 'msg_d1', type: 'worker_done', subject: 'xong rồi', payload },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C8', 'NEEDS-VERIFY được ghi', r.out.includes('NEEDS-VERIFY'), r.out)
  check('C8', 'KHÔNG EVIDENCE-OK', !r.out.includes('EVIDENCE-OK'), r.out)
  check('C8', 'KHÔNG READY-FOR-VERIFY (evidence thiếu thì không surfaced)', !r.out.includes('READY-FOR-VERIFY'), r.out)
  check('C8', 'state file có trail', existsSync(r.stateFile) && readFileSync(r.stateFile, 'utf8').includes('msg_d1'), r.stateFile)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C9 worker_done commit hash THẬT + files ⊆ diff (git tmp) → EVIDENCE-OK ==')
{
  const dir = tempDir('c9')
  const stub = makeOrcaStub(dir)
  const { repo, hash } = makeGitRepo(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_e2', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_e2', dispatchId: 'ctx_ok', workerState: 'completed',
      terminalState: 'released', resource: { worktreeId: `uuid::${repo}` },
      projection: { liveness: { verdict: 'exited' } } },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_y', dispatchId: 'ctx_ok', outcome: 'succeeded', filesModified: ['README.md'], commit: hash })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_e2', count: 1, messages: [
    { id: 'msg_d2', type: 'worker_done', subject: 'xong có chứng minh', payload },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: wl,
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C9', 'EVIDENCE-OK — chấp nhận', r.out.includes('EVIDENCE-OK'), r.out)
  check('C9', 'KHÔNG NEEDS-VERIFY', !r.out.includes('NEEDS-VERIFY'), r.out)
  check('C9', 'READY-FOR-VERIFY surfaced (gate chờ coordinator)', r.out.includes('READY-FOR-VERIFY'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C10 worker_done hash KHÔNG tồn tại trong repo → NEEDS-VERIFY (commit phải tồn tại) ==')
{
  const dir = tempDir('c10')
  const stub = makeOrcaStub(dir)
  const { repo } = makeGitRepo(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_e3', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_e3', dispatchId: 'ctx_f', workerState: 'completed',
      terminalState: 'released', resource: { worktreeId: `uuid::${repo}` },
      projection: { liveness: { verdict: 'exited' } } },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_z', dispatchId: 'ctx_f', outcome: 'succeeded', filesModified: ['README.md'], commit: 'dead000dead000dead000dead000dead000f00d' })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_e3', count: 1, messages: [
    { id: 'msg_d3', type: 'worker_done', subject: 'khoe xong', payload },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: wl,
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C10', 'hash fake → NEEDS-VERIFY', r.out.includes('NEEDS-VERIFY'), r.out)
  check('C10', 'KHÔNG EVIDENCE-OK', !r.out.includes('EVIDENCE-OK'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C11 không run active → PASS: idle=no-active-runs, exit 0 ==')
{
  const dir = tempDir('c11')
  const stub = makeOrcaStub(dir)
  const r = runPass(dir, stub, {
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', NO_MSGS),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C11', 'exit 0', r.code === 0, `code=${r.code}`)
  check('C11', 'PASS: idle=no-active-runs', r.out.includes('PASS: idle=no-active-runs'), r.out)
  check('C11', 'idle bỏ sớm — KHÔNG check/reply', !r.argv.includes('check') && !r.argv.includes('reply'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C12 orca chết → idle=orca-unavailable, exit 0 (pass không fail hard) ==')
{
  const dir = tempDir('c12')
  const r = runPass(dir, makeBrokenStub(dir), {})
  check('C12', 'exit 0', r.code === 0, `code=${r.code}`)
  check('C12', 'idle=orca-unavailable', r.out.includes('PASS: idle=orca-unavailable'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C13 discovery filter: run cũ (window) + legacy không tốn task-list ==')
{
  const dir = tempDir('c13')
  const stub = makeOrcaStub(dir)
  const now = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  const old = '2026-01-01T00:00:00Z'
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_fresh', objective: 'LOCAL-1', coordinator_handle: 'term_self', updated_at: now },
    { id: 'run_aged', objective: 'FI-233 cũ', coordinator_handle: 'term_o', updated_at: old },
    { id: 'run_leg', objective: 'legacy', coordinator_handle: null, legacy: 1, updated_at: now },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C13', 'run fresh được task-list', r.argv.includes('--run run_fresh'), r.argv)
  check('C13', 'run cũ ngoài window KHÔNG task-list', !r.argv.includes('--run run_aged'), r.argv)
  check('C13', 'legacy KHÔNG task-list', !r.argv.includes('--run run_leg'), r.argv)
  check('C13', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C14 story-resume: STALLED → --send đúng 1 lần; RUNNING/COLD không gửi ==')
{
  const dir = tempDir('c14')
  const stub = makeOrcaStub(dir)
  const resume = makeResumeStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_r', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const rc = fixture(dir, 'rc.txt', 'sf-2-demo|STALLED|terminal idle + 3h không commit\nsf-3-x|RUNNING|commit 1h trước\nsf-4-y|STALLED-COLD|không terminal\n')
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    STORY_RESUME_BIN: resume, RESUME_CHECK_FIXTURE: rc,
  })
  check('C14', 'summary resumed=1 (cap 1)', r.out.includes('resumed=1'), r.out)
  check('C14', 'gửi --send cho sf stalled', r.argv.includes('sf-2-demo --send'), r.argv)
  check('C14', 'KHÔNG gửi lần 2 (cap)', (r.argv.match(/--send/g) || []).length === 1, r.argv)
  check('C14', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C15 PASS SUMMARY 1 dòng đúng format pack ==')
{
  const dir = tempDir('c15')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_s', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  const last = (r.out.trim().split('\n').pop() || '')
  check('C15', 'format đúng pack', /^PASS: processed=\d+ replied=\d+ resumed=\d+ skipped-owned=\d+ idle=\S+$/.test(last), last)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C16 PASS_NOTIFY=1 + osascript fail → vẫn exit 0 (không crash) ==')
{
  const dir = tempDir('c16')
  const stub = makeOrcaStub(dir)
  const fakeBin = join(dir, 'fake-bin')
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(join(fakeBin, 'osascript'), '#!/bin/sh\nexit 1\n', 'utf8')
  chmodSync(join(fakeBin, 'osascript'), 0o755)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_n', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_n', count: 1, messages: [
    { id: 'msg_n1', type: 'escalation', subject: 'cần user', body: 'z' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    PASS_NOTIFY: '1',
    PATH: `${fakeBin}:${process.env.PATH || ''}`,
  })
  check('C16', 'notify chết vẫn exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(-300)}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C17 reply rc0 nhưng stdout không JSON → gọi ĐÚNG 1 lần (cấm dup-mutation) ==')
{
  const dir = tempDir('c17')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_dup', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_dup', count: 1, deliveryId: 'dlv_1', messages: [
    { id: 'msg_p1', type: 'question', subject: 'hỏi 1 lần', body: 'x' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    REPLY_PLAIN: '1',
  })
  const replyCalls = (r.argv.match(/orchestration reply --id/g) || []).length
  check('C17', 'reply gọi đúng 1 lần', replyCalls === 1, r.argv)
  check('C17', 'rc0 vẫn tính replied (không FAIL)', r.out.includes('replied=1'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C18 reply fail trong batch → KHÔNG --ack batch đó (không nuốt câu hỏi) ==')
{
  const dir = tempDir('c18')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_af', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_af', count: 1, deliveryId: 'dlv_9', messages: [
    { id: 'msg_af1', type: 'question', subject: 'chưa được trả lời', body: 'x' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    REPLY_FAIL: '1',
  })
  check('C18', 'KHÔNG --ack sau batch fail', !r.argv.includes('--ack'), r.argv)
  check('C18', 'REPLY FAIL được log', r.out.includes('REPLY FAIL msg_af1'), r.out)
  check('C18', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C19 evidence: tên file có khoảng trắng (splitlines) → EVIDENCE-OK ==')
{
  const dir = tempDir('c19')
  const stub = makeOrcaStub(dir)
  const { repo, hash } = makeGitRepo(dir, ['my file.md'])
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_sp', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    { runId: 'run_sp', dispatchId: 'ctx_sp', workerState: 'completed',
      terminalState: 'released', resource: { worktreeId: `uuid::${repo}` },
      projection: { liveness: { verdict: 'exited' } } },
  ] } })
  const payload = JSON.stringify({ taskId: 'task_s', dispatchId: 'ctx_sp', outcome: 'succeeded', filesModified: ['my file.md'], commit: hash })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_sp', count: 1, messages: [
    { id: 'msg_sp1', type: 'worker_done', subject: 'xong có dấu cách', payload },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: wl,
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C19', 'file khoảng trắng → EVIDENCE-OK', r.out.includes('EVIDENCE-OK'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C20 env số hỏng (PASS_CHECK_WAIT_MS=abc) → fallback, exit 0 ==')
{
  const dir = tempDir('c20')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_badenv', objective: 'LOCAL-1', coordinator_handle: 'term_self' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    PASS_CHECK_WAIT_MS: 'abc',
  })
  check('C20', 'exit 0 (không ValueError)', r.code === 0, `code=${r.code} out=${r.out.slice(-200)}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C21 crash bất ngờ (result sai kiểu) → PASS: idle=error, exit 0 ==')
{
  const dir = tempDir('c21')
  const stub = makeOrcaStub(dir)
  const r = runPass(dir, stub, {
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: 'boom-không-phải-object' }),
    WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', NO_MSGS),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
  })
  check('C21', 'exit 0', r.code === 0, `code=${r.code}`)
  check('C21', 'idle=error', r.out.includes('idle=error'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C22 terminal list trả rác rc0 → degrade bảo thủ: foreign owner bị SKIP, không ADOPT ==')
{
  const dir = tempDir('c22')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_unsure', objective: 'FI-W SF-1', coordinator_handle: 'term_unknown_state' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    TERM_PLAIN: '1', // terminal list rc0 nhưng không phải JSON
  })
  check('C22', 'skipped-owned=1 (không ADOPT khi không dò được liveness)', r.out.includes('skipped-owned=1'), r.out)
  check('C22', 'KHÔNG check inbox run unsure', !r.argv.includes('check --run run_unsure'), r.argv)
  check('C22', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C23 terminal cron bị consumer-fenced → run-use TRƯỚC check (2.16.8 F2) ==')
{
  const dir = tempDir('c23')
  const stub = makeOrcaStub(dir)
  const docs = join(dir, 'docs', 'superpowers', 'brackets')
  mkdirSync(docs, { recursive: true })
  writeFileSync(join(docs, 'local-1-self-sustain-24-7.md'), '# Story: LOCAL-1\n')
  const bound = join(dir, 'bound.txt')
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_q', objective: 'LOCAL-1 SF-1: Coordinator pass bin', coordinator_handle: 'term_self' },
  ] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'run_q', deliveryId: 'delivery_q1', count: 1, messages: [
    { id: 'msg_q1', type: 'question', subject: 'FENCE test — câu hỏi cần ruling', body: 'chi tiết' },
  ] } })
  const r = runPass(dir, stub, {
    RL_FIXTURE: rl, WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK), CHECK_FIXTURE: ck,
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    FENCE: '1', BOUND_FILE: bound, PASS_CWD: dir,
  })
  const iUse = r.argv.indexOf('orchestration run-use run_q')
  const iCheck = r.argv.indexOf('orchestration check --run run_q')
  check('C23', 'run-use được gọi TRƯỚC check (bind trước khi fenced)', iUse > -1 && iCheck > -1 && iUse < iCheck, r.argv.slice(0, 300))
  check('C23', 'sau bind: check đọc được message → REPLY', /orchestration reply --id msg_q1/.test(r.argv), r.argv.slice(0, 400))
  check('C23', 'ack ngay sau batch (F3)', /orchestration check --run run_q --ack/.test(r.argv), r.argv)
  check('C23', 'summary replied=1', r.out.includes('replied=1'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C24 run-use fail → bỏ inbox, KHÔNG check (F2 degrade) ==')
{
  const dir = tempDir('c24')
  const stub = makeOrcaStub(dir)
  const r = runPass(dir, stub, {
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [
      { id: 'run_x', objective: 'LOCAL-1 SF-1', coordinator_handle: 'term_self' },
    ] } }),
    WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    RUN_USE_FAIL: '1', PASS_CWD: dir,
  })
  check('C24', 'run-use fail → bỏ qua inbox (run-use fail trong out)', r.out.includes('run-use fail'), r.out)
  check('C24', 'KHÔNG gọi check sau run-use fail', !r.argv.includes('check --run'), r.argv)
  check('C24', 'exit 0 (pass là hành vi, không fail hard)', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

const C25_WIN = process.platform === 'win32'; // known-red 03/10: Windows-sim test — PATH ';' + MSYS raw path chỉ đúng trên win32 (memory: kit-drift-guard)
if (!C25_WIN) console.log('  [SKIP] C25 — Windows-sim, chỉ chạy trên win32')
console.log('== C25 Windows MSYS-path ORCA_BIN → seam OSError → which(.EXE) resolve ==')
{
  const dir = tempDir('c25')
  // Case reviewer round 2/3: `command -v orca` trả path MSYS KHÔNG đuôi của
  // file đĩa orca.exe (MSYS strip .exe). Bash [ -x ] pass (exec-eval), msys
  // convert env → python nhận 'C:/…/orca' KHÔNG đuôi → open OSError (chỉ có
  // orca.exe trên đĩa) → seam phải which(basename) → dir\orca.EXE → chạy.
  // Stub: node.exe copy tên orca.exe; hook qua NODE_OPTIONS --require chặn
  // argv orca-CLI → log + fixture JSON (node resolve argv[1] absolute trước
  // hook → match theo basename).
  const hook = join(dir, 'orca-hook.cjs')
  writeFileSync(hook, `const fs=require('fs');const p=require('path');` +
    `const a=process.argv.slice(1);` +
    `const b=p.basename(a[0]||'');` +
    `if(!['orchestration','terminal'].includes(b))return;` +
    `fs.appendFileSync(process.env.ARGV_LOG,a.join(' ')+String.fromCharCode(10));` +
    `const k=['run-list','worker-list','check','list','run-current'].indexOf(a[1]);` +
    `const v=['RL_FIXTURE','WL_FIXTURE','CHECK_FIXTURE','TERM_FIXTURE','TL_FIXTURE'][k];` +
    `if(v&&process.env[v]){process.stdout.write(fs.readFileSync(process.env[v],'utf8'))}` +
    `process.exit(0)`)
  copyFileSync(process.execPath, join(dir, 'orca.exe'))
  const msys = dir.replace(/^([A-Za-z]):[\\/]/, (_, d) => '/' + d.toLowerCase() + '/')
    .replace(/\\/g, '/') + '/orca'
  const r = runPass(dir, 'UNUSED-STUB-PATH', {
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    WL_FIXTURE: fixture(dir, 'wl.json', NO_WORKERS),
    TL_FIXTURE: fixture(dir, 'tl.json', OPEN_TASK),
    CHECK_FIXTURE: fixture(dir, 'ck.json', NO_MSGS),
    TERM_FIXTURE: fixture(dir, 'tm.json', TERM_ME_ONLY),
    PATH: dir + ';' + process.env.PATH,
    NODE_OPTIONS: '--require ' + hook.replace(/\\/g, '/'),
    // ép python nhận RAW MSYS path (một số Git Bash không convert biến tự do —
    // env reviewer reproduce) — không có fix which() → WinError 2 chết toàn vòng
    MSYS2_ENV_CONV_EXCL: 'ORCA_BIN',
    PASS_CWD: dir,
    ORCA_BIN: msys,
  })
  if (C25_WIN) check('C25', 'stub chạy qua seam (argv log có run-list)', r.argv.includes('run-list'), r.argv || '(rỗng)')
  check('C25', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C25', 'idle=no-active-runs (không degrade orca-unavailable)', r.out.includes('idle=no-active-runs'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
