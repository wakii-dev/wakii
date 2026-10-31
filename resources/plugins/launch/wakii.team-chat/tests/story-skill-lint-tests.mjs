#!/usr/bin/env node
// story-skill-lint tests — lint trên fixture skill dir (copy skill thật rồi phá
// từng lớp check). Phủ: CLEAN trên bản thật, step numbering đứt, pointer đứt,
// dead file references/, dead tool ref, story-base không ngữ cảnh phủ định.
// Chạy: node tests/story-skill-lint-tests.mjs
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-skill-lint')
const REAL_SKILL = resolve(testsDir, '../kit/skills/story-workflow')
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
  const dir = mkdtempSync(join(tmpdir(), `skill-lint-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// copy skill thật vào fixture + tạo ~/.claude/bin seam giả (lint check 3 cần)
function makeFixture(tag) {
  const dir = tempDir(tag)
  const skillDir = join(dir, 'story-workflow')
  cpSync(REAL_SKILL, skillDir, { recursive: true })
  // tool seam: bin giả chứa mọi story-* được nhắc trong skill thật
  const binDir = join(dir, 'claude-bin')
  mkdirSync(binDir, { recursive: true })
  const stub = join(binDir, 'story-stub-generator')
  writeFileSync(stub, '#!/bin/sh\nexit 0\n')
  return { dir, skillDir, binDir }
}

function runLint(skillDir, env = {}) {
  const r = spawnSync(BASH, [BIN, skillDir], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: env.HOME || process.env.HOME },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== S1 skill thật (bản trong kit) → CLEAN ==')
{
  const { dir, skillDir } = makeFixture('s1')
  const r = runLint(skillDir)
  check('S1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(0, 300)}`)
  check('S1', 'RESULT: CLEAN', r.out.includes('RESULT: CLEAN'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S2 đứt step numbering (xoá bước giữa CREATE) → VIOLATIONS ==')
{
  const { dir, skillDir } = makeFixture('s2')
  const md = join(skillDir, 'SKILL.md')
  const t = readText(md).replace(/^7\. /m, '9. ') // 7→9 nhảy số
  writeText(md, t)
  const r = runLint(skillDir)
  check('S2', 'exit 1 + thiếu bước', r.code === 1 && r.out.includes('CREATE thiếu bước'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S3 pointer references/ đứt → VIOLATIONS ==')
{
  const { dir, skillDir } = makeFixture('s3')
  const md = join(skillDir, 'SKILL.md')
  writeText(md, readText(md) + '\nreferences/khong-ton-tai.md\n')
  const r = runLint(skillDir)
  check('S3', 'pointer đứt FAIL', r.code === 1 && r.out.includes('pointer đứt'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S4 dead file trong references/ → VIOLATIONS ==')
{
  const { dir, skillDir } = makeFixture('s4')
  const refs = join(skillDir, 'references')
  mkdirSync(refs, { recursive: true })
  writeFileSync(join(refs, 'dead-file.md'), '# dead\n')
  const r = runLint(skillDir)
  check('S4', 'dead file FAIL', r.code === 1 && r.out.includes('dead file'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S5 tool ref chết → VIOLATIONS ==')
{
  const { dir, skillDir } = makeFixture('s5')
  const md = join(skillDir, 'SKILL.md')
  writeText(md, readText(md) + '\nbin/story-tool-khong-ton-tai\n')
  const r = runLint(skillDir)
  check('S5', 'tool ref chết FAIL', r.code === 1 && r.out.includes('tool ref chết'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S6 story-base không ngữ cảnh phủ định → VIOLATIONS ==')
{
  const { dir, skillDir } = makeFixture('s6')
  const md = join(skillDir, 'SKILL.md')
  writeText(md, readText(md) + '\ndùng story-base làm nhánh đích\n')
  const r = runLint(skillDir)
  check('S6', 'story-base FAIL', r.code === 1 && r.out.includes('story-base'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== S7 SKILL.md không tồn tại → exit 1 ==')
{
  const dir = tempDir('s7')
  const r = runLint(join(dir, 'khong-ton-tai'))
  check('S7', 'exit 1', r.code === 1, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')

// ── helpers đặt sau (hoisted) ──
import { readFileSync as _rf, writeFileSync as _wf } from 'node:fs'
function readText(p) { return _rf(p, 'utf8') }
function writeText(p, t) { _wf(p, t) }
