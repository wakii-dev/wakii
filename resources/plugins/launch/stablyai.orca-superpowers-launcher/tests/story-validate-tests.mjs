#!/usr/bin/env node
// story-validate tests — spawn bin thật trên bracket fixtures trong temp dir
// (KHÔNG đụng docs/superpowers/brackets/ thật). Phủ: verdict OK/INVALID,
// G3 dup, --linear không key → WARN skip exit 0, --linear key rỗng file →
// WARN skip, usage exit 2, --json shape.
// Chạy: node tests/story-validate-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-validate')
// story-validate là bash wrapper + python heredoc — spawn qua bash như các
// test bash-bin khác (qa-failure-paths, story-lesson), KHÔNG qua python.
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
  const dir = mkdtempSync(join(tmpdir(), `story-validate-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

const OK_BRACKET = `# Story: FI-900 — Test story
Destination: story/fi900-test-story

## SF-1 First (Phase 1/1)
Tier: 0
linear: FI-901
Design: none
What: làm cái gì đó có ý nghĩa
Depends on: —
Tasks: task-mot / task-hai

## SF-2 Second (Phase 1/1)
Tier: 1
linear: FI-902
Design: none
What: việc kế tiếp phụ thuộc SF-1
Depends on: SF-1
Tasks: task-ba / task-bon
`

const DUP_BRACKET = `# Story: FI-901 — Dup story
Destination: story/fi901-dup-story

## SF-1 A
Tier: 0
linear: FI-999
What: cái này
Depends on: —
Tasks: t1 / t2

## SF-2 B
Tier: 0
linear: FI-999
What: cái kia
Depends on: —
Tasks: t3 / t4
`

function writeBracket(dir, name, content) {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

function runValidate(file, { flags = [], env = {} } = {}) {
  const r = spawnSync(BASH, [BIN, file, ...flags], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== V1 bracket hợp lệ → OK exit 0 ==')
{
  const dir = tempDir('v1')
  const f = writeBracket(dir, 'ok.md', OK_BRACKET)
  const r = runValidate(f)
  check('V1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V1', 'verdict OK', r.out.includes('OK — 2 SF'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V2 dup linear ID → G3 FAIL exit 1 ==')
{
  const dir = tempDir('v2')
  const f = writeBracket(dir, 'dup.md', DUP_BRACKET)
  const r = runValidate(f)
  check('V2', 'exit 1', r.code === 1, `code=${r.code}`)
  check('V2', 'G3 dup bắt', r.out.includes('G3: linear ID FI-999 dùng cho nhiều SF'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V3 --linear không key → G4 WARN skip, verdict theo format ==')
{
  const dir = tempDir('v3')
  const f = writeBracket(dir, 'ok.md', OK_BRACKET)
  // HOME trỏ temp rỗng → ~/.claude/.linear-key không tồn tại
  const home = tempDir('v3-home')
  const r = runValidate(f, { flags: ['--linear'], env: { LINEAR_API_KEY: '', HOME: home } })
  check('V3', 'exit 0 (WARN không chặn)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V3', 'WARN G4 skip vì thiếu key', r.out.includes('G4: --linear bỏ qua'), r.out)
  check('V3', 'verdict vẫn OK', r.out.includes('OK — 2 SF'), r.out)
  rmSync(dir, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}

console.log('== V4 --json shape có fails/warns/verdict ==')
{
  const dir = tempDir('v4')
  const f = writeBracket(dir, 'dup.md', DUP_BRACKET)
  const r = runValidate(f, { flags: ['--json'] })
  check('V4', 'exit 1', r.code === 1, `code=${r.code}`)
  let j = null
  try { j = JSON.parse(r.out) } catch { /* bỏ qua — check dưới bắt */ }
  check('V4', 'JSON parse được', j !== null, r.out.slice(0, 200))
  check('V4', 'verdict INVALID + sf_count=2', j?.verdict === 'INVALID' && j?.sf_count === 2, JSON.stringify(j)?.slice(0, 200))
  check('V4', 'fails chứa G3', (j?.fails || []).some(m => m.includes('G3:')), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V5 usage: thiếu file / flag lạ → exit 2 ==')
{
  const r1 = spawnSync(BASH, [BIN], { encoding: 'utf8', timeout: 15000 })
  check('V5', 'thiếu file exit 2', r1.status === 2, `status=${r1.status}`)
  const dir = tempDir('v5')
  const f = writeBracket(dir, 'ok.md', OK_BRACKET)
  const r2 = spawnSync(BASH, [BIN, f, '--bogus'], { encoding: 'utf8', timeout: 15000 })
  check('V5', 'flag lạ exit 2', r2.status === 2, `status=${r2.status}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
