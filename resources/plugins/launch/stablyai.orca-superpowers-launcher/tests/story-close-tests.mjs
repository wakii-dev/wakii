#!/usr/bin/env node
// story-close tests — bin chạy trên git repo fixture THẬT (temp: git init + worktree
// add) — probe ownership fail-open trên env test (orca thật bỏ qua worktree temp).
// Phủ: all-merged clean → dọn; unmerged → BLOCK; dirty worktree → BLOCK;
// dry-run không xoá; --json verdict.
// Chạy: node tests/story-close-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-close')
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
  const dir = mkdtempSync(join(tmpdir(), `story-close-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function git(dir, args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
}

// repo fixture: main commit → branch dest story/t-close → branch sf-1 (merge vào dest)
function makeRepo(tag, { sfMerged = true, sfDirty = false } = {}) {
  const dir = tempDir(tag)
  const g = (a) => git(dir, a)
  g(['init', '-q']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't'])
  g(['checkout', '-qb', 'story/t-close'])
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  g(['add', '.']); g(['commit', '-qm', 'init'])
  g(['checkout', '-qb', 'sf-1-close'])
  writeFileSync(join(dir, 'sf.txt'), 'sf work\n')
  g(['add', '.']); g(['commit', '-qm', 'sf work'])
  g(['checkout', '-q', 'story/t-close'])
  if (sfMerged) g(['merge', '-q', '--no-ff', 'sf-1-close', '-m', 'merge sf-1'])
  if (sfDirty) writeFileSync(join(dir, 'dirty.txt'), 'x\n')
  return dir
}

function makeSfWorktree(repo, name = 'sf-1-wt') {
  const wt = join(repo, '..', `wt-${name}-${Math.random().toString(36).slice(2, 6)}`)
  const r = git(repo, ['worktree', 'add', wt, 'sf-1-close'])
  if (r.status !== 0) throw new Error('worktree add fail: ' + r.stderr)
  return wt
}

function runClose(repo, dest, { flags = [] } = {}) {
  const r = spawnSync(BASH, [BIN, dest, ...flags], { cwd: repo, encoding: 'utf8', timeout: 60000 })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== T1 mọi SF đã merge + worktree sạch → cleanup hết, exit 0 ==')
{
  const repo = makeRepo('t1', { sfMerged: true })
  const wt = makeSfWorktree(repo)
  const r = runClose(repo, 'story/t-close')
  check('T1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('T1', 'worktree đã bị remove', !existsSync(wt), wt)
  check('T1', 'branch sf-1-close đã xoá', !git(repo, ['branch', '--list', 'sf-1-close']).stdout.includes('sf-1-close'), '')
  check('T1', 'PASS verdict', r.out.includes('✓ CLOSE xong'), r.out)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== T2 sf chưa merge → BLOCK exit 1, branch/worktree giữ nguyên ==')
{
  const repo = makeRepo('t2', { sfMerged: false })
  const wt = makeSfWorktree(repo)
  const r = runClose(repo, 'story/t-close')
  check('T2', 'exit 1', r.code === 1, `code=${r.code}`)
  check('T2', 'BLOCK nêu chưa merge', r.out.includes('CHƯA merge'), r.out)
  check('T2', 'branch sf-1-close còn', git(repo, ['branch', '--list', 'sf-1-close']).stdout.includes('sf-1-close'), '')
  check('T2', 'worktree còn', existsSync(wt), wt)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== T3 worktree dirty (tracked file sửa) → BLOCK, không xoá ==')
{
  const repo = makeRepo('t3', { sfMerged: true })
  const wt = makeSfWorktree(repo)
  // dirty = file TRACKED sửa chưa commit (untracked ?? không tính — doctrine)
  writeFileSync(join(wt, 'sf.txt'), 'đang làm dở\n')
  const r = runClose(repo, 'story/t-close')
  check('T3', 'dirty → BLOCK exit 1', r.code === 1 && r.out.includes('worktree dirty'), r.out)
  check('T3', 'file dở còn nguyên (không xoá mất)', existsSync(join(wt, 'sf.txt')), '')
  rmSync(repo, { recursive: true, force: true })
}

console.log('== T4 dry-run → audit nhưng không xoá ==')
{
  const repo = makeRepo('t4', { sfMerged: true })
  const wt = makeSfWorktree(repo)
  const r = runClose(repo, 'story/t-close', { flags: ['--dry-run'] })
  check('T4', 'exit 0 + dry-run note', r.code === 0 && r.out.includes('dry-run'), r.out)
  check('T4', 'branch còn (dry-run không xoá)', git(repo, ['branch', '--list', 'sf-1-close']).stdout.includes('sf-1-close'), '')
  rmSync(repo, { recursive: true, force: true })
}

console.log('== T5 --json verdict parse được ==')
{
  const repo = makeRepo('t5', { sfMerged: true })
  const wt = makeSfWorktree(repo)
  const r = runClose(repo, 'story/t-close', { flags: ['--json'] })
  let j = null
  try { j = JSON.parse(r.out) } catch { /* check dưới bắt */ }
  check('T5', 'JSON verdict OK + closed=1', j?.verdict === 'OK' && j?.closed === 1, r.out.slice(0, 150))
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
