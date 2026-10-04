#!/usr/bin/env node
// story-mindmap --resolve tests — đọc chuẩn state sf node giữa các copy worktree
// (LOCAL-4 sf-2, bệnh FI-30/VU-32): đích-done + local-pending → done; local-done
// không bao giờ bị hạ; worktree-only mindmap tìm được (vocabulary-learn); không
// đâu có → MISSING exit 3; file hỏng → INVALID exit 2; git thiếu → fail-open.
// Fixture: git repo THẬT trong tmpdir (git show/worktree list cần repo thật) —
// KHÔNG đụng mindmap story nào khác.
// Chạy: node tests/story-mindmap-resolve-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-mindmap')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

const TMP_ROOTS = []
function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `mindmap-resolve-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  TMP_ROOTS.push(dir)
  return dir
}

const GITENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
function git(repo, args) {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: GITENV })
}

function wakiiDoc(states, extraMeta = {}) {
  const nodes = [{ id: 'epic', kind: 'epic', title: 'FI-900 — fixture', state: 'in-progress' }]
  for (const [id, st] of Object.entries(states)) {
    nodes.push({ id, kind: 'sf', title: id, state: st, tier: 0 })
  }
  return {
    wakiiMindmap: 1,
    meta: {
      story: 'FI-900 — fixture',
      epic: 'FI-900',
      dest: extraMeta.dest ?? 'story/fi900-fix',
      generatedAt: '2026-10-04T00:00:00Z',
      generator: 'story-mindmap 1.0.0',
      ...(extraMeta.meta ?? {})
    },
    nodes,
    edges: nodes.filter(n => n.id !== 'epic').map(n => ({ from: 'epic', to: n.id, rel: 'contains' }))
  }
}

const MM_REL = 'docs/superpowers/mindmaps/fi900-fix.wakii'

// repo: main có local copy (localStates, null = không có file) + nhánh đích
// (destStates, null = không snapshot). destBranchExact: tên ref đích khớp meta.dest.
function makeRepo(tag, { localStates, destStates, destBranchExact = true, worktreeCopy = null, extra = {} }) {
  const repo = tempDir(tag)
  git(repo, ['init'])
  git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(repo, MM_REL), JSON.stringify(localStates ? wakiiDoc(localStates, extra) : { placeholder: true }))
  if (!localStates) rmSync(join(repo, MM_REL))
  writeFileSync(join(repo, 'README.md'), 'fixture\n')
  git(repo, ['add', 'README.md'])
  git(repo, ['commit', '-m', 'init'])
  if (destStates) {
    const name = destBranchExact ? 'story/fi900-fix' : 'wakii-dev/story/fi900-fix'
    git(repo, ['checkout', '-b', name])
    mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
    writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc(destStates, extra)))
    git(repo, ['add', '-f', MM_REL])
    git(repo, ['commit', '-m', 'mindmap snapshot'])
    git(repo, ['checkout', 'main'])
    // checkout main xoá file (tracked trên đích, absent trên main) — ghi lại copy
    // local stale trên đĩa: đúng hiện tượng "primary copy pending mãi" (VU-32)
    if (localStates) {
      mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
      writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc(localStates, extra)))
    }
  }
  return repo
}

function run(repo, args, env = {}) {
  // process.execPath trực tiếp — NOGIT case đè PATH=/nonexistent chỉ để giết git
  // của bin, không được giết luôn shebang `env node` của chính bin
  return spawnSync(process.execPath, [BIN, '--resolve', ...args], {
    encoding: 'utf8',
    cwd: repo,
    env: { ...process.env, ...env },
    timeout: 30000
  })
}
const json = r => { try { return JSON.parse(r.stdout) } catch { return null } }

// ── AC1 (VU-32): đích sf-1 done, primary copy pending → đọc chuẩn = done ────
{
  const repo = makeRepo('ac1', { localStates: { 'sf-1': 'pending', 'sf-2': 'in-progress' }, destStates: { 'sf-1': 'done', 'sf-2': 'pending' } })
  const mm = join(repo, MM_REL)
  const r = run(repo, [mm, '--repo', repo, '--json'])
  check('AC1', 'exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('AC1', 'sf-1 → done (đích thắng local pending)', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
  check('AC1', 'sf-2 giữ in-progress local (đích pending không đè)', j?.states?.['sf-2'] === 'in-progress', JSON.stringify(j?.states))
  check('AC1', 'upgraded ghi sf-1', Array.isArray(j?.upgraded) && j.upgraded.includes('sf-1'), JSON.stringify(j?.upgraded))
  check('AC1', 'source = local (base copy local)', j?.source === 'local', j?.source)
  check('AC1', 'dest ref khớp meta.dest', j?.dest?.ref === 'story/fi900-fix', JSON.stringify(j?.dest))
  // không đụng file local (read-only)
  const after = JSON.parse(readFileSync(mm, 'utf8'))
  check('AC1', 'file local KHÔNG bị ghi (read-only)', after.nodes.find(n => n.id === 'sf-1').state === 'pending')
}

// ── FI-30 chiều ngược: local done (tick driver), đích pending → KHÔNG bị hạ ──
{
  const repo = makeRepo('fi30', { localStates: { 'sf-1': 'done' }, destStates: { 'sf-1': 'pending' } })
  const j = json(run(repo, [join(repo, MM_REL), '--repo', repo, '--json']))
  check('FI30', 'sf-1 giữ done local (no-downgrade)', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
  check('FI30', 'upgraded rỗng', Array.isArray(j?.upgraded) && j.upgraded.length === 0, JSON.stringify(j?.upgraded))
}

// ── epic derive lại khi có upgrade: mọi sf done → epic complete ─────────────
{
  const repo = makeRepo('epic', { localStates: { 'sf-1': 'pending' }, destStates: { 'sf-1': 'done' } })
  const j = json(run(repo, [join(repo, MM_REL), '--repo', repo, '--json']))
  check('EPIC', 'epic → complete sau upgrade toàn done', j?.epicState === 'complete', j?.epicState)
}

// ── dest KHÔNG có snapshot mindmap giữa story → fail-open, không lỗi ────────
{
  const repo = makeRepo('nodest', { localStates: { 'sf-1': 'pending' }, destStates: null })
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--json'])
  check('NODST', 'exit 0 (fail-open)', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('NODST', 'state local giữ nguyên', j?.states?.['sf-1'] === 'pending', JSON.stringify(j?.states))
  check('NODST', 'warning nhắc dest thiếu snapshot', Array.isArray(j?.warnings) && j.warnings.some(w => /dest/i.test(w)), JSON.stringify(j?.warnings))
}

// ── ref đích chỉ tồn tại dạng prefix (wakii-dev/...) → suffix match ─────────
{
  const repo = makeRepo('prefix', { localStates: { 'sf-1': 'pending' }, destStates: { 'sf-1': 'done' }, destBranchExact: false })
  const j = json(run(repo, [join(repo, MM_REL), '--repo', repo, '--json']))
  check('PREFIX', 'sf-1 → done qua ref wakii-dev/…', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
  check('PREFIX', 'dest.ref = wakii-dev/story/fi900-fix', j?.dest?.ref === 'wakii-dev/story/fi900-fix', JSON.stringify(j?.dest))
}

// ── vocabulary-learn: local KHÔNG có file, chỉ worktree anh em có ───────────
{
  const repo = makeRepo('wtonly', { localStates: null, destStates: null })
  const wt = join(tempDir('wtonly-wt'), 'wt')
  git(repo, ['worktree', 'add', wt, '-b', 'sf-9-vocab'])
  mkdirSync(join(wt, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(wt, MM_REL), JSON.stringify(wakiiDoc({ 'sf-1': 'in-progress' })))
  const missing = join(repo, MM_REL)
  const r = run(repo, [missing, '--repo', repo, '--json'])
  check('WTONLY', 'exit 0 (tìm thấy qua worktree)', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('WTONLY', 'source = worktree', j?.source === 'worktree', j?.source)
  // git worktree list trả path đã resolve symlink (/var → /private/var) — so realpath
  const sameFile = typeof j?.file === 'string' && (() => { try { return readFileSync(j.file, 'utf8') === readFileSync(join(wt, MM_REL), 'utf8') } catch { return false } })()
  check('WTONLY', 'file trỏ đúng bản worktree', sameFile, j?.file)
  check('WTONLY', 'state đọc đúng', j?.states?.['sf-1'] === 'in-progress', JSON.stringify(j?.states))
}

// ── combo VU-32 × vocabulary-learn (review-2 NEEDS-VERIFICATION): local KHÔNG
// có, worktree copy pending, đích CÓ snapshot done → worktree base vẫn nâng done
{
  const repo = makeRepo('wtdest', { localStates: null, destStates: { 'sf-1': 'done', 'sf-2': 'pending' } })
  const wt = join(tempDir('wtdest-wt'), 'wt')
  git(repo, ['worktree', 'add', wt, '-b', 'sf-9-combo'])
  mkdirSync(join(wt, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(wt, MM_REL), JSON.stringify(wakiiDoc({ 'sf-1': 'in-progress', 'sf-2': 'pending' })))
  const j = json(run(repo, [join(repo, MM_REL), '--repo', repo, '--json']))
  check('WTDEST', 'sf-1 nâng done qua worktree base', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
  check('WTDEST', 'source = worktree', j?.source === 'worktree', j?.source)
  check('WTDEST', 'dest.ref khớp meta.dest của bản worktree', j?.dest?.ref === 'story/fi900-fix', JSON.stringify(j?.dest))
  check('WTDEST', 'upgraded ghi sf-1', j?.upgraded?.includes('sf-1'), JSON.stringify(j?.upgraded))
}

// ── local KHÔNG có + đích CÓ snapshot → đọc thẳng từ nhánh đích ─────────────
{
  const repo = makeRepo('destonly', { localStates: null, destStates: { 'sf-1': 'done' } })
  // không có local copy = không có meta.dest → consumer PHẢI biết --dest (hợp đồng)
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--dest', 'story/fi900-fix', '--json'])
  check('DESTONLY', 'exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('DESTONLY', 'source = dest-branch', j?.source === 'dest-branch', j?.source)
  check('DESTONLY', 'state done', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
}

// ── không đâu có file → MISSING exit 3, báo rõ ──────────────────────────────
{
  const repo = makeRepo('missing', { localStates: null, destStates: null })
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--json'])
  check('MISSING', 'exit 3', r.status === 3, `status=${r.status}`)
  check('MISSING', 'stderr nói MISSING', /MISSING/i.test(r.stderr), r.stderr.slice(0, 200))
  check('MISSING', 'stdout không phải JSON ok:true', !(json(r)?.ok))
}

// ── file hỏng → INVALID exit 2, không đoán mù ───────────────────────────────
{
  const repo = makeRepo('invalid', { localStates: null, destStates: null })
  mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(repo, MM_REL), '{ json gãy')
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--json'])
  check('INVALID', 'exit 2', r.status === 2, `status=${r.status}`)
  check('INVALID', 'stderr nói INVALID', /INVALID/i.test(r.stderr), r.stderr.slice(0, 200))
}

// ── human output + --node: in đúng dòng state ───────────────────────────────
{
  const repo = makeRepo('human', { localStates: { 'sf-1': 'pending', 'sf-2': 'done' }, destStates: { 'sf-1': 'done' } })
  const r = run(repo, [join(repo, MM_REL), '--repo', repo])
  const lines = r.stdout.trim().split('\n')
  check('HUMAN', 'dòng sf-1 done', lines.some(l => l.trim() === 'sf-1 done'), r.stdout)
  check('HUMAN', 'dòng sf-2 done', lines.some(l => l.trim() === 'sf-2 done'), r.stdout)
  check('HUMAN', 'dòng source', lines.some(l => l.startsWith('source:')), r.stdout)
  const rn = run(repo, [join(repo, MM_REL), '--repo', repo, '--node', 'sf-1'])
  check('NODE', '--node sf-1 in "done"', rn.stdout.trim() === 'done', rn.stdout)
  const rm = run(repo, [join(repo, MM_REL), '--repo', repo, '--node', 'sf-99'])
  check('NODE', '--node thiếu → exit 3 MISSING', rm.status === 3, `status=${rm.status}`)
}

// ── git không khả dụng (PATH rỗng) → fail-open về local, không chết ─────────
{
  const repo = makeRepo('nogit', { localStates: { 'sf-1': 'pending' }, destStates: { 'sf-1': 'done' } })
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--json'], { PATH: '/nonexistent-sf2' })
  check('NOGIT', 'exit 0 (fail-open)', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('NOGIT', 'state local pending giữ (không nâng đc)', j?.states?.['sf-1'] === 'pending', JSON.stringify(j?.states))
  check('NOGIT', 'warning nhắc git hỏng', Array.isArray(j?.warnings) && j.warnings.length > 0, JSON.stringify(j?.warnings))
}

// ── meta.dest rác → skip dest scan an toàn (không crash, không git show rác) ─
{
  const repo = makeRepo('junkdest', { localStates: { 'sf-1': 'pending' }, destStates: null, extra: { meta: { dest: '.. -rf' } } })
  const r = run(repo, [join(repo, MM_REL), '--repo', repo, '--json'])
  check('JUNKDEST', 'exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`)
  const j = json(r)
  check('JUNKDEST', 'dest.ref null (không dùng ref rác)', j?.dest?.ref == null, JSON.stringify(j?.dest))
}

// ── --dest override meta.dest ────────────────────────────────────────────────
{
  const repo = makeRepo('dstflag', { localStates: { 'sf-1': 'pending' }, destStates: null })
  git(repo, ['checkout', '-b', 'other-dest'])
  mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc({ 'sf-1': 'done' }, { meta: { dest: 'other-dest' } })))
  git(repo, ['add', '-f', MM_REL])
  git(repo, ['commit', '-m', 'snap other'])
  git(repo, ['checkout', 'main'])
  const j = json(run(repo, [join(repo, MM_REL), '--repo', repo, '--dest', 'other-dest', '--json']))
  check('DSTFLAG', '--dest thắng meta.dest → sf-1 done', j?.states?.['sf-1'] === 'done', JSON.stringify(j?.states))
  check('DSTFLAG', 'dest.ref = other-dest', j?.dest?.ref === 'other-dest', JSON.stringify(j?.dest))
}

// ── usage: thiếu file → exit 2 ───────────────────────────────────────────────
{
  const r = spawnSync(BIN, ['--resolve'], { encoding: 'utf8', timeout: 15000 })
  check('USAGE', 'exit 2 khi thiếu <file>', r.status === 2, `status=${r.status}`)
}

// dọn fixture tmp (git repo + worktree thật — không dọn là tích müll mỗi lần chạy)
for (const r of TMP_ROOTS) rmSync(r, { recursive: true, force: true })

console.log(`\nstory-mindmap-resolve: ${pass} pass, ${fail} fail`)
if (fail > 0) {
  console.error('FAILURES:\n' + failures.map(f => '  - ' + f).join('\n'))
  process.exit(1)
}
