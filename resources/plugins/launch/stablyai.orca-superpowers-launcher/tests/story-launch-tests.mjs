#!/usr/bin/env node
// story-launch tests — dry-run/validation paths trên fixture bracket + stub orca
// (ORCA_BIN seam — không đụng Linear thật/worktree thật; fake HOME cô lập
// workspaces check). Phủ: dry-run OK, SF Done → skip, deps chưa Done → chờ,
// chưa approve → refuse, usage exit 2.
// Chạy: node tests/story-launch-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-launch')
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
  const dir = mkdtempSync(join(tmpdir(), `story-launch-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

const BRACKET = `# Story: TEST-1 — Bracket fixture (test)
Destination: story/test-1

## SF-1 First SF
Tier: 0
linear: FI-101
Depends on: —
What: làm gì đó đầu tiên
Tasks: task-a / task-b

## SF-2 Second SF
Tier: 1
linear: FI-102
Depends on: SF-1
What: làm tiếp theo
Tasks: task-c / task-d

## SF-9 No Linear SF
Tier: 0
linear:
Depends on: —
What: chưa approve
Tasks: task-x
`

// stub orca: linear issue <id> → state theo env; mặc định Todo
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
case "$3" in
  FI-101)
    if [ -n "$STUB_FI101_DONE" ]; then
      printf '%s\\n' '{"ok":true,"result":{"issue":{"state":{"name":"Done"}}}}'
    else
      printf '%s\\n' '{"ok":true,"result":{"issue":{"state":{"name":"Todo"}}}}'
    fi ;;
  FI-102) printf '%s\\n' '{"ok":true,"result":{"issue":{"state":{"name":"Todo"}}}}' ;;
  *) printf '%s\\n' '{"ok":true,"result":{"issue":{"state":{"name":"Todo"}}}}' ;;
esac
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function writeBracket(root) {
  const bd = join(root, 'docs', 'superpowers', 'brackets')
  mkdirSync(bd, { recursive: true })
  const p = join(bd, 'test-1.md')
  writeFileSync(p, BRACKET)
  return p
}

function runLaunch(dir, stub, args, env = {}) {
  const fakeHome = join(dir, 'fakehome')
  mkdirSync(fakeHome, { recursive: true })
  const r = spawnSync(BASH, [BIN, ...args], {
    cwd: dir, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env, ORCA_BIN: stub, HOME: fakeHome,
      STORY_RESUME_BIN: join(dir, 'resume-missing.sh'),
      ...env,
    },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== L1 dry-run SF-1 hợp lệ → exit 0 + prompt chuẩn ==')
{
  const dir = tempDir('l1')
  const stub = makeOrcaStub(dir)
  const bf = writeBracket(dir)
  const r = runLaunch(dir, stub, ['SF-1', '--bracket', bf, '--dry-run'])
  check('L1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('L1', 'DRY-RUN launch sf-1', r.out.includes('DRY-RUN launch sf-1'), r.out)
  check('L1', 'prompt chuẩn: orca-superpowers-workflow', r.out.includes('orca-superpowers-workflow'), r.out.slice(0, 300))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L2 SF đã Done → skip exit 0 ==')
{
  const dir = tempDir('l2')
  const stub = makeOrcaStub(dir)
  const bf = writeBracket(dir)
  const r = runLaunch(dir, stub, ['SF-1', '--bracket', bf], { STUB_FI101_DONE: '1' })
  check('L2', 'exit 0 + đã Done', r.code === 0 && r.out.includes('đã Done — không launch lại'), `code=${r.code} out=${r.out}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L3 dep chưa Done → chờ exit 1 ==')
{
  const dir = tempDir('l3')
  const stub = makeOrcaStub(dir)
  const bf = writeBracket(dir)
  const r = runLaunch(dir, stub, ['SF-2', '--bracket', bf])
  check('L3', 'exit 1', r.code === 1, `code=${r.code}`)
  check('L3', 'chờ dep SF-1', r.out.includes('chờ: dep SF-1'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L4 SF chưa approve (không linear) → refuse exit 1 ==')
{
  const dir = tempDir('l4')
  const stub = makeOrcaStub(dir)
  const bf = writeBracket(dir)
  const r = runLaunch(dir, stub, ['SF-9', '--bracket', bf])
  check('L4', 'exit 1 + chưa approve', r.code === 1 && r.out.includes('chưa approve'), `code=${r.code} out=${r.out}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L5 usage: không SF arg → exit 2 ==')
{
  const dir = tempDir('l5')
  const stub = makeOrcaStub(dir)
  const r = spawnSync(BASH, [BIN], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, ORCA_BIN: stub } })
  check('L5', 'exit 2 + usage', r.status === 2 && r.stdout.includes('usage:'), `code=${r.status} out=${r.stdout}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
