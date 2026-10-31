#!/usr/bin/env node
// Negative-test harness cho 3 QA bins (FI-380 review gap — coverage 7/36 bins).
// Chạy: node tests/qa-bins-negative-tests.mjs
// KIT_BIN=<dir> override (mặc định: ../kit/bin relative tests/).
// surface-lint KHÔNG test ở đây — W2 của verify-wiring-tests.mjs đã phủ
// rename-thiếu-alias (MISSING-ALIAS + B2b:FAIL) — tránh duplicate.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const kitBin = process.env.KIT_BIN || resolve(testsDir, '../kit/bin')

const pass = [], failures = []
function check(case_name, cond, detail = '') {
  if (cond) pass.push(case_name)
  else { failures.push(case_name); console.log(`  [FAIL] ${case_name}${detail ? ' — ' + detail : ''}`) }
}
function run(bin, args, input = '') {
  const r = spawnSync('python3', [join(kitBin, bin), ...args], { encoding: 'utf8', input, timeout: 30000 })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

// ---- report-validate: grammar REPORT fence (6 field bắt buộc, DONE|BLOCKED) ----
const RV = 'story-report-validate'
// Grammar: field TRƯỚC description; `description:` mở khóa multiline —
// PHẢI là field cuối (learned khi viết test: đặt giữa nuốt hết field sau nó)
const FENCE = (body) => `REPORT\n${body}\n/REPORT\n`
const VALID = 'task-id: SF-1\nstatus: DONE\ncommit: abc1234\nfiles: a.ts\ntests: 3/3\ndescription: x'
{
  console.log('\n== report-validate ==')
  const ok = run(RV, [], FENCE(VALID))
  check('RV report hợp lệ → exit 0, không MISSING-FIELD', ok.code === 0 && !ok.out.includes('MISSING-FIELD'), `code=${ok.code} ${ok.out.slice(0, 120)}`)

  const noTask = run(RV, [], FENCE('status: DONE\ncommit: abc1234\nfiles: a.ts\ntests: 3/3\ndescription: x'))
  check('RV thiếu task-id → exit 1 + MISSING-FIELD task-id', noTask.code === 1 && noTask.out.includes('MISSING-FIELD task-id'), `code=${noTask.code}`)

  const badStatus = run(RV, [], FENCE('task-id: SF-1\nstatus: IN_PROGRESS\ncommit: abc1234\nfiles: a.ts\ntests: 3/3\ndescription: x'))
  check('RV status lạ → exit 1 + BAD-STATUS IN_PROGRESS', badStatus.code === 1 && badStatus.out.includes('BAD-STATUS IN_PROGRESS'), `code=${badStatus.code}`)

  const legacy = run(RV, [], 'STATUS: DONE\nkhông có fence\n')
  check('RV không fence → exit 0 + WARN LEGACY-REPORT (tolerant legacy)', legacy.code === 0 && legacy.out.includes('LEGACY-REPORT'), `code=${legacy.code} ${legacy.out.slice(0, 120)}`)

  const descTrap = run(RV, [], FENCE('task-id: SF-1\ndescription: x\nstatus: DONE\ncommit: abc1234\nfiles: a.ts\ntests: 3/3'))
  check('RV description đặt giữa nuốt field sau nó → exit 1 (documented trap)', descTrap.code === 1 && descTrap.out.includes('MISSING-FIELD status'), `code=${descTrap.code}`)
}

// ---- review-fuse: OUTBOX parsing + catastrophic guard ----
const RF = 'story-review-fuse'
{
  console.log('\n== review-fuse ==')
  const home = mkdtempSync(join(tmpdir(), 'qa-fuse-'))
  try {
    const outbox = join(home, 'outbox'); mkdirSync(outbox)
    const r0 = spawnSync('python3', [join(kitBin, RF), 'sf-1', '--dir', outbox], { encoding: 'utf8', timeout: 30000 })
    check('RF outbox trống → exit 0 (no-findings)', r0.status === 0, `code=${r0.status} ${r0.stdout?.slice(0, 120)}`)

    const dead = join(home, 'dead'); mkdirSync(dead)
    writeFileSync(join(dead, 'code-reviewer-sf-1.md'), '')
    const r1 = spawnSync('python3', [join(kitBin, RF), 'sf-1', '--dir', dead], { encoding: 'utf8', timeout: 30000 })
    check('RF OUTBOX 0 byte → exit 1 catastrophic (FUSE FAIL)', r1.status === 1 && (r1.stdout + '').includes('FUSE FAIL'), `code=${r1.status}`)

    const bad = spawnSync('python3', [join(kitBin, RF), '--flag-lạ'], { encoding: 'utf8', timeout: 30000 })
    check('RF flag lạ → exit 2 usage', bad.status === 2, `code=${bad.status}`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

console.log(`\n== TOTAL: ${pass.length} PASS / ${failures.length} FAIL ==`)
if (failures.length) { console.log('FAILURES:\n- ' + failures.join('\n- ')); process.exit(1) }
console.log('QA-BINS HARNESS GREEN (report-validate grammar + review-fuse catastrophic/usage)')
