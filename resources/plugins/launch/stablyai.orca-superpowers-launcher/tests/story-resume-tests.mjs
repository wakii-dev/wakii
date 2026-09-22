#!/usr/bin/env node
// story-resume tests — verdict 3 tầng trên fixture worktree + stub orca
// (ORCA_BIN seam + fake HOME — không đụng worktree thật/terminal thật; tên SF
// "sf-77-hfix" cố ý độc nhất để pgrep -f không trúng process ngoài).
// Phủ: --check 5 verdict + UNKNOWN, plan prompt, --send accept/refuse, usage.
// Chạy: node tests/story-resume-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-resume')
const BASH = 'bash'
const SF = 'sf-77-hfix'

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
  const dir = mkdtempSync(join(tmpdir(), `story-resume-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

const GIT = (args) => spawnSync('git', args, { encoding: 'utf8' })

// worktree giả: git repo thật (rev-parse + log) + bracket có SF-77/linear
function makeWorktree(home, { terminals = [], freshLog = false } = {}) {
  const wt = join(home, 'orca', 'workspaces', 'ws1', SF)
  const bd = join(wt, 'docs', 'superpowers', 'brackets')
  mkdirSync(bd, { recursive: true })
  writeFileSync(join(bd, 'fi777-fixture.md'), `# Story: FI-777 — fixture
Destination: story/fi777-fixture

## SF-77 Harness fixture
Tier: 0
linear: FI-777
Depends on: —
What: fixture cho harness
Tasks: task-a
`)
  GIT(['-C', wt, '-c', 'init.defaultBranch=main', 'init', '-q'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
  if (freshLog) writeFileSync(join(wt, '.agent-session.log'), 'đang ghi\n')
  return wt
}

// stub orca: terminal list theo STUB_TERMINALS (JSON array); send ghi argv vào
// STUB_SEND_LOG; STUB_LIST_EMPTY=1 → list in rỗng (orca fail → UNKNOWN)
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/bin/sh
if [ "$1" = "terminal" ] && [ "$2" = "send" ]; then
  printf '%s\\n' "$@" >> "$STUB_SEND_LOG"
  printf '%s\\n' '{"ok":true}'
  exit 0
fi
if [ "$1" = "terminal" ] && [ "$2" = "list" ]; then
  if [ -n "\${STUB_LIST_EMPTY:-}" ]; then exit 0; fi
  printf '%s\\n' "{\\"result\\":{\\"terminals\\":\${STUB_TERMINALS:-[]}}}"
  exit 0
fi
printf '%s\\n' '{"ok":true}'
exit 0
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function runResume(home, stub, args, env = {}) {
  const r = spawnSync(BASH, [BIN, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env, ORCA_BIN: stub, HOME: home,
      STORY_KIT_CONFIG: join(home, 'cfg-missing.json'),
      ...env,
    },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

// turn : term_status decode — '✳ Agent' idle · '⠂ Agent' busy · 'zsh' shell
function scenario(tag, { title = '✳ Agent', terminalsFrom = SF, freshLog = false, listEmpty = false } = {}) {
  const dir = tempDir(tag)
  const home = join(dir, 'fakehome')
  mkdirSync(home, { recursive: true })
  makeWorktree(home, { freshLog })
  const stub = makeOrcaStub(dir)
  const terminals = listEmpty
    ? []
    : [{ worktreeId: `/x/${terminalsFrom === SF ? SF : terminalsFrom}`, title, handle: 'h-1' }]
  const sendLog = join(dir, 'send.log')
  return { dir, home, stub, sendLog, env: { STUB_TERMINALS: JSON.stringify(terminals), STUB_SEND_LOG: sendLog, ...(listEmpty ? { STUB_LIST_EMPTY: '1' } : {}) } }
}

console.log('== R1 --check: idle + stall-window 0 → STALLED ==')
{
  const s = scenario('r1')
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('R1', 'verdict STALLED', r.out.includes(`${SF}|STALLED|`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R2 --check: commit trong stall-window → RUNNING ==')
{
  const s = scenario('r2')
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '5'], s.env)
  check('R2', 'verdict RUNNING', r.out.includes(`${SF}|RUNNING|commit`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R3 --check: terminal ⠂ → BUSY (kể cả commit stale) ==')
{
  const s = scenario('r3', { title: '⠂ Agent' })
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R3', 'verdict BUSY', r.out.includes(`${SF}|BUSY|`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R4 --check: không pane nào cho SF → STALLED-COLD ==')
{
  const s = scenario('r4', { terminalsFrom: 'sf-khac' })
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R4', 'verdict STALLED-COLD', r.out.includes(`${SF}|STALLED-COLD|`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R5 --check: pane bare shell → STALLED-SHELL ==')
{
  const s = scenario('r5', { title: 'zsh' })
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R5', 'verdict STALLED-SHELL', r.out.includes(`${SF}|STALLED-SHELL|`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R6 --check: .agent-session.log tươi → RUNNING-EXT (ưu tiên mọi check) ==')
{
  const s = scenario('r6', { freshLog: true, title: 'zsh' })
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R6', 'verdict RUNNING-EXT', r.out.includes(`${SF}|RUNNING-EXT|log đang ghi`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R7 --check: orca list hỏng → KHÔNG in verdict (không kết luận vội) ==')
{
  const s = scenario('r7', { listEmpty: true })
  const r = runResume(s.home, s.stub, ['--check', '--stall-hours', '0'], s.env)
  check('R7', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('R7', 'không có dòng verdict cho SF', !r.out.includes(`${SF}|`), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R8 plan: STALLED → in resume plan có linear + checklist ==')
{
  const s = scenario('r8')
  const r = runResume(s.home, s.stub, [SF, '--stall-hours', '0'], s.env)
  check('R8', 'RESUME PLAN header', r.out.includes(`RESUME PLAN cho ${SF}`), r.out)
  check('R8', 'prompt mang linear FI-777', r.out.includes(`RESUME ${SF} (FI-777)`), r.out)
  check('R8', 'COMPLETE-RUN CHECKLIST', r.out.includes('COMPLETE-RUN CHECKLIST'), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R9 --send: IDLE → terminal send --enter, prompt RESUME ==')
{
  const s = scenario('r9')
  const r = runResume(s.home, s.stub, [SF, '--send', '--stall-hours', '0'], s.env)
  check('R9', 'SENT ✓', r.code === 0 && r.out.includes('SENT ✓'), `code=${r.code} out=${r.out}`)
  const log = existsSync(s.sendLog) ? readFileSync(s.sendLog, 'utf8') : ''
  check('R9', 'gửi đúng handle + --enter', log.includes('h-1') && log.includes('--enter'), log)
  check('R9', 'payload mang RESUME', log.includes('--text') && /RESUME sf-77-hfix/.test(log), log.slice(0, 200))
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R10 --send: RUNNING → từ chối exit 1 ==')
{
  const s = scenario('r10')
  const r = runResume(s.home, s.stub, [SF, '--send', '--stall-hours', '5'], s.env)
  check('R10', 'exit 1 + từ chối', r.code === 1 && r.out.includes('Từ chối gửi: RUNNING'), `code=${r.code} out=${r.out}`)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R11 --send thiếu tên SF → exit 2 ==')
{
  const s = scenario('r11')
  const r = runResume(s.home, s.stub, ['--send', '--stall-hours', '0'], s.env)
  check('R11', 'exit 2 + hướng dẫn', r.code === 2 && r.out.includes('--send cần tên SF'), `code=${r.code} out=${r.out}`)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R12 --check không có worktree nào → exit 0 im lặng ==')
{
  const dir = tempDir('r12')
  const home = join(dir, 'fakehome')
  mkdirSync(join(home, 'orca', 'workspaces'), { recursive: true })
  const stub = makeOrcaStub(dir)
  const r = runResume(home, stub, ['--check'])
  check('R12', 'exit 0 không output', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
