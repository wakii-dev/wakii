#!/usr/bin/env node
// story-plan-validate tests — spawn bin thật với stub orca (ORCA_BIN seam, hermetic
// như review-fuse/mcp-server-tests — KHÔNG đụng orca daemon thật). Phủ: D1 deps
// missing/self-dep, D2 cycle, D3 thiếu spec, W1 warn không chặn, W2 run rỗng,
// --json shape, orca lỗi → exit 2, usage exit 2.
// Chạy: node tests/story-plan-validate-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-plan-validate')
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
  const dir = mkdtempSync(join(tmpdir(), `plan-validate-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// stub orca: in nội dung file $FIXTURE (không cần quan tâm argv — validator chỉ gọi task-list)
function makeStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, '#!/bin/sh\ncat "$FIXTURE"\n', 'utf8')
  const broken = join(dir, 'broken.sh')
  writeFileSync(broken, '#!/bin/sh\nexit 7\n', 'utf8')
  chmodSync(stub, 0o755)
  chmodSync(broken, 0o755)
  return stub
}

function fixture(dir, name, obj) {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(obj))
  return p
}

const T_OK = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: 'làm A — verify: test A pass', deps: '[]', status: 'pending' },
    { id: 'task_b', task_title: 'B', spec: 'làm B sau A — acceptance: e2e xanh', deps: '["task_a"]', status: 'pending' },
  ] },
}
const T_MISSING_DEP = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: 'verify A', deps: '["task_zombie"]', status: 'pending' },
  ] },
}
const T_SELF_DEP = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: 'verify A', deps: '["task_a"]', status: 'pending' },
  ] },
}
const T_CYCLE = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: 'verify A', deps: '["task_b"]', status: 'pending' },
    { id: 'task_b', task_title: 'B', spec: 'verify B', deps: '["task_a"]', status: 'pending' },
  ] },
}
const T_NO_SPEC = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: '', deps: '[]', status: 'pending' },
  ] },
}
const T_WARN_ONLY = {
  id: 'x', ok: true,
  result: { runId: 'run_t', tasks: [
    { id: 'task_a', task_title: 'A', spec: 'làm cái A cho xong (không nêu cách chứng minh)', deps: '[]', status: 'pending' },
  ] },
}
const T_EMPTY = { id: 'x', ok: true, result: { runId: 'run_t', tasks: [] } }

function runValidate(dir, stub, fixturePath, { flags = [], env = {} } = {}) {
  const r = spawnSync(BASH, [BIN, ...flags], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ORCA_BIN: stub, FIXTURE: fixturePath, ...env },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== P1 DAG hợp lệ → OK exit 0 ==')
{
  const dir = tempDir('p1')
  const stub = makeStub(dir)
  const r = runValidate(dir, stub, fixture(dir, 'ok.json', T_OK))
  check('P1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('P1', 'verdict OK 2 task', r.out.includes('OK — 2 task, 0 FAIL'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P2 D1 deps mồ côi + self-dep → FAIL exit 1 ==')
{
  const dir = tempDir('p2')
  const stub = makeStub(dir)
  const r1 = runValidate(dir, stub, fixture(dir, 'm.json', T_MISSING_DEP))
  check('P2', 'deps mồ côi FAIL', r1.code === 1 && r1.out.includes('D1: task_a depends on task_zombie không tồn tại'), r1.out)
  const r2 = runValidate(dir, stub, fixture(dir, 's.json', T_SELF_DEP))
  check('P2', 'self-dep FAIL', r2.code === 1 && r2.out.includes('depends on chính nó'), r2.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P3 D2 cycle → FAIL exit 1 ==')
{
  const dir = tempDir('p3')
  const stub = makeStub(dir)
  const r = runValidate(dir, stub, fixture(dir, 'c.json', T_CYCLE))
  check('P3', 'cycle FAIL', r.code === 1 && r.out.includes('D2: dependency cycle'), r.out)
  check('P3', 'cycle nêu đủ 2 node', r.out.includes('task_a → task_b → task_a'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P4 D3 spec rỗng → FAIL; W1 spec không có tiêu chí → WARN không chặn ==')
{
  const dir = tempDir('p4')
  const stub = makeStub(dir)
  const r1 = runValidate(dir, stub, fixture(dir, 'ns.json', T_NO_SPEC))
  check('P4', 'spec rỗng FAIL', r1.code === 1 && r1.out.includes('D3: task A (task_a) thiếu spec'), r1.out)
  const r2 = runValidate(dir, stub, fixture(dir, 'w.json', T_WARN_ONLY))
  check('P4', 'W1 WARN nhưng exit 0', r2.code === 0 && r2.out.includes('W1:'), r2.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P5 W2 run rỗng → WARN exit 0 ==')
{
  const dir = tempDir('p5')
  const stub = makeStub(dir)
  const r = runValidate(dir, stub, fixture(dir, 'e.json', T_EMPTY))
  check('P5', 'run rỗng WARN exit 0', r.code === 0 && r.out.includes('W2: run không có task nào'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== P6 --json shape; orca lỗi → exit 2; usage → exit 2 ==')
{
  const dir = tempDir('p6')
  const stub = makeStub(dir)
  const r1 = runValidate(dir, stub, fixture(dir, 'm.json', T_MISSING_DEP), { flags: ['--json'] })
  let j = null
  try { j = JSON.parse(r1.out) } catch { /* check dưới bắt */ }
  check('P6', 'JSON verdict INVALID + fails có D1', j?.verdict === 'INVALID' && (j?.fails || []).some(m => m.includes('D1:')), r1.out.slice(0, 150))

  const brokenStub = join(dir, 'broken.sh')
  const r2 = runValidate(dir, brokenStub, join(dir, 'x.json'), { env: { FIXTURE: '' } })
  check('P6', 'orca lỗi → exit 2 + D0', r2.code === 2 && r2.out.includes('D0:'), `code=${r2.code} out=${r2.out.slice(0, 120)}`)

  const r3 = spawnSync(BASH, [BIN, '--run'], { encoding: 'utf8', timeout: 15000 })
  check('P6', 'flag --run thiếu giá trị → exit 2', r3.status === 2, `status=${r3.status}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
