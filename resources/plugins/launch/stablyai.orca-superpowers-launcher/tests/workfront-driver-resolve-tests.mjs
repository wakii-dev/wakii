#!/usr/bin/env node
// workfront-driver đọc mindmap qua resolver tests — LOCAL-4 sf-2 (FI-30/VU-32).
// E2E qua `--dry` (không dispatch) trên git repo THẬT trong tmpdir + HOME giả:
//   VU32: primary copy pending, nhánh đích done → driver THẤY done (không
//         re-dispatch việc đã merge); VOCAB: mindmap chỉ tồn tại ở worktree
//         anh em → driver đọc được đúng file (MM repoint, không EXIT im lặng);
//         LEGACY: resolver tắt → hành vi cũ (đọc copy local) giữ nguyên.
// Chạy: node tests/workfront-driver-resolve-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/workfront-driver')

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
  const dir = mkdtempSync(join(tmpdir(), `driver-resolve-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  TMP_ROOTS.push(dir)
  return dir
}

const GITENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (repo, args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: GITENV })

function wakiiDoc(states, dest = 'story/fi900-fix') {
  const nodes = [{ id: 'epic', kind: 'epic', title: 'FI-900 — fixture', state: 'in-progress' }]
  for (const [id, st] of Object.entries(states)) nodes.push({ id, kind: 'sf', title: id, state: st, tier: 0 })
  return {
    wakiiMindmap: 1,
    meta: { story: 'FI-900 — fixture', epic: 'FI-900', dest, generatedAt: '2026-10-04T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes,
    edges: nodes.filter(n => n.id !== 'epic').map(n => ({ from: 'epic', to: n.id, rel: 'contains' }))
  }
}

const MM_REL = 'docs/superpowers/mindmaps/fi900-fix.wakii'

// repo: main (primary checkout) + nhánh đích snapshot (optional) + copy local
// stale ghi lại trên đĩa sau checkout (VU-32: primary pending mãi)
function makeRepo(tag, { localStates, destStates, destBranch = 'story/fi900-fix' }) {
  const repo = tempDir(tag)
  git(repo, ['init'])
  git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/master'])
  writeFileSync(join(repo, 'README.md'), 'fixture\n')
  git(repo, ['add', 'README.md'])
  git(repo, ['commit', '-m', 'init'])
  if (destStates) {
    git(repo, ['checkout', '-b', destBranch])
    mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
    writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc(destStates)))
    git(repo, ['add', '-f', MM_REL])
    git(repo, ['commit', '-m', 'mindmap snapshot'])
    git(repo, ['checkout', 'master'])
    if (localStates) {
      mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
      writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc(localStates)))
    }
  } else if (localStates) {
    mkdirSync(join(repo, dirname(MM_REL)), { recursive: true })
    writeFileSync(join(repo, MM_REL), JSON.stringify(wakiiDoc(localStates)))
  }
  return repo
}

function runDriver(repo, slug, env = {}) {
  const home = tempDir('home')
  const r = spawnSync('bash', [BIN, '--dry', slug, '--repo', repo], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, ...env },
    timeout: 120000
  })
  const logFile = join(repo, 'docs', 'superpowers', 'navigator', 'driver', slug, 'driver.log')
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
  return { r, log, logFile }
}

// ── VU-32: local pending, đích done → driver thấy done (hết re-dispatch) ────
{
  const repo = makeRepo('vu32', { localStates: { 'sf-1': 'pending' }, destStates: { 'sf-1': 'done' } })
  const { log } = runDriver(repo, 'fi900-fix')
  check('VU32', 'states đọc từ đích: sf-1 done', /DRY: states: .*sf-1 done/.test(log), log.slice(-600))
  check('VU32', 'log ghi dest-upgrade=sf-1', /dest-upgrade=sf-1/.test(log), log.slice(-600))
}

// ── VOCAB (vocabulary-learn): mindmap chỉ ở worktree anh em → đọc được ──────
{
  const repo = makeRepo('vocab', { localStates: null, destStates: null })
  const wt = join(tempDir('vocab-wt'), 'wt-fi900')
  git(repo, ['worktree', 'add', wt, '-b', 'sf-9-vocab'])
  mkdirSync(join(wt, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(wt, MM_REL), JSON.stringify(wakiiDoc({ 'sf-1': 'in-progress' })))
  const { log } = runDriver(repo, 'fi900-fix')
  check('VOCAB', 'không EXIT "không có mindmap"', !/EXIT: không có mindmap/.test(log), log.slice(-600))
  check('VOCAB', 'MM repoint sang bản worktree', /MM repoint/.test(log) && /wt-fi900/.test(log), log.slice(-600))
  check('VOCAB', 'states đọc từ worktree: sf-1 in-progress', /DRY: states: .*sf-1 in-progress/.test(log), log.slice(-600))
}

// ── LEGACY: resolver tắt (bin exit≠0) → đọc copy cwd như cũ (hành vi cũ) ────
// Driver --repo chạy PORTABLE (cwd = worktree per-story) → legacy đọc MM trong
// worktree đó: seed sẵn branch+worktree+mindmap đúng path driver tự attach.
{
  const repo = makeRepo('legacy', { localStates: { 'sf-1': 'pending' }, destStates: { 'sf-1': 'done' } })
  git(repo, ['branch', 'fi900-fix'])
  const basename = repo.split('/').pop()
  const wt = join(dirname(repo), `${basename}-fi900-fix`)
  git(repo, ['worktree', 'add', wt, 'fi900-fix'])
  mkdirSync(join(wt, dirname(MM_REL)), { recursive: true })
  writeFileSync(join(wt, MM_REL), JSON.stringify(wakiiDoc({ 'sf-1': 'pending' })))
  const { log } = runDriver(repo, 'fi900-fix', { STORY_MINDMAP_BIN: '/bin/false' })
  check('LEGACY', 'fallback đọc cwd worktree: sf-1 pending', /DRY: states: .*sf-1 pending/.test(log), log.slice(-600))
}

// ── MISSING rõ ràng: không local, không đích, không worktree ────────────────
{
  const repo = makeRepo('miss', { localStates: null, destStates: null })
  const { log } = runDriver(repo, 'fi900-fix')
  check('MISSING', 'EXIT nhắc resolve MISS (không im lặng)', /không có mindmap.*resolve MISS/.test(log), log.slice(-600))
}

// dọn fixture tmp (repo + worktree + fake HOME thật — không dọn là tích müll)
for (const r of TMP_ROOTS) rmSync(r, { recursive: true, force: true })

console.log(`\nworkfront-driver-resolve: ${pass} pass, ${fail} fail`)
if (fail > 0) {
  console.error('FAILURES:\n' + failures.map(f => '  - ' + f).join('\n'))
  process.exit(1)
}
