#!/usr/bin/env node
// story-launch tests — dry-run/validation paths trên fixture bracket + stub orca
// (ORCA_BIN seam — không đụng Linear thật/worktree thật; fake HOME cô lập
// workspaces check). Phủ: dry-run OK, SF Done → skip, deps chưa Done → chờ,
// chưa approve → refuse, usage exit 2.
// Chạy: node tests/story-launch-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
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

// stub orca launch-path: linear Todo + worktree show FAIL (fallback --no-parent,
// stdout in tên cha) + worktree create ghi argv vào STUB_ORCA_LOG (I4 — quan sát
// COORD_WT lineage + --base-branch đúng model)
function makeOrcaLaunchStub(dir) {
  const stub = join(dir, 'orca-launch-stub.sh')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "show" ]; then exit 1; fi
if [ "$1" = "worktree" ] && [ "$2" = "create" ]; then
  printf '%s\\n' "$@" >> "$STUB_ORCA_LOG"
  printf '%s\\n' '{"ok":true}'
  exit 0
fi
case "$3" in
  FI-101) printf '%s\\n' '{"ok":true,"result":{"issue":{"state":{"name":"Todo"}}}}' ;;
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

console.log('== L6 launch story-hub: lineage cha = story worktree (basename DEST), base-branch dash ==')
{
  const dir = tempDir('l6')
  const stub = makeOrcaLaunchStub(dir)
  const bd = join(dir, 'docs', 'superpowers', 'brackets')
  mkdirSync(bd, { recursive: true })
  const bf = join(bd, 'test-1-hub.md')
  writeFileSync(bf, `# Story: TEST-1 — hub launch fixture
Destination: story-test-1-hub
Primary: wakii-dev
Worktree model: story-hub

## SF-1 First SF
Tier: 0
linear: FI-101
Depends on: —
What: làm gì đó đầu tiên
Tasks: task-a / task-b
`, 'utf8')
  const orcaLog = join(dir, 'orca.log')
  const r = runLaunch(dir, stub, ['SF-1', '--bracket', bf], { STUB_ORCA_LOG: orcaLog })
  check('L6', 'exit 0 + LAUNCHED', r.code === 0 && r.out.includes('LAUNCHED ✓'), `code=${r.code} out=${r.out}`)
  check('L6', 'cha = story worktree (không hậu tố -coordinator)', r.out.includes('worktree cha story-test-1-hub chưa có'), r.out)
  const log = existsSync(orcaLog) ? readFileSync(orcaLog, 'utf8') : ''
  check('L6', 'create --base-branch story-test-1-hub', log.includes('--base-branch') && log.includes('story-test-1-hub'), log)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== L7 launch legacy: lineage cha giữ <dest>-coordinator ==')
{
  const dir = tempDir('l7')
  const stub = makeOrcaLaunchStub(dir)
  const bf = writeBracket(dir)
  const orcaLog = join(dir, 'orca.log')
  const r = runLaunch(dir, stub, ['SF-1', '--bracket', bf], { STUB_ORCA_LOG: orcaLog })
  check('L7', 'exit 0 + LAUNCHED', r.code === 0 && r.out.includes('LAUNCHED ✓'), `code=${r.code} out=${r.out}`)
  check('L7', 'cha = <dest-slug>-coordinator (legacy giữ nguyên)', r.out.includes('worktree cha test-1-coordinator chưa có'), r.out)
  const log = existsSync(orcaLog) ? readFileSync(orcaLog, 'utf8') : ''
  check('L7', 'create --base-branch story/test-1', log.includes('--base-branch') && log.includes('story/test-1'), log)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
