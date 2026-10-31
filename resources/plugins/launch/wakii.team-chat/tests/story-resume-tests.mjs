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
// model: ghi thêm dòng `Worktree model:` vào bracket (final review C2 —
// resume prompt phải theo model: story-hub push-only, legacy merge-ngược)
function makeWorktree(home, { terminals = [], freshLog = false, model = '' } = {}) {
  const wt = join(home, 'orca', 'workspaces', 'ws1', SF)
  const bd = join(wt, 'docs', 'superpowers', 'brackets')
  mkdirSync(bd, { recursive: true })
  writeFileSync(join(bd, 'fi777-fixture.md'), `# Story: FI-777 — fixture
Destination: story/fi777-fixture
${model ? `Worktree model: ${model}\n` : ''}
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
function scenario(tag, { title = '✳ Agent', terminalsFrom = SF, freshLog = false, listEmpty = false, model } = {}) {
  const dir = tempDir(tag)
  const home = join(dir, 'fakehome')
  mkdirSync(home, { recursive: true })
  makeWorktree(home, { freshLog, model })
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

console.log('== R13 plan story-hub: prompt push-only — KHÔNG merge/Done (C2) ==')
{
  const s = scenario('r13', { model: 'story-hub' })
  const r = runResume(s.home, s.stub, [SF, '--stall-hours', '0'], s.env)
  check('R13', 'RESUME PLAN header', r.out.includes(`RESUME PLAN cho ${SF}`), r.out)
  check('R13', 'prompt ghi story-hub push nhánh sf', r.out.includes(`git push -u origin ${SF}`), r.out)
  check('R13', 'KHÔNG merge + KHÔNG tự set Done', r.out.includes('KHÔNG merge') && r.out.includes('KHÔNG tự set'), r.out)
  check('R13', 'không còn chỉ thị MERGE vào dest', !r.out.includes('MERGE vào'), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R14 plan legacy (không model): giữ nguyên văn merge-ngược + Done ==')
{
  const s = scenario('r14')
  const r = runResume(s.home, s.stub, [SF, '--stall-hours', '0'], s.env)
  check('R14', 'prompt giữ MERGE vào dest', r.out.includes('MERGE vào story/fi777-fixture'), r.out)
  check('R14', 'prompt giữ Done cuối checklist', r.out.includes('RỒI MỚI FI-777 Done'), r.out)
  check('R14', 'không dính protocol story-hub', !r.out.includes('KHÔNG merge'), r.out)
  rmSync(s.dir, { recursive: true, force: true })
}

console.log('== R15 .wakii-era không bracket: sf_meta đọc dest+linear từ mindmap (LOCAL-4 sf-2) ==')
{
  const dir = tempDir('r15')
  const home = join(dir, 'fakehome')
  const wt = join(home, 'orca', 'workspaces', 'ws1', SF)
  // KHÔNG bracket — story .wakii-era (canonical VU-14): chỉ mindmap
  const mmDir = join(wt, 'docs', 'superpowers', 'mindmaps')
  mkdirSync(mmDir, { recursive: true })
  writeFileSync(join(mmDir, 'local4-kit-launch-safety.wakii'), JSON.stringify({
    wakiiMindmap: 1,
    meta: { story: 'FI-778 — wakii fixture', epic: 'FI-778', dest: 'story/fi777-wakii', generatedAt: '2026-10-04T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'FI-778', state: 'in-progress' },
      { id: 'sf-77', kind: 'sf', title: 'fixture sf', state: 'in-progress', tier: 0, linear: 'FI-778' }
    ],
    edges: [{ from: 'epic', to: 'sf-77', rel: 'contains' }]
  }))
  GIT(['-C', wt, '-c', 'init.defaultBranch=main', 'init', '-q'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
  const stub = makeOrcaStub(dir)
  const r = runResume(home, stub, [SF, '--stall-hours', '0'])
  check('R15', 'RESUME PLAN header', r.out.includes(`RESUME PLAN cho ${SF}`), r.out)
  check('R15', 'dest từ mindmap (không placeholder bracket)', r.out.includes('story/fi777-wakii') && !r.out.includes('<branch-xem-bracket>'), r.out)
  check('R15', 'linear từ node sf của mindmap', r.out.includes('FI-778'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== R16 worktree đa .wakii: file story KHÁC (không có node sf-77) KHÔNG được cung cấp dest ==')
{
  const dir = tempDir('r16')
  const home = join(dir, 'fakehome')
  const wt = join(home, 'orca', 'workspaces', 'ws1', SF)
  const mmDir = join(wt, 'docs', 'superpowers', 'mindmaps')
  mkdirSync(mmDir, { recursive: true })
  // file KHÁC story sort TRƯỚC (glob alphabet) — không có node sf-77, dest sai
  writeFileSync(join(mmDir, 'aaa-other-story.wakii'), JSON.stringify({
    wakiiMindmap: 1,
    meta: { story: 'ZZZ — other', epic: 'ZZZ', dest: 'story/wrong-dest', generatedAt: '2026-10-04T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'ZZZ', state: 'in-progress' },
      { id: 'sf-99', kind: 'sf', title: 'other sf', state: 'pending', tier: 0, linear: 'ZZZ-999' }
    ],
    edges: [{ from: 'epic', to: 'sf-99', rel: 'contains' }]
  }))
  writeFileSync(join(mmDir, 'local4-kit-launch-safety.wakii'), JSON.stringify({
    wakiiMindmap: 1,
    meta: { story: 'FI-778 — wakii fixture', epic: 'FI-778', dest: 'story/fi777-wakii', generatedAt: '2026-10-04T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'FI-778', state: 'in-progress' },
      { id: 'sf-77', kind: 'sf', title: 'fixture sf', state: 'in-progress', tier: 0, linear: 'FI-778' }
    ],
    edges: [{ from: 'epic', to: 'sf-77', rel: 'contains' }]
  }))
  GIT(['-C', wt, '-c', 'init.defaultBranch=main', 'init', '-q'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
  const stub = makeOrcaStub(dir)
  const r = runResume(home, stub, [SF, '--stall-hours', '0'])
  check('R16', 'dest từ file ĐÚNG story', r.out.includes('story/fi777-wakii'), r.out)
  check('R16', 'KHÔNG dính dest story khác', !r.out.includes('story/wrong-dest'), r.out)
  check('R16', 'linear từ node sf-77', r.out.includes('FI-778'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
