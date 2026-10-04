#!/usr/bin/env node
// process-scan REAL-mode tests (LOCAL-4 SF-1) — khác story-ownership-probe-tests.mjs
// (fixture OP_PROC_JSON hermetic): đây chạy lsof THẬT trên process THẬT (sleep
// tự spawn — mình sở hữu, kill được) và replay kịch bản đêm 03/10 qua BIN THẬT
// story-launch (Rule 0 CLI-equivalent — không web port).
// Chạy: node tests/story-ownership-probe-real-lsof-tests.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const KIT = resolve(testsDir, '../kit/bin')
const LIB = join(KIT, 'story-ownership-probe')
const LAUNCH = join(KIT, 'story-launch')

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
  const dir = mkdtempSync(join(tmpdir(), `ownership-reallsof-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function fixture(dir, name, obj) {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

function makeOrcaStub(dir, opts = {}) {
  const stub = join(dir, 'orca-stub.sh')
  const workerCmd = opts.failWorkerList ? 'exit 9' : 'cat "$WL_FIXTURE"'
  const runCmd = opts.failRunList ? 'exit 9' : 'cat "$RL_FIXTURE"'
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
case "$2" in
  run-list) ${runCmd} ;;
  worker-list) ${workerCmd} ;;
  run-current) exit 5 ;;
  *) printf '%s\\n' '{"ok":true,"result":{}}' ;;
esac
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function worker({ dispatchId, runId, worktree = '', handle = '' }) {
  return {
    dispatchId, runId, workerState: 'running', terminalState: 'active',
    ...(handle ? { agentTerminalHandle: handle } : {}),
    ...(worktree ? { resource: { worktreeId: `uuid::${worktree}` } } : {}),
    projection: { liveness: { verdict: 'live' } },
  }
}

// spawn process THẬT với cwd = dir — comm pattern do OP_AGENT_PAT quyết (mặc định
// không khớp sleep). Trả handle kill() cho cleanup (process do test tự spawn).
function spawnRealProcess(cwd) {
  const child = spawn('sleep', ['25'], { cwd, stdio: 'ignore' })
  return child
}

// poll tới khi lsof thấy process (visibility eventual) — tối đa 6s
function waitVisible(snippet, env, want) {
  for (let i = 0; i < 30; i++) {
    const r = spawnSync('bash', ['-c', snippet], { encoding: 'utf8', timeout: 30000, env })
    if (r.status === 0 && want(r.stdout || '')) return r
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  return null
}

function launchReal(dir, stub, args, env = {}) {
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const r = spawnSync('bash', [LAUNCH, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: dir, ORCA_BIN: stub, ARGV_LOG: argvLog, ...env },
  })
  const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), argv }
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
`)
  return { repo, bf }
}

const LSOFLINE = process.platform === 'win32' // lsof/ps không có trên Windows — SKIP
if (LSOFLINE) console.log('  [SKIP] toàn bộ R — chỉ chạy trên macOS/Linux (lsof)')
else console.log('== R — real lsof + real-bin replay 03/10 (macOS/Linux) ==')

if (!LSOFLINE) {
  console.log('== R1 real lsof: scan thấy process thật cwd-trên-primary ==')
  {
    const dir = tempDir('r1')
    const stub = makeOrcaStub(dir)
    const primary = join(dir, 'primary-repo')
    mkdirSync(primary, { recursive: true })
    const child = spawnRealProcess(primary)
    try {
      const env = { ...process.env, ORCA_BIN: stub, OP: primary, PAT: '^sleep$' }
      const r = waitVisible(`
        . "${LIB}"
        hits="$(OP_PRIMARY="$OP" OP_AGENT_PAT="$PAT" ownership_probe_process_hits)" || exit 9
        printf 'HITS=[%s]' "$hits"
      `, env, out => out.includes('|primary|'))
      check('R1', 'scan thấy process thật', r !== null, r ? `${r.stdout}${r.stderr}` : 'timeout 6s — lsof không thấy')
      if (r) {
        const pid = parseInt((r.stdout.match(/HITS=\[(\d+)\|/) || [])[1] || '0', 10)
        check('R1', 'pid là pid thật (không phải fixture)', pid > 0 && pid === child.pid, `pid=${pid} expect=${child.pid}`)
      }
    } finally {
      child.kill('SIGKILL') // process do test tự spawn — cleanup hợp lệ
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('== R2 real lsof: môi trường sạch → 0 hit ==')
  {
    const dir = tempDir('r2')
    const stub = makeOrcaStub(dir)
    const primary = join(dir, 'primary-repo')
    mkdirSync(primary, { recursive: true })
    const r = spawnSync('bash', ['-c', `
      . "${LIB}"
      hits="$(OP_PRIMARY="$OP" OP_AGENT_PAT="$PAT" ownership_probe_process_hits)" || exit 9
      printf 'HITS=[%s]' "$hits"
    `], { encoding: 'utf8', timeout: 30000,
      env: { ...process.env, ORCA_BIN: stub, OP: primary, PAT: '^sleep-demotest-khong-ton-tai$' } })
    check('R2', 'exit 0 + HITS rỗng', r.status === 0 && (r.stdout || '').includes('HITS=[]'), `${r.status} ${r.stdout}${r.stderr}`)
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('== R3 BIN THẬT story-launch: process thật trên primary → BLOCKED pid+cwd (03/10 #1) ==')
  {
    const dir = tempDir('r3')
    const stub = makeOrcaStub(dir)
    const { repo, bf } = writeBracket(dir)
    const child = spawnRealProcess(repo)
    try {
      const scanEnv = { ...process.env, ORCA_BIN: stub, OP: repo, PAT: '^sleep$' }
      const seen = waitVisible(`
        . "${LIB}"
        hits="$(OP_PRIMARY="$OP" OP_AGENT_PAT="$PAT" ownership_probe_process_hits)" || exit 9
        printf '%s' "$hits"
      `, scanEnv, out => out.includes('|primary|'))
      check('R3', 'precond: lsof thấy process trước launch', seen !== null, seen ? seen.stdout : 'timeout')
      const r = launchReal(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
        { ORCA_COORDINATOR_HANDLE: 'term_self', OP_AGENT_PAT: '^sleep$',
          RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
          WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) })
      check('R3', 'exit 1 (block)', r.code === 1, `code=${r.code} out=${r.out}`)
      check('R3', 'BLOCKED + pid + cwd', r.out.includes('BLOCKED') && /pid=\d+/.test(r.out) && /cwd=\S/.test(r.out), r.out)
      check('R3', 'KHÔNG dispatch', !r.argv.includes('worktree create'), r.argv)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('== R4 BIN THẬT story-launch: môi trường sạch → đi qua như cũ (không hồi quy) ==')
  {
    const dir = tempDir('r4')
    const stub = makeOrcaStub(dir)
    const { repo, bf } = writeBracket(dir)
    const r = launchReal(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf, '--dry-run'],
      { ORCA_COORDINATOR_HANDLE: 'term_self', OP_AGENT_PAT: '^sleep-demotest-khong-ton-tai$',
        RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
        WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) })
    check('R4', 'exit 0 (dry-run đi qua)', r.code === 0, `code=${r.code} out=${r.out}`)
    check('R4', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('== R5 BIN THẬT story-launch: process thật trong SF worktree ngoài orchestration → BLOCKED (03/10 #2) ==')
  {
    const dir = tempDir('r5')
    const stub = makeOrcaStub(dir)
    const { repo, bf } = writeBracket(dir)
    const wt = join(dir, 'orca', 'workspaces', 'repo', 'sf-2-demo')
    mkdirSync(wt, { recursive: true })
    const child = spawnRealProcess(wt)
    try {
      const seen = waitVisible(`
        . "${LIB}"
        ownership_probe_load >/dev/null || exit 9
        hits="$(OP_PRIMARY="$OP" OP_WT_PATHS="$WT" OP_AGENT_PAT="$PAT" ownership_probe_process_hits)" || exit 9
        printf '%s' "$hits"
      `, { ...process.env, ORCA_BIN: stub, OP: repo, WT: wt, PAT: '^sleep$',
        RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
        WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) },
        out => out.includes('|oob|'))
      check('R5', 'precond: scan thấy oob trước launch', seen !== null, seen ? seen.stdout : 'timeout')
      const r = launchReal(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
        { ORCA_COORDINATOR_HANDLE: 'term_self', OP_AGENT_PAT: '^sleep$',
          RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
          WL_FIXTURE: fixture(dir, 'wl.json', { ok: true, result: { workers: [] } }) })
      check('R5', 'exit 1 (block — cũ chỉ "đã có worktree")', r.code === 1, `code=${r.code} out=${r.out}`)
      check('R5', 'BLOCKED + pid + cwd', r.out.includes('BLOCKED') && /pid=\d+/.test(r.out) && /cwd=\S/.test(r.out), r.out)
      check('R5', 'KHÔNG dispatch', !r.argv.includes('worktree create'), r.argv)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('== R6 BIN THẬT: worker in-band (orchestration thấy) → block CŨ quyết, kèm owner ==')
  {
    const dir = tempDir('r6')
    const stub = makeOrcaStub(dir)
    const { repo, bf } = writeBracket(dir)
    const wt = join(dir, 'orca', 'workspaces', 'repo', 'sf-2-demo')
    mkdirSync(wt, { recursive: true })
    const child = spawnRealProcess(wt)
    try {
      const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
        { id: 'run_other', coordinator_handle: 'term_other' } ] } })
      const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
        worker({ dispatchId: 'ctx_o', runId: 'run_other', worktree: wt }) ] } })
      const r = launchReal(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
        { ORCA_COORDINATOR_HANDLE: 'term_self', OP_AGENT_PAT: '^sleep$', RL_FIXTURE: rl, WL_FIXTURE: wl })
      check('R6', 'exit 1', r.code === 1, `code=${r.code} out=${r.out}`)
      check('R6', 'block theo owner (logic cũ), không pid-scan đè', r.out.includes('BLOCKED') && r.out.includes('term_other'), r.out)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('== R7 BIN THẬT: worker in-band của CHÍNH MÌNH trong worktree → "đã có worktree" như cũ ==')
  {
    const dir = tempDir('r7')
    const stub = makeOrcaStub(dir)
    const { repo, bf } = writeBracket(dir)
    const wt = join(dir, 'orca', 'workspaces', 'repo', 'sf-2-demo')
    mkdirSync(wt, { recursive: true })
    const child = spawnRealProcess(wt)
    try {
      const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [
        { id: 'run_self', coordinator_handle: 'term_self' } ] } })
      const wl = fixture(dir, 'wl.json', { ok: true, result: { workers: [
        worker({ dispatchId: 'ctx_s', runId: 'run_self', worktree: wt }) ] } })
      const r = launchReal(dir, stub, ['SF-2', '--repo', repo, '--bracket', bf],
        { ORCA_COORDINATOR_HANDLE: 'term_self', OP_AGENT_PAT: '^sleep$', RL_FIXTURE: rl, WL_FIXTURE: wl })
      check('R7', 'exit 0 + thông điệp cũ (không block nhầm relaunch của mình)', r.code === 0 && r.out.includes('đã có worktree: sf-2-demo'), `code=${r.code} out=${r.out}`)
      check('R7', 'không BLOCKED', !r.out.includes('BLOCKED'), r.out)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
