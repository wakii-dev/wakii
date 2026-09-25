#!/usr/bin/env node
// story-attempt tests — attempt log 3-lần bằng STORY_ATTEMPT_DIR cô lập
// (không đụng /tmp/story-attempts thật). Phủ: log đếm tăng, cùng approach lần 3
// exit 2 + cảnh báo đổi hướng, approach khác không cộng dồn, show, reset,
// usage sai lệnh exit 1.
// Chạy: node tests/story-attempt-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-attempt')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function attempt(home, args) {
  return spawnSync('bash', [BIN, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, STORY_ATTEMPT_DIR: home }
  })
}

const home = mkdtempSync(join(tmpdir(), 'story-attempt-test-'))

// 1-2. log lần 1 + 2 — exit 0, counter tăng
const r1 = attempt(home, ['log', 'grep-x', 'fail-loop'])
check('A1', 'log lần 1 exit 0', r1.status === 0, `status=${r1.status} ${r1.stderr}`)
check('A1', 'log lần 1 in Attempt #1', (r1.stdout || '').includes('Attempt #1'), r1.stdout)
const r2 = attempt(home, ['log', 'grep-x', 'fail-loop'])
check('A2', 'log lần 2 exit 0 + Attempt #2', r2.status === 0 && (r2.stdout || '').includes('Attempt #2'), r2.stdout)

// 3. approach KHÁC không cộng dồn — vẫn #2-logic (count theo approach)
const r3 = attempt(home, ['log', 'grep-y', 'khác-hướng'])
check('A3', 'approach khác không kế thừa count', r3.status === 0 && (r3.stdout || '').includes('Attempt #1'), r3.stdout)

// 4. lần thứ 3 cùng approach — exit 2 + buộc đổi hướng
const r4 = attempt(home, ['log', 'grep-x', 'vẫn-fail'])
check('A4', 'lần 3 cùng approach exit 2', r4.status === 2, `status=${r4.status}`)
check('A4', 'cảnh báo buộc đổi hướng', (r4.stdout || '').includes('BUỘC đổi hướng'), (r4.stdout || '').slice(0, 200))

// 5. show — in log đã format
const r5 = attempt(home, ['show'])
check('A5', 'show in đủ 3 dòng', (r5.stdout || '').includes('grep-x') && (r5.stdout || '').includes('grep-y'), r5.stdout)

// 6. reset — xoá file log
const r6 = attempt(home, ['reset'])
const logFiles = existsSync(home) ? readdirSync(home) : []
check('A6', 'reset xoá log + in reset', r6.status === 0 && (r6.stdout || '').includes('reset') && logFiles.length === 0, `files=${logFiles.join(',')}`)

// 7. lệnh lạ — usage exit 1
const r7 = attempt(home, ['what'])
check('A7', 'lệnh lạ exit 1 + usage', r7.status === 1 && (r7.stdout || '').includes('usage'), `status=${r7.status} ${r7.stdout}`)

rmSync(home, { recursive: true, force: true })

console.log(`\n== story-attempt-tests: TOTAL ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log(failures.map((f) => `FAIL: ${f}`).join('\n'))
  process.exit(1)
}
