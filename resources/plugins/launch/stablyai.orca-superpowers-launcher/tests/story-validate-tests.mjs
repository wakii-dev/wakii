#!/usr/bin/env node
// story-validate tests — spawn bin thật trên bracket fixtures trong temp dir
// (KHÔNG đụng docs/superpowers/brackets/ thật). Phủ: verdict OK/INVALID,
// G3 dup, --linear không key → WARN skip exit 0, --linear key rỗng file →
// WARN skip, usage exit 2, --json shape, Primary + Worktree model (H2b/H2c),
// Destination 2 form (legacy slash / story-hub dash — sweep story-worktree-hub).
// Chạy: node tests/story-validate-tests.mjs
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
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
Primary: main
Worktree model: legacy

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

// story-hub bracket đầy đủ — Primary + Worktree model: story-hub (contract mới)
// Destination dash-form = naming story-hub (orca sanitize /→-)
const HUB_BRACKET = `# Story: FI-999 — hub test
Destination: story-fi-999-hub
Primary: wakii-dev
Worktree model: story-hub

## SF-1 Hub (Phase 1/1)
Tier: 0
linear:
What: bracket story-hub đầy đủ trường mới
Depends on: —
Tasks: task-mot / task-hai
`

const NO_PRIMARY_BRACKET = `# Story: FI-998 — no primary
Destination: story/fi-998-no-primary

## SF-1 A (Phase 1/1)
Tier: 0
linear:
What: thiếu Primary
Depends on: —
Tasks: t1 / t2
`

const BAD_MODEL_BRACKET = `# Story: FI-997 — bad model
Destination: story/fi-997-bad-model
Primary: wakii-dev
Worktree model: spinach

## SF-1 A (Phase 1/1)
Tier: 0
linear:
What: model lạ
Depends on: —
Tasks: t1 / t2
`

const NO_MODEL_BRACKET = `# Story: FI-996 — legacy no model
Destination: story/fi-996-legacy
Primary: main

## SF-1 A (Phase 1/1)
Tier: 0
linear:
What: legacy thiếu Worktree model
Depends on: —
Tasks: t1 / t2
`

const HUB_NO_PRIMARY_BRACKET = `# Story: FI-995 — hub no primary
Destination: story-fi-995-hub-no-primary
Worktree model: story-hub

## SF-1 A (Phase 1/1)
Tier: 0
linear:
What: story-hub thiếu Primary
Depends on: —
Tasks: t1 / t2
`

// dash-form dest (story-hub naming — regex mới `story[-/]` nhận cả 2 form)
const DASH_DEST_BRACKET = `# Story: FI-994 — dash dest
Destination: story-fi-994-dash
Primary: wakii-dev
Worktree model: story-hub

## SF-1 Dash (Phase 1/1)
Tier: 0
linear:
What: dest dash-form story-<epic-id>-<slug> validate OK
Depends on: —
Tasks: task-mot / task-hai
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

// ── --resolve-primary fixtures (thang 6 bậc, spec story-worktree-hub) ──
// Hermetic: ORCA_BIN luôn stub (không gọi orca thật), STORY_KIT_CONFIG +
// HOME trỏ temp (không đụng kit config máy). Git ≥ 2.25 only.
function gitSync(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

// makeRepo — temp git repo với branch chỉ định; extraBranches tạo thêm branch
// local; remoteUrl thêm remote origin (không fetch — cho bậc 4 theo url);
// remote=true → origin bare sibling + origin/HEAD (bậc 5); config → git config
// entries trong repo. Trả { repo, root } — root để đặt stub/fixture + cleanup.
function makeRepo(tag, { branch = 'master', extraBranches = [], remoteUrl = null, remote = false, config = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), `story-validate-${tag}-`))
  const seed = join(root, 'seed')
  mkdirSync(seed, { recursive: true })
  gitSync(seed, 'init', '-q')
  gitSync(seed, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`)
  gitSync(seed, 'config', 'user.email', 't@t')
  gitSync(seed, 'config', 'user.name', 't')
  writeFileSync(join(seed, 'f.txt'), 'x\n')
  gitSync(seed, 'add', '-A')
  gitSync(seed, 'commit', '-qm', 'init')
  for (const b of extraBranches) gitSync(seed, 'branch', b)
  for (const [k, v] of config) gitSync(seed, 'config', k, v)
  if (remoteUrl) {
    gitSync(seed, 'remote', 'add', 'origin', remoteUrl)
    return { repo: seed, root }
  }
  if (!remote) return { repo: seed, root }
  const originPath = join(root, 'origin.git')
  gitSync(seed, 'clone', '-q', '--bare', seed, originPath)
  const work = join(root, 'work')
  gitSync(root, 'clone', '-q', originPath, work)
  gitSync(work, 'config', 'user.email', 't@t')
  gitSync(work, 'config', 'user.name', 't')
  for (const [k, v] of config) gitSync(work, 'config', k, v)
  gitSync(work, 'remote', 'set-head', 'origin', '--auto')
  return { repo: work, root }
}

// orca dead stub — exit 1 (bậc 2 phải fail im lặng + warn stderr)
function makeOrcaDeadStub(root) {
  const stub = join(root, 'orca-dead.sh')
  writeFileSync(stub, '#!/bin/sh\nexit 1\n')
  chmodSync(stub, 0o755)
  return stub
}

// orca JSON stub — in JSON KHÔNG có baseRef (bậc 2 skip, warn stderr)
function makeOrcaJsonStub(root) {
  const stub = join(root, 'orca-json.sh')
  writeFileSync(stub, `#!/bin/sh\necho '{"result":{"repo":{}}}'\n`)
  chmodSync(stub, 0o755)
  return stub
}

function runResolve(repo, { flags = [], env = {} } = {}) {
  const r = spawnSync(BASH, [BIN, '--resolve-primary', ...flags], {
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

console.log('== V6 bracket story-hub đầy đủ → OK, không warn Primary/model ==')
{
  const dir = tempDir('v6')
  const f = writeBracket(dir, 'hub.md', HUB_BRACKET)
  const r = runValidate(f)
  check('V6', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V6', 'verdict OK', r.out.includes('OK — 1 SF'), r.out)
  const warns = r.out.split('\n').filter(l => l.startsWith('WARN:'))
  check('V6', 'không warn nào chứa Primary / Worktree model',
    !warns.some(l => l.includes('Primary') || l.includes('Worktree model')), warns.join(' | '))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V7 thiếu Primary + không model (legacy) → WARN Primary, verdict OK ==')
{
  const dir = tempDir('v7')
  const f = writeBracket(dir, 'no-primary.md', NO_PRIMARY_BRACKET)
  const r = runValidate(f)
  check('V7', 'exit 0 (WARN không chặn)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V7', 'WARN chứa Primary:', r.out.includes('WARN: Primary:'), r.out)
  check('V7', 'verdict vẫn OK', r.out.includes('OK — 1 SF'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V8 Worktree model lạ → FAIL ==')
{
  const dir = tempDir('v8')
  const f = writeBracket(dir, 'bad-model.md', BAD_MODEL_BRACKET)
  const r = runValidate(f)
  check('V8', 'exit 1', r.code === 1, `code=${r.code}`)
  check('V8', 'FAIL chứa Worktree model', r.out.includes('Worktree model'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V9 thiếu Worktree model → WARN backward-compat, verdict vẫn OK ==')
{
  const dir = tempDir('v9')
  const f = writeBracket(dir, 'no-model.md', NO_MODEL_BRACKET)
  const r = runValidate(f)
  check('V9', 'exit 0 (WARN không chặn)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V9', 'WARN chứa Worktree model', r.out.includes('WARN: Worktree model'), r.out)
  check('V9', 'verdict vẫn OK', r.out.includes('OK — 1 SF'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V10 model story-hub + thiếu Primary → FAIL (fail-closed) ==')
{
  const dir = tempDir('v10')
  const f = writeBracket(dir, 'hub-no-primary.md', HUB_NO_PRIMARY_BRACKET)
  const r = runValidate(f)
  check('V10', 'exit 1', r.code === 1, `code=${r.code}`)
  check('V10', 'FAIL chứa Primary:', r.out.includes('Primary:'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== V11 dest dash-form (story-hub naming) → OK, không warn Destination ==')
{
  const dir = tempDir('v11')
  const f = writeBracket(dir, 'dash.md', DASH_DEST_BRACKET)
  const r = runValidate(f)
  check('V11', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('V11', 'verdict OK', r.out.includes('OK — 1 SF'), r.out)
  check('V11', 'không warn Destination', !r.out.includes('Destination'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

// ══ --resolve-primary — thang 6 bậc (spec story-worktree-hub) ══

console.log('== R1 (t1) --primary explicit → in ref, exit 0 (bậc 1 thắng trước orca) ==')
{
  const { repo, root } = makeRepo('r1', { branch: 'main', extraBranches: ['my-main'] })
  const r = runResolve(repo, {
    flags: ['--primary', 'my-main', '--repo', repo],
    env: { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root },
  })
  check('R1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out} err=${r.err}`)
  check('R1', 'stdout đúng my-main (duy nhất)', r.out.trim() === 'my-main', `out=${JSON.stringify(r.out)}`)
  check('R1', 'bậc 2 không chạy (explicit chặn trước — không warn orca)', !r.err.includes('bậc 2'), r.err)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R2 (t2) bậc 5 thuần: origin/HEAD → remote default (master) ==')
{
  const { repo, root } = makeRepo('r2', { branch: 'master', remote: true })
  const r = runResolve(repo, {
    flags: ['--repo', repo],
    env: { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root },
  })
  check('R2', 'exit 0', r.code === 0, `code=${r.code} out=${r.out} err=${r.err}`)
  check('R2', 'stdout đúng master (remote HEAD)', r.out.trim() === 'master', `out=${JSON.stringify(r.out)}`)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R3 (t3) bậc 3: git config wakii.primaryBranch (bậc 2 stub JSON không baseRef → skip warn) ==')
{
  const { repo, root } = makeRepo('r3', {
    branch: 'main', extraBranches: ['dev-int'],
    config: [['wakii.primaryBranch', 'dev-int']],
  })
  const r = runResolve(repo, {
    flags: ['--repo', repo],
    env: { ORCA_BIN: makeOrcaJsonStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root },
  })
  check('R3', 'exit 0', r.code === 0, `code=${r.code} out=${r.out} err=${r.err}`)
  check('R3', 'stdout đúng dev-int (git config)', r.out.trim() === 'dev-int', `out=${JSON.stringify(r.out)}`)
  check('R3', 'bậc 2 skip có warn stderr', r.err.includes('bậc 2'), r.err)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R4 (t4) bậc 4: STORY_KIT_CONFIG primaryBranchByRemote theo remote identity ==')
{
  const { repo, root } = makeRepo('r4', {
    branch: 'main', extraBranches: ['gl-main'],
    remoteUrl: 'git@gitlab.com:x/y.git',
  })
  const kcPath = join(root, 'story-kit.json')
  writeFileSync(kcPath, '{"primaryBranchByRemote":{"gitlab.com/x/y":"gl-main"}}')
  const r = runResolve(repo, {
    flags: ['--repo', repo],
    env: { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: kcPath, HOME: root },
  })
  check('R4', 'exit 0', r.code === 0, `code=${r.code} out=${r.out} err=${r.err}`)
  check('R4', 'stdout đúng gl-main (kit config)', r.out.trim() === 'gl-main', `out=${JSON.stringify(r.out)}`)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R5 (t5) không resolve được gì → exit 1 + PRIMARY-UNRESOLVED ==')
{
  const { repo, root } = makeRepo('r5', { branch: 'main' })
  const r = runResolve(repo, {
    flags: ['--repo', repo],
    env: { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root },
  })
  check('R5', 'exit 1', r.code === 1, `code=${r.code} out=${r.out}`)
  check('R5', 'stdout chứa PRIMARY-UNRESOLVED (hỏi user)', r.out.includes('PRIMARY-UNRESOLVED'), r.out)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R6 (t6) --primary nhánh-không-tồn-tại → exit 1 (fail-closed verify) ==')
{
  const { repo, root } = makeRepo('r6', { branch: 'main' })
  const r = runResolve(repo, {
    flags: ['--primary', 'branch-ma-khong-ton-tai', '--repo', repo],
    env: { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root },
  })
  check('R6', 'exit 1', r.code === 1, `code=${r.code} out=${r.out}`)
  check('R6', 'stdout chứa PRIMARY-UNRESOLVED', r.out.includes('PRIMARY-UNRESOLVED'), r.out)
  rmSync(root, { recursive: true, force: true })
}

console.log('== R7 --primary không giá trị → exit 2 (bare flag + flag nuốt flag) ==')
{
  const { repo, root } = makeRepo('r7', { branch: 'main', config: [['wakii.primaryBranch', 'main']] })
  const env = { ORCA_BIN: makeOrcaDeadStub(root), STORY_KIT_CONFIG: join(root, 'khong-ton-tai.json'), HOME: root }
  // biến thể 1: --primary nuốt --repo làm giá trị (phải exit 2, không phải thử ref '--repo')
  const r1 = runResolve(repo, { flags: ['--primary', '--repo', repo], env })
  check('R7', 'flag nuốt flag → exit 2', r1.code === 2, `code=${r1.code} out=${r1.out}`)
  check('R7', 'biến thể 1 in Usage', r1.out.includes('Usage'), r1.out)
  // biến thể 2: --primary bare cuối argv — KHÔNG được lặng lẽ rơi xuống ladder
  // (repo này có wakii.primaryBranch=main → ladder sẽ exit 0 nếu rơi xuống)
  const r2 = runResolve(repo, { flags: ['--primary'], env })
  check('R7', 'bare flag → exit 2 (không degrade xuống ladder)', r2.code === 2, `code=${r2.code} out=${r2.out}`)
  check('R7', 'biến thể 2 in Usage', r2.out.includes('Usage'), r2.out)
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
