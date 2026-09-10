#!/usr/bin/env node
// story-report-validate tests (GH-40 SF-1) — 12 SC fixture qua stdin primary +
// --file, exit code + token line-start chỉ đích danh. Grammar pins: field
// TRƯỚC description: đầu tiên; /REPORT ĐẦU TIÊN đóng fence; legacy WARN exit 0.
// Chạy: node tests/report-validate-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-report-validate')

// Resolve python launcher: Windows spawnSync dính Store alias stub cho
// 'python3' (9009) → fallback 'python' rồi 'py' (pattern review-fuse-tests).
function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'report-validate-'))
function tempFile(name, content) {
  const p = join(tempRoot, name)
  writeFileSync(p, content)
  return p
}

function runStdin(input) {
  const r = spawnSync(PY, [BIN], {
    input, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  return { code: r.status, out: r.stdout || '' }
}

function runFile(path) {
  const r = spawnSync(PY, [BIN, '--file', path], {
    encoding: 'utf8', timeout: 30000, input: '',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  return { code: r.status, out: r.stdout || '' }
}

const VALID_DONE = [
  'DONE T1 — làm xong',
  'REPORT',
  'task-id: T1',
  'status: DONE',
  'commit: abc1234',
  'files: src/a.ts, src/b.ts',
  'tests: vitest 9/9 GREEN',
  'description: dev notes gộp vào đây',
  '/REPORT',
].join('\n')

// ---- SC1: đủ field → exit 0 ------------------------------------------------
{
  const r = runStdin(VALID_DONE)
  check('SC1', 'đủ field DONE → exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('SC1', 'stdout OK', r.out.startsWith('OK'), r.out)
}

// ---- SC2: thiếu commit → exit 1 MISSING-FIELD commit (got: ...) -------------
{
  const report = VALID_DONE.replace('commit: abc1234\n', '')
  const r = runStdin(report)
  check('SC2', 'thiếu commit → exit 1', r.code === 1, `code=${r.code}`)
  check('SC2', 'token MISSING-FIELD commit chỉ đích danh', /^FAIL: MISSING-FIELD commit \(got: <missing>\)$/m.test(r.out), r.out)
}

// ---- SC3: sai status → exit 1 BAD-STATUS ------------------------------------
{
  const report = VALID_DONE.replace('status: DONE', 'status: done-ish')
  const r = runStdin(report)
  check('SC3', 'sai status → exit 1', r.code === 1)
  check('SC3', 'token BAD-STATUS <got>', r.out.includes('FAIL: BAD-STATUS done-ish'), r.out)
}

// ---- SC4: DONE + commit none → NONE-ON-DONE; BLOCKED + none → OK ------------
{
  const doneNone = VALID_DONE.replace('commit: abc1234', 'commit: none')
  const rDone = runStdin(doneNone)
  check('SC4a', 'DONE + commit:none → exit 1', rDone.code === 1)
  check('SC4a', 'token NONE-ON-DONE commit', rDone.out.includes('FAIL: NONE-ON-DONE commit'), rDone.out)

  const blockedNone = [
    'BLOCKED T2 — chết ở test',
    'REPORT',
    'task-id: T2',
    'status: BLOCKED',
    'commit: none',
    'files: none',
    'tests: none',
    'description: symptom + tried + need',
    '/REPORT',
  ].join('\n')
  const rBlocked = runStdin(blockedNone)
  check('SC4b', 'BLOCKED + none cả 3 → exit 0', rBlocked.code === 0, rBlocked.out)
}

// ---- SC5: description multiline chứa key-like → không bị bắt field ----------
{
  const report = [
    'DONE T3 — notes quirk',
    'REPORT',
    'task-id: T3',
    'status: DONE',
    'commit: def5678',
    'files: a.ts',
    'tests: ok',
    'description: dòng 1',
    'status: DONE trông-like trong description',
    'commit: x: ykey-like',
    'random_field: cũng như vậy',
    '/REPORT',
    'commit: sau-fence-không-ăn',
  ].join('\n')
  const r = runStdin(report)
  check('SC5', 'description key-like không FAIL thêm', r.code === 0, r.out)
}

// ---- SC6: thiếu /REPORT → UNCLOSED-REPORT -----------------------------------
{
  const report = VALID_DONE.replace('/REPORT', '')
  const r = runStdin(report)
  check('SC6', 'thiếu /REPORT → exit 1', r.code === 1)
  check('SC6', 'token UNCLOSED-REPORT', r.out.includes('FAIL: UNCLOSED-REPORT'), r.out)
}

// ---- SC7: legacy không fence → WARN + exit 0 --------------------------------
{
  const legacy = 'DONE T4 — format cũ không fence\ncommit: aaa\nfiles: x\ntests: y\n'
  const r = runStdin(legacy)
  check('SC7', 'legacy → exit 0', r.code === 0, `code=${r.code}`)
  check('SC7', 'WARN LEGACY-REPORT', r.out.includes('WARN: LEGACY-REPORT'), r.out)
}

// ---- SC8: stdin primary + --file cùng kết quả; CRLF-safe --------------------
{
  const rIn = runStdin(VALID_DONE)
  const rFile = runFile(tempFile('valid.md', VALID_DONE))
  check('SC8a', '--file khớp stdin', rFile.code === rIn.code && rFile.out === rIn.out, `file=${rFile.code}/${rFile.out} stdin=${rIn.code}/${rIn.out}`)
  const crlf = tempFile('crlf.md', VALID_DONE.replace(/\n/g, '\r\n'))
  const rCrlf = runFile(crlf)
  check('SC8b', 'CRLF-safe → exit 0', rCrlf.code === 0, rCrlf.out)
}

// ---- SC9: fence đầu tiên thắng khi nội dung có 2 REPORT ----------------------
{
  const report = [
    'REPORT',
    'task-id: T5',
    'status: DONE',
    'commit: aaa',
    'files: a',
    'tests: b',
    'description: first fence wins',
    '/REPORT',
    'REPORT',
    'task-id: T6',
    'status: BLOCKED',
    '/REPORT',
  ].join('\n')
  const r = runStdin(report)
  check('SC9', '/REPORT đầu tiên đóng fence → exit 0', r.code === 0, r.out)
}

// ---- SC10: usage exit 2 ------------------------------------------------------
{
  const r = spawnSync(PY, [BIN, '--bogus'], { encoding: 'utf8', timeout: 15000 })
  check('SC10', 'unknown option → exit 2', r.status === 2, `code=${r.status}`)
}

// ---- SC11: field rỗng → MISSING-FIELD (got: ) --------------------------------
{
  const report = VALID_DONE.replace('tests: vitest 9/9 GREEN', 'tests:')
  const r = runStdin(report)
  check('SC11', 'field rỗng → exit 1', r.code === 1)
  check('SC11', 'token MISSING-FIELD tests (got: )', /^FAIL: MISSING-FIELD tests \(got: \)$/m.test(r.out), r.out)
}

// ---- SC12: file không đọc được → exit 1 FAIL cannot read --------------------
{
  const r = runFile(join(tempRoot, 'no-such-file.md'))
  check('SC12', 'file missing → exit 1', r.code === 1, `code=${r.code}`)
}

rmSync(tempRoot, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (report-validate 12 SC)')
