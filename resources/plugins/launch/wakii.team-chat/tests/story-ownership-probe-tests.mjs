#!/usr/bin/env node
// story-ownership-probe tests — lib probe dùng chung (LOCAL-1 SF-3) + block
// pre-dispatch story-launch + cột owner watchdog/story-top + e2e 2-coordinator.
// Stub orca hermetic (ARGV_LOG + fixtures — KHÔNG đụng daemon thật), cùng style
// story-coordinator-pass-tests. Phủ: bash face + json face, degrade fail-open,
// self probe run-current, wt_by_dispatch gồm worker released (evidence), block
// foreign/mine/orphan/blind, watchdog + top owner column, e2e 2 coordinator.
// Chạy: node tests/story-ownership-probe-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const KIT = resolve(testsDir, '../kit/bin')
const LIB = join(KIT, 'story-ownership-probe')
const LAUNCH = join(KIT, 'story-launch')
const WATCHDOG = join(KIT, 'story-watchdog')
const TOP = join(KIT, 'story-top')
const PASS = join(KIT, 'story-coordinator-pass')

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
  const dir = mkdtempSync(join(tmpdir(), `ownership-probe-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function fixture(dir, name, obj) {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

// stub orca: ghi argv vào $ARGV_LOG rồi trả fixture theo subcommand
function makeOrcaStub(dir, opts = {}) {
  const stub = join(dir, 'orca-stub.sh')
  const workerCmd = opts.failWorkerList ? 'exit 9' : 'cat "$WL_FIXTURE"'
  const runCmd = opts.failRunList ? 'exit 9' : 'cat "$RL_FIXTURE"'
  const runCurrent = opts.runCurrentFixture ? 'cat "$RC_FIXTURE"' : 'exit 5'
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
case "$2" in
  run-list) ${runCmd} ;;
  worker-list) ${workerCmd} ;;
  run-current) ${runCurrent} ;;
  *) printf '%s\\n' '{"ok":true,"result":{}}' ;;
esac
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

// worker row chuẩn (shape orchestration worker-list thật)
function worker({ dispatchId, runId, state = 'active', verdict = 'live', worktree = '', handle = '' }) {
  return {
    dispatchId, runId, workerState: 'running', terminalState: state,
    ...(handle ? { agentTerminalHandle: handle } : {}),
    ...(worktree ? { resource: { worktreeId: `uuid::${worktree}` } } : {}),
    projection: { liveness: { verdict } },
  }
}

function run(wtDir, { repo = 'reponb', num = 2, slug = 'demo' } = {}) {
  mkdirSync(join(wtDir, 'orca', 'workspaces', repo, `sf-${num}-${slug}`), { recursive: true })
  return join(wtDir, 'orca', 'workspaces', repo, `sf-${num}-${slug}`)
}

function writeBracket(dir, repoName = 'repo') {
  const repo = join(dir, repoName)
  mkdirSync(repo, { recursive: true })
  const bf = join(repo, 'bracket.md')
  writeFileSync(bf, `# Story: TST — story test
Destination: story/tst-dest

## SF-2 Demo feature (Phase 1/1)
Tier: 1
linear: TST-1
Design: none
What: demo
Depends on: —

## SF-4 Collision feature (Phase 1/1)
Tier: 1
linear: TST-4
Design: none
What: demo
Depends on: —
`)
  return { repo, bf }
}

const WTLIVE = 'worktree-live-name'

console.log('== L1 bash face: load + query maps đúng ==')
{
  const dir = tempDir('l1')
  const stub = makeOrcaStub(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_foreign', objective: 'FI-X SF-4', coordinator_handle: 'term_other' },
    { id: 'run_mine', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_w1', runId: 'run_foreign', worktree: '/abs/wt/sf-4-x' }),
  ] } })
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load || exit 9
    echo "LIVE=[$OP_LIVE_RUNS]"
    echo "SELF=[$(ownership_probe_self)]"
    echo "OWNER=[$(ownership_probe_run_owner run_foreign)]"
    echo "WT=[$(ownership_probe_worktree_owner sf-4-x)]"
    echo "WTPATH=[$(ownership_probe_worktree_owner /abs/wt/sf-4-x)]"
    echo "WTMISS=[$(ownership_probe_worktree_owner sf-1-x)]"
    ownership_probe_run_live run_foreign && echo RUNLIVE=yes || echo RUNLIVE=no
    ownership_probe_run_live run_nope && echo RUNLIVE2=yes || echo RUNLIVE2=no
    ownership_probe_run_live run_mine && echo RUNLIVE3=yes || echo RUNLIVE3=no
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl } })
  check('L1', 'exit 0', r.status === 0, `code=${r.status} out=${r.stdout}${r.stderr}`)
  check('L1', 'liveRuns có run_foreign', r.stdout.includes('LIVE=[ run_foreign]'), r.stdout)
  check('L1', 'self từ env', r.stdout.includes('SELF=[term_self]'), r.stdout)
  check('L1', 'owner run_foreign=term_other', r.stdout.includes('OWNER=[term_other]'), r.stdout)
  check('L1', 'wt owner theo basename', r.stdout.includes(`WT=[run_foreign\tterm_other]`), r.stdout)
  check('L1', 'wt owner theo full path', r.stdout.includes(`WTPATH=[run_foreign\tterm_other]`), r.stdout)
  check('L1', 'wt lạ rỗng', r.stdout.includes('WTMISS=[]'), r.stdout)
  check('L1', 'run_live đúng 3 mặt', r.stdout.includes('RUNLIVE=yes') && r.stdout.includes('RUNLIVE2=no') && r.stdout.includes('RUNLIVE3=no'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L2 exec --json: runs qua stdin + maps đầy đủ ==')
{
  const dir = tempDir('l2')
  const stub = makeOrcaStub(dir)
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_w1', runId: 'run_foreign', worktree: '/abs/wt/sf-4-x', handle: 'term_fallback' }),
  ] } })
  const runsJson = JSON.stringify({ ok: true, result: { runs: [
    { id: 'run_foreign', coordinator_handle: 'term_other' },
  ] } })
  const r = spawnSync('bash', [LIB, '--json', '--self', 'term_self'], {
    encoding: 'utf8', timeout: 60000, input: runsJson,
    env: { ...process.env, ORCA_BIN: stub, RL_FIXTURE: fixture(dir, 'rl2.json', { ok: true, result: { runs: [] } }), WL_FIXTURE: wl },
  })
  let d = null
  try { d = JSON.parse(r.stdout) } catch {}
  check('L2', 'exit 0 + JSON parse', r.status === 0 && d !== null, `${r.status} ${r.stdout.slice(0, 200)}${r.stderr}`)
  check('L2', 'self=--self', d?.self === 'term_self', r.stdout)
  check('L2', 'orcaOk + workersOk true', d?.orcaOk === true && d?.workersOk === true, r.stdout)
  check('L2', 'liveRuns=[run_foreign]', JSON.stringify(d?.liveRuns) === '["run_foreign"]', r.stdout)
  check('L2', 'runOwner map', d?.runOwner?.run_foreign === 'term_other', r.stdout)
  const wtl = (d?.worktreeLive || []).find(x => x.name === 'sf-4-x')
  check('L2', 'worktreeLive owner (run owner thắng fallback)', wtl?.owner === 'term_other', r.stdout)
  check('L2', 'worktreeLive path', wtl?.path === '/abs/wt/sf-4-x', r.stdout)
  check('L2', 'worktreeByDispatch full path', d?.worktreeByDispatch?.ctx_w1 === '/abs/wt/sf-4-x', r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L3 worker-list chết → fail-open (LIVE rỗng, workersOk=0, rc0) ==')
{
  const dir = tempDir('l3')
  const stub = makeOrcaStub(dir, { failWorkerList: true })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_x', coordinator_handle: 'term_self' },
  ] } })
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load || exit 9
    echo "LOADED=$OP_LOADED WORKERS_OK=$OP_WORKERS_OK LIVE=[$OP_LIVE_RUNS]"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl } })
  check('L3', 'load rc0 (fail-open)', r.status === 0, `code=${r.status} err=${r.stderr}`)
  check('L3', 'workersOk=0 + live rỗng', r.stdout.includes('WORKERS_OK=0') && r.stdout.includes('LIVE=[]'), r.stdout)
  check('L3', 'stderr nêu degrade', (r.stderr || '').includes('degrade'), r.stderr)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L4 exec không --json → usage exit 2 ==')
{
  const r = spawnSync('bash', [LIB], { encoding: 'utf8', timeout: 30000 })
  check('L4', 'exit 2 + usage', r.status === 2 && (r.stdout || '').includes('usage'), `${r.status} ${r.stdout}`)
}

console.log('== L5 self trống → probe run-current ==')
{
  const dir = tempDir('l5')
  const stub = makeOrcaStub(dir, { runCurrentFixture: true })
  const rc = fixture(dir, 'rc.json', { ok: true, result: { run: { coordinator_handle: 'term_cur' } } })
  const env = { ...process.env, ORCA_BIN: stub, RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }), RC_FIXTURE: rc }
  delete env.ORCA_COORDINATOR_HANDLE
  const r = spawnSync('bash', ['-c', `. "${LIB}"; ownership_probe_load; echo "SELF=[$(ownership_probe_self)]"`],
    { encoding: 'utf8', timeout: 60000, env })
  check('L5', 'self từ run-current', r.status === 0 && r.stdout.includes('SELF=[term_cur]'), `${r.stdout}${r.stderr}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L6 wt_by_dispatch gồm worker released (evidence parity SF-1 P5) ==')
{
  const dir = tempDir('l6')
  const stub = makeOrcaStub(dir)
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_rel', runId: 'run_e2', state: 'released', verdict: 'exited', worktree: '/tmp/repo' }),
  ] } })
  const r = spawnSync('bash', [LIB, '--json', '--self', 'term_self'], {
    encoding: 'utf8', timeout: 60000, input: JSON.stringify({ ok: true, result: { runs: [] } }),
    env: { ...process.env, ORCA_BIN: stub, RL_FIXTURE: fixture(dir, 'rl2.json', { ok: true, result: { runs: [] } }), WL_FIXTURE: wl },
  })
  let d = null
  try { d = JSON.parse(r.stdout) } catch {}
  check('L6', 'released vẫn vào worktreeByDispatch', d?.worktreeByDispatch?.ctx_rel === '/tmp/repo', r.stdout)
  check('L6', 'released KHÔNG tính live', JSON.stringify(d?.liveRuns) === '[]' && (d?.worktreeLive || []).length === 0, r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L7 parent-dir scope: basename trùng 2 repo không nhầm lẫn ==')
{
  const dir = tempDir('l7')
  const stub = makeOrcaStub(dir)
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_a', runId: 'run_a', worktree: '/x/wsA/sf-2-demo' }),
    worker({ dispatchId: 'ctx_b', runId: 'run_b', worktree: '/x/wsB/sf-2-demo' }),
  ] } })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_a', coordinator_handle: 'term_a' },
    { id: 'run_b', coordinator_handle: 'term_b' },
  ] } })
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load || exit 9
    echo "A=[$(ownership_probe_worktree_owner sf-2-demo /x/wsA)]"
    echo "B=[$(ownership_probe_worktree_owner sf-2-demo /x/wsB)]"
    echo "C=[$(ownership_probe_worktree_owner sf-2-demo /x/wsC)]"
    echo "PATHB=[$(ownership_probe_worktree_owner /x/wsB/sf-2-demo /x/wsB)]"
    echo "NOBRANCH=[$(ownership_probe_worktree_owner sf-2-demo)]"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl } })
  check('L7', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('L7', 'wsA → run_a/term_a', r.stdout.includes(`A=[run_a\tterm_a]`), r.stdout)
  check('L7', 'wsB → run_b/term_b', r.stdout.includes(`B=[run_b\tterm_b]`), r.stdout)
  check('L7', 'wsC (repo không có wt) → rỗng', r.stdout.includes('C=[]'), r.stdout)
  check('L7', 'full path + parent → đúng', r.stdout.includes(`PATHB=[run_b\tterm_b]`), r.stdout)
  check('L7', 'không parent → fallback basename (documented)', r.stdout.includes(`NOBRANCH=[run_a\tterm_a]`), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

// ── process-scan face (LOCAL-4 SF-1): 2 vùng mù đêm 03/10 — worker cwd-trên-primary
// + worker ngoài orchestration. Fixture qua OP_PROC_JSON/OP_PROC_FILE (hermetic),
// real-lsof ở story-ownership-probe-real-lsof-tests.mjs.
console.log('== P1 process-scan: agent cwd-trên-primary → zone=primary ==')
{
  const dir = tempDir('p1')
  const stub = makeOrcaStub(dir)
  const primary = join(dir, 'primary-repo')
  mkdirSync(primary, { recursive: true })
  const procs = JSON.stringify([
    { pid: 424001, comm: 'claude', cwd: primary },
    { pid: 424002, comm: 'claude', cwd: join(primary, 'docs') }, // subdir vẫn tính primary
  ])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf '%s' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: primary, PJ: procs } })
  check('P1', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P1', 'pid 424001 zone=primary + cwd', r.stdout.includes('424001|primary|') && r.stdout.includes(primary), r.stdout)
  check('P1', 'subdir của primary cũng bắt', r.stdout.includes('424002|primary|'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P2 process-scan: agent trong SF worktree, worker-list không thấy → zone=oob ==')
{
  const dir = tempDir('p2')
  const stub = makeOrcaStub(dir)
  const wt = run(dir, { repo: 'reponb' })
  const procs = JSON.stringify([
    { pid: 424101, comm: 'codex', cwd: wt }, // spawn tay trong worktree — không qua orchestration
    { pid: 424102, comm: 'claude', cwd: join(wt, 'docs') },
  ])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load >/dev/null || exit 9
    hits="$(OP_PRIMARY="$OP" OP_WT_PATHS="$WT" OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf '%s' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, ORCA_COORDINATOR_HANDLE: 'term_self',
      OP: join(dir, 'not-the-primary'), WT: wt, PJ: procs,
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) } })
  check('P2', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P2', 'cwd = worktree → oob', r.stdout.includes('424101|oob|') && r.stdout.includes(wt), r.stdout)
  check('P2', 'subdir của worktree → oob', r.stdout.includes('424102|oob|'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P3 process-scan: worktree đang có worker live (in-band) → drop, block logic cũ quyết ==')
{
  const dir = tempDir('p3')
  const stub = makeOrcaStub(dir)
  const wt = run(dir, { repo: 'reponb' })
  const procs = JSON.stringify([{ pid: 424201, comm: 'claude', cwd: wt }])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load >/dev/null || exit 9
    hits="$(OP_PRIMARY="$OP" OP_WT_PATHS="$WT" OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, ORCA_COORDINATOR_HANDLE: 'term_self',
      OP: join(dir, 'not-the-primary'), WT: wt, PJ: procs,
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [
        { id: 'run_other', coordinator_handle: 'term_other' } ] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [
        worker({ dispatchId: 'ctx_i', runId: 'run_other', worktree: wt }) ] } }) } })
  check('P3', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P3', 'in-band bị drop (HITS rỗng)', r.stdout.includes('HITS=[]'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P4 process-scan: non-agent + cwd ngoài scope → bỏ qua ==')
{
  const dir = tempDir('p4')
  const stub = makeOrcaStub(dir)
  const procs = JSON.stringify([
    { pid: 424301, comm: 'vim', cwd: join(dir, 'primary-repo') },        // không phải agent CLI
    { pid: 424302, comm: 'claude', cwd: join(dir, 'somewhere-else') },   // cwd ngoài primary/wt
    { pid: 424303, comm: 'claude', cwd: '' },                            // cwd không biết — không phán
  ])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: join(dir, 'primary-repo'), PJ: procs } })
  check('P4', 'exit 0 + HITS rỗng', r.status === 0 && r.stdout.includes('HITS=[]'), `code=${r.status} ${r.stdout}${r.stderr}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P5 process-scan: process ở chain ancestor của launcher → loại (không tự chặn) ==')
{
  const dir = tempDir('p5')
  const stub = makeOrcaStub(dir)
  const primary = join(dir, 'primary-repo')
  mkdirSync(primary, { recursive: true })
  // process.pid (node test) = cha của bash spawnSync → nằm trong ancestor chain
  // của python scan — đúng lớp process "tự launcher" phải loại.
  const procs = JSON.stringify([
    { pid: process.pid, comm: 'claude', cwd: primary },
    { pid: 424401, comm: 'claude', cwd: primary },
  ])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: primary, PJ: procs } })
  check('P5', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P5', 'ancestor (node test) bị loại', !r.stdout.includes(`${process.pid}|primary|`), r.stdout)
  check('P5', 'pid lạ vẫn bắt', r.stdout.includes('424401|primary|'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P6 process-scan: lsof hỏng → PROCERR, fail-open (rỗng, rc0, warn) ==')
{
  const dir = tempDir('p6')
  const stub = makeOrcaStub(dir)
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_LSOF_BIN=/nonexistent-lsof-xyz ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: join(dir, 'primary-repo') } })
  check('P6', 'exit 0 + HITS rỗng (fail-open)', r.status === 0 && r.stdout.includes('HITS=[]'), `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P6', 'stderr nêu fail-open', (r.stderr || '').includes('fail-open'), r.stderr)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P8 process-scan: ps hỏng (không chắc ancestor chain) → PROCERR fail-open toàn phần ==')
{
  // review P2: ps chết giữa chừng → exclusion không đáng tin → không được phán
  // (chặn nhầm launcher chính mình = fail-closed cục bộ) — seam OP_PS_BIN
  const dir = tempDir('p8')
  const stub = makeOrcaStub(dir)
  const primary = join(dir, 'primary-repo')
  mkdirSync(primary, { recursive: true })
  const procs = JSON.stringify([{ pid: 424601, comm: 'claude', cwd: primary }])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_PS_BIN=/nonexistent-ps-xyz OP_PROC_JSON="$PJ" ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: primary, PJ: procs } })
  check('P8', 'exit 0 + HITS rỗng (fail-open)', r.status === 0 && r.stdout.includes('HITS=[]'), `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P8', 'stderr nêu fail-open', (r.stderr || '').includes('fail-open'), r.stderr)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P7 process-scan: fixture qua OP_PROC_FILE + primary chứa .claude/worktrees không tính primary ==')
{
  const dir = tempDir('p7')
  const stub = makeOrcaStub(dir)
  const primary = join(dir, 'primary-repo')
  mkdirSync(join(primary, '.claude', 'worktrees', 'wt-x'), { recursive: true })
  const pf = fixture(dir, 'procs.json', [
    { pid: 424501, comm: 'claude', cwd: join(primary, '.claude', 'worktrees', 'wt-x') }, // native worktree — không phải primary
    { pid: 424502, comm: 'gemini', cwd: primary },
  ])
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    hits="$(OP_PRIMARY="$OP" OP_PROC_FILE="$PF" ownership_probe_process_hits)" || exit 9
    printf 'HITS=[%s]' "$hits"
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: stub, OP: primary, PF: pf } })
  check('P7', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('P7', '.claude/worktrees không tính primary', !r.stdout.includes('424501'), r.stdout)
  check('P7', 'OP_PROC_FILE đọc được + comm giữ', r.stdout.includes('424502|primary|') && r.stdout.includes('gemini'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

// ── story-launch pre-dispatch ──
// OP_PROC_JSON='[]' mặc định: process-scan hermetic (fixture rỗng, không lsof thật)
// — case process thật override trong story-ownership-probe-real-lsof-tests.mjs.
function runLaunch(dir, stub, args, env = {}) {
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const r = spawnSync('bash', [LAUNCH, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ORCA_BIN: stub, ARGV_LOG: argvLog, OP_PROC_JSON: '[]', ...env },
  })
  const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), argv }
}

console.log('== B1 story-launch: worktree foreign-owned → BLOCKED, nêu owner, KHÔNG dispatch ==')
{
  const dir = tempDir('b1')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const wt = run(dir, { repo: 'repo' })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_other', objective: 'TST SF-2', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: wt }),
  ] } })
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl })
  check('B1', 'exit 1 (block)', r.code === 1, `code=${r.code} out=${r.out}`)
  check('B1', 'output nêu BLOCKED + owner', r.out.includes('BLOCKED') && r.out.includes('term_other'), r.out)
  check('B1', 'nêu worktree bị chiếm', r.out.includes('sf-2-demo'), r.out)
  check('B1', 'KHÔNG dispatch (không worktree create)', !r.argv.includes('worktree create'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B2 story-launch: worktree của chính mình → "đã có worktree" như cũ ==')
{
  const dir = tempDir('b2')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const wt = run(dir, { repo: 'repo' })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_self', coordinator_handle: 'term_self' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_s', runId: 'run_self', worktree: wt }),
  ] } })
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl })
  check('B2', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('B2', 'giữ thông điệp cũ', r.out.includes('đã có worktree: sf-2-demo'), r.out)
  check('B2', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
  check('B2', 'không dispatch', !r.argv.includes('worktree create'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B3 story-launch: worktree mồ côi (không worker live) → như cũ ==')
{
  const dir = tempDir('b3')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  run(dir, { repo: 'repo' })
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) })
  check('B3', 'exit 0 + thông điệp cũ', r.code === 0 && r.out.includes('đã có worktree: sf-2-demo'), `code=${r.code} out=${r.out}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B4 story-launch: worker live ở SF khác → không block nhầm ==')
{
  const dir = tempDir('b4')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_other', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: join(dir, 'orca/workspaces/repo/sf-9-other') }),
  ] } })
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf, '--dry-run'],
    { ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl })
  check('B4', 'exit 0 (dry-run chạy tiếp)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('B4', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B5 story-launch: probe chết → fail-open, hành vi cũ ==')
{
  const dir = tempDir('b5')
  const stub = makeBrokenStub(dir)
  const { repo, bf } = writeBracket(dir)
  run(dir, { repo: 'repo' })
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self' })
  check('B5', 'exit 0 + thông điệp cũ (không chặn mù)', r.code === 0 && r.out.includes('đã có worktree: sf-2-demo'), `code=${r.code} out=${r.out}`)
  check('B5', 'stderr nêu degrade', r.out.includes('degrade'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B6 story-launch: basename trùng — repo khác mồ côi KHÔNG bị block nhầm ==')
{
  const dir = tempDir('b6')
  const stub = makeOrcaStub(dir)
  const a = writeBracket(dir, 'repoA')
  const b = writeBracket(dir, 'repoB')
  const wtA = run(dir, { repo: 'repoA', slug: 'demo' })
  run(dir, { repo: 'repoB', slug: 'demo' })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_other', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: wtA }),
  ] } })
  const envB = { ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl }
  const rB = runLaunch(dir, stub, ['SF-2', '--repo', b.repo, '--bracket', b.bf], envB)
  check('B6', 'repoB mồ côi → exit 0 thông điệp cũ', rB.code === 0 && rB.out.includes('đã có worktree: sf-2-demo'), `code=${rB.code} out=${rB.out}`)
  check('B6', 'repoB không bị block', !rB.out.includes('BLOCKED'), rB.out)
  const rA = runLaunch(dir, stub, ['SF-2', '--repo', a.repo, '--bracket', a.bf], envB)
  check('B6', 'repoA foreign → vẫn BLOCKED', rA.code === 1 && rA.out.includes('BLOCKED') && rA.out.includes('term_other'), `code=${rA.code} out=${rA.out}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B7 story-launch: agent cwd-trên-primary (vùng mù 03/10 #1) → BLOCKED pid+cwd, không dispatch ==')
{
  const dir = tempDir('b7')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  // KHÔNG tạo worktree sf-2 — launch sẽ đẻ worktree trùng nếu probe không chặn
  const procs = JSON.stringify([{ pid: 424601, comm: 'claude', cwd: repo }])
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }),
      OP_PROC_JSON: procs })
  check('B7', 'exit 1 (block)', r.code === 1, `code=${r.code} out=${r.out}`)
  check('B7', 'BLOCKED + pid + cwd', r.out.includes('BLOCKED') && r.out.includes('pid=424601') && r.out.includes(`cwd=${repo}`), r.out)
  check('B7', 'KHÔNG dispatch (không worktree create)', !r.argv.includes('worktree create'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B8 story-launch: agent trong SF worktree ngoài orchestration (vùng mù 03/10 #2) → BLOCKED ==')
{
  const dir = tempDir('b8')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const wt = run(dir, { repo: 'repo' })
  // worktree tồn tại nhưng worker-list RẼNG — worker spawn tay, run-list không thấy
  const procs = JSON.stringify([{ pid: 424701, comm: 'claude', cwd: wt }])
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }),
      OP_PROC_JSON: procs })
  check('B8', 'exit 1 (block — cũ chỉ "đã có worktree")', r.code === 1, `code=${r.code} out=${r.out}`)
  check('B8', 'BLOCKED + pid + cwd', r.out.includes('BLOCKED') && r.out.includes('pid=424701') && r.out.includes(`cwd=${wt}`), r.out)
  check('B8', 'KHÔNG dispatch', !r.argv.includes('worktree create'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B9 story-launch: sạch (không agent lạ) → đi qua như cũ, không block ==')
{
  const dir = tempDir('b9')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf, '--dry-run'],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) })
  check('B9', 'exit 0 (dry-run đi qua)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('B9', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
  check('B9', 'dry-run không dispatch', !r.argv.includes('worktree create'), r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B10 story-launch: agent cwd nơi khác (không primary/WT của SF) → không block nhầm ==')
{
  const dir = tempDir('b10')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const elsewhere = join(dir, 'unrelated-place')
  mkdirSync(elsewhere, { recursive: true })
  const procs = JSON.stringify([{ pid: 424801, comm: 'claude', cwd: elsewhere }])
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf, '--dry-run'],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }),
      OP_PROC_JSON: procs })
  check('B10', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('B10', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== B11 story-launch: process scan hỏng → fail-open, launch đi qua ==')
{
  const dir = tempDir('b11')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  // OP_PROC_JSON rỗng + lsoa bogus → scan chết → không được chặn mù
  const r = runLaunch(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf, '--dry-run'],
    { ORCA_COORDINATOR_HANDLE: 'term_self',
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }),
      OP_PROC_JSON: '', OP_LSOF_BIN: '/nonexistent-lsof-xyz' })
  check('B11', 'exit 0 (dry-run đi qua)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('B11', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
  check('B11', 'stderr nêu fail-open', r.out.includes('fail-open'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W1 watchdog: cột owner ==')
{
  const dir = tempDir('w1')
  const stub = makeOrcaStub(dir)
  const resume = join(dir, 'resume-stub.sh')
  writeFileSync(resume, '#!/bin/sh\nif [ "$1" = "--check" ]; then printf \'sf-4-x|RUNNING|commit 1h trước\\n\'; exit 0; fi\nexit 0\n', 'utf8')
  chmodSync(resume, 0o755)
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_other', coordinator_handle: 'term_other' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: '/x/sf-4-x' }),
  ] } })
  const r = spawnSync('bash', [WATCHDOG], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ORCA_BIN: stub, STORY_RESUME_BIN: resume,
      STATE_FILE: join(dir, 'state'), RL_FIXTURE: rl, WL_FIXTURE: wl },
  })
  check('W1', 'exit 0', r.status === 0, `code=${r.status} out=${r.stdout}${r.stderr}`)
  check('W1', 'dòng SF có owner=term_other', /sf-4-x: RUNNING.*owner=term_other/.test(r.stdout), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== W2 watchdog: không SF → KHÔNG gọi probe (zero-diff khi idle) ==')
{
  const dir = tempDir('w2')
  const stub = makeOrcaStub(dir)
  const resume = join(dir, 'resume-stub.sh')
  writeFileSync(resume, '#!/bin/sh\nif [ "$1" = "--check" ]; then exit 0; fi\nexit 0\n', 'utf8')
  chmodSync(resume, 0o755)
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const r = spawnSync('bash', [WATCHDOG], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ORCA_BIN: stub, STORY_RESUME_BIN: resume,
      STATE_FILE: join(dir, 'state'), ARGV_LOG: argvLog,
      RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
      WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) },
  })
  const argv = readFileSync(argvLog, 'utf8')
  check('W2', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('W2', 'không worker-list (không SF thì không probe)', !argv.includes('worker-list'), argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T1 story-top: cột OWNER ==')
{
  const dir = tempDir('t1')
  const stub = makeOrcaStub(dir)
  const wt = run(dir, { repo: 'reponb', num: 4, slug: 'ownertest-xyz' })
  writeFileSync(join(wt, '.git'), 'gitdir: /dev/null\n')
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_other', coordinator_handle: 'term_coordb' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: wt }),
  ] } })
  const r = spawnSync('bash', [TOP], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ORCA_BIN: stub, RL_FIXTURE: rl, WL_FIXTURE: wl },
  })
  check('T1', 'exit 0', r.status === 0, `code=${r.status} ${r.stdout}${r.stderr}`)
  check('T1', 'header có cột OWNER', r.stdout.includes('OWNER'), r.stdout.slice(0, 300))
  check('T1', 'owner ngắn hiện trong dòng SF', /sf-4-ownertest-xyz.*coordb/.test(r.stdout), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== E1 e2e 2-coordinator: A giữ worker live, B bị chặn + skip-owned + thấy owner ==')
{
  const dir = tempDir('e1')
  const stub = makeOrcaStub(dir)
  const { repo, bf } = writeBracket(dir)
  const wt = run(dir, { repo: 'repo', num: 4, slug: 'collision' })
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
    { id: 'run_foreign', objective: 'TST SF-4', coordinator_handle: 'term_coorda' },
  ] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
    worker({ dispatchId: 'ctx_a', runId: 'run_foreign', worktree: wt }),
  ] } })
  const tl = fixture(dir, 'tl.json', { ok: true, result: { tasks: [] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { runId: 'x', messages: [], count: 0 } })
  const baseEnv = { ORCA_BIN: stub, RL_FIXTURE: rl, WL_FIXTURE: wl, TL_FIXTURE: tl, CHECK_FIXTURE: ck }
  // (1) coordinator-pass của B: SKIP-OWNED, không check inbox run của A
  const argvLog = join(dir, 'argv-pass.log')
  writeFileSync(argvLog, '')
  const rPass = spawnSync('bash', [PASS], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ...baseEnv, ORCA_COORDINATOR_HANDLE: 'term_coordb',
      PASS_NOTIFY: '0', PASS_CHECK_WAIT_MS: '1000', PASS_STATE_FILE: join(dir, 'vf'), ARGV_LOG: argvLog },
  })
  const argvPass = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  check('E1', 'pass: SKIP-OWNED nêu owner A', rPass.stdout.includes('SKIP-OWNED run_foreign') && rPass.stdout.includes('term_coorda'), rPass.stdout)
  check('E1', 'pass: không check inbox run foreign', !argvPass.includes('check --run run_foreign'), argvPass)
  // (2) story-launch của B: BLOCKED + nêu owner A
  const rLaunch = runLaunch(dir, stub, ['SF-4', '--repo', repo, '--bracket', bf],
    { ...baseEnv, ORCA_COORDINATOR_HANDLE: 'term_coordb' })
  check('E1', 'launch: BLOCKED + owner A', rLaunch.out.includes('BLOCKED') && rLaunch.out.includes('term_coorda'), rLaunch.out)
  check('E1', 'launch: KHÔNG dispatch', !rLaunch.argv.includes('worktree create'), rLaunch.argv)
  // (3) watchdog của B: nhìn thấy owner A trước khi dispatch tay
  const resume = join(dir, 'resume-stub.sh')
  writeFileSync(resume, '#!/bin/sh\nif [ "$1" = "--check" ]; then printf \'sf-4-collision|RUNNING|commit 1h trước\\n\'; exit 0; fi\nexit 0\n', 'utf8')
  chmodSync(resume, 0o755)
  const rWd = spawnSync('bash', [WATCHDOG], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ...baseEnv, STORY_RESUME_BIN: resume, STATE_FILE: join(dir, 'state') },
  })
  check('E1', 'watchdog: owner=term_coorda', /sf-4-collision: RUNNING.*owner=term_coorda/.test(rWd.stdout), rWd.stdout)
  rmSync(dir, { recursive: true, force: true })
}

const M1_WIN = process.platform === 'win32'; // known-red 03/10: Windows-sim test (memory: kit-drift-guard)
if (!M1_WIN) console.log('  [SKIP] M1 — Windows-sim, chỉ chạy trên win32')
console.log('== M1 Windows: OP_ORCA_BIN MSYS ext-less → which(orca.EXE) resolve, fetch sống ==')
{
  // Case reviewer round 2/3 cho probe: caller set OP_ORCA_BIN từ
  // `command -v orca` (MSYS strip .exe). resolve layer: os.access False →
  // which(basename) qua PATH → dir\orca.EXE → fetch hoạt động.
  const dir = tempDir('m1')
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
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [] } })
  const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [] } })
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const r = spawnSync('bash', ['-c', `
    . "${LIB}"
    ownership_probe_load && echo LOADED=yes || echo LOADED=no
  `], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORCA_BIN: msys, MSYS2_ENV_CONV_EXCL: 'ORCA_BIN',
      PATH: dir + ';' + process.env.PATH,
      NODE_OPTIONS: '--require ' + hook.replace(/\\/g, '/'),
      ORCA_COORDINATOR_HANDLE: 'term_self', RL_FIXTURE: rl, WL_FIXTURE: wl,
      ARGV_LOG: argvLog } })
  check('M1', 'load rc0 (orca resolve được)', r.stdout.includes('LOADED=yes'), (r.stdout || '') + (r.stderr || ''))
  if (M1_WIN) check('M1', 'stub chạy (argv log có run-list)', readFileSync(argvLog, 'utf8').includes('run-list'), readFileSync(argvLog, 'utf8') || '(rỗng)')
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
