#!/usr/bin/env node
// story-test tests — RULE 0 enforcer trên stub orca (tab/eval/screenshot seam)
// + shim `sleep` qua PATH để harness chạy tức thì. KHÔNG mở tab/browser thật.
// Phủ: usage, tab create fail, console errors → FAIL, flow heading pass/fail,
// happy path PASS. Chạy: node tests/story-test-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-test')
const BASH = 'bash'
const URL = 'http://localhost:1/fixture'

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
  const dir = mkdtempSync(join(tmpdir(), `story-test-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// stub orca: eval dispatch theo biểu thức; STUB_CONSOLE_ERRORS/STUB_HEADING điều
// khiển kịch bản; screenshot in rác (best-effort, không chặn kết quả)
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "tab" ]; then
  if [ -n "\${STUB_TAB_FAIL:-}" ]; then printf '%s\\n' '{"ok":false}'; exit 0; fi
  printf '%s\\n' '{"ok":true,"result":{}}'
  exit 0
fi
if [ "$1" = "eval" ]; then
  expr="$3"
  case "$expr" in
    *__consoleErrors*)
      if [ -n "\${STUB_CONSOLE_ERRORS:-}" ]; then echo "$STUB_CONSOLE_ERRORS"; else echo "0"; fi ;;
    *location.hash*) echo "" ;;
    *h1,h2*)
      if [ -n "\${STUB_HEADING:-}" ]; then echo "$STUB_HEADING"; else echo "Dashboard"; fi ;;
    *) echo "" ;;
  esac
  exit 0
fi
printf '%s\\n' 'not-json'
exit 0
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function makeSleepShim(dir) {
  const bin = join(dir, 'fakebin')
  mkdirSync(bin, { recursive: true })
  const shim = join(bin, 'sleep')
  writeFileSync(shim, '#!/bin/sh\nexit 0\n', 'utf8')
  chmodSync(shim, 0o755)
  return bin
}

function runTest(dir, stub, args, env = {}) {
  const r = spawnSync(BASH, [BIN, ...args], {
    encoding: 'utf8', timeout: 120000,
    env: {
      ...process.env, ORCA_BIN: stub,
      PATH: `${makeSleepShim(dir)}:${process.env.PATH}`,
      ...env,
    },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

console.log('== T1 usage: thiếu URL → exit 1 ==')
{
  const dir = tempDir('t1')
  const stub = makeOrcaStub(dir)
  const r = spawnSync(BASH, [BIN], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ORCA_BIN: stub } })
  check('T1', 'exit 1 + usage', r.status === 1 && (r.stderr || '').includes('usage:'), `code=${r.status} err=${r.stderr || ''}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T2 tab create fail → FAIL exit 1 (không có "xong") ==')
{
  const dir = tempDir('t2')
  const stub = makeOrcaStub(dir)
  const r = runTest(dir, stub, [URL], { STUB_TAB_FAIL: '1' })
  check('T2', 'exit 1', r.code === 1, `code=${r.code} out=${r.out}`)
  check('T2', 'báo không mở được tab', r.out.includes('không mở được tab'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T3 happy path: tab ok + console sạch → PASS exit 0 ==')
{
  const dir = tempDir('t3')
  const stub = makeOrcaStub(dir)
  const r = runTest(dir, stub, [URL])
  check('T3', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('T3', 'console sạch', r.out.includes('✓ Console sạch'), r.out)
  check('T3', 'RULE 0 PASS', r.out.includes('RULE 0 PASS'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T4 console errors → FAIL exit 1 ==')
{
  const dir = tempDir('t4')
  const stub = makeOrcaStub(dir)
  const r = runTest(dir, stub, [URL], { STUB_CONSOLE_ERRORS: '3' })
  check('T4', 'exit 1', r.code === 1, `code=${r.code} out=${r.out}`)
  check('T4', 'liệt kê số lỗi', r.out.includes('Console errors: 3'), r.out)
  check('T4', 'RULE 0 FAIL', r.out.includes('RULE 0 FAIL'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T5 flow: screen có heading → PASS ==')
{
  const dir = tempDir('t5')
  const stub = makeOrcaStub(dir)
  const r = runTest(dir, stub, [URL, '--flow', 'dashboard'])
  check('T5', 'heading nhìn thấy', r.out.includes('✓ #dashboard → Dashboard'), r.out)
  check('T5', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== T6 flow: screen rỗng heading → FAIL ==')
{
  const dir = tempDir('t6')
  const stub = makeOrcaStub(dir)
  const r = runTest(dir, stub, [URL, '--flow', 'broken'], { STUB_HEADING: 'EMPTY' })
  check('T6', 'báo screen không heading', r.out.includes('❌ FAIL: #broken — không có heading'), r.out)
  check('T6', 'exit 1', r.code === 1, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
