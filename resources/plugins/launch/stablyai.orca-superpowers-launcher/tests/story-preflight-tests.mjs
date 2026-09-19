#!/usr/bin/env node
// story-preflight tests — bin chạy trên git repo fixture trong temp (hermetic,
// KHÔNG đụng repo thật; server/DB chỉ là WARN nên không cần mock). Phủ: PASS
// sạch, sai branch, tree dirty (tracked) vs untracked-only, node_modules thiếu/
// tắt qua config, .env path tùy chỉnh, config file sourced.
// Chạy: node tests/story-preflight-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-preflight')
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
  const dir = mkdtempSync(join(tmpdir(), `preflight-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// repo fixture: git init + 1 commit + node_modules + server/.env (đủ để PASS mặc định)
function makeRepo(tag) {
  const dir = tempDir(tag)
  const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  git(['init', '-q'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  git(['checkout', '-b', 'story/test-main'])
  writeFileSync(join(dir, 'README.md'), 'fixture\n')
  git(['add', '.'])
  git(['commit', '-qm', 'init'])
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  mkdirSync(join(dir, 'server'), { recursive: true })
  writeFileSync(join(dir, 'server', '.env'), 'X=1\n')
  return dir
}

function runPreflight(repo, { flags = [], env = {} } = {}) {
  const r = spawnSync(BASH, [BIN, ...flags], {
    cwd: repo, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

console.log('== F1 repo sạch đúng branch → PASS exit 0 ==')
{
  const repo = makeRepo('f1')
  const r = runPreflight(repo, { flags: ['--branch', 'story/test-main'] })
  check('F1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('F1', '✓ Branch', r.out.includes('✓ Branch: story/test-main'), r.out)
  check('F1', '✓ tree sạch', r.out.includes('✓ Working tree sạch'), r.out)
  check('F1', '✓ node_modules', r.out.includes('✓ node_modules'), r.out)
  check('F1', 'PRE-FLIGHT PASS', r.out.includes('PRE-FLIGHT PASS'), r.out)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== F2 sai branch → FAIL exit 1 ==')
{
  const repo = makeRepo('f2')
  const r = runPreflight(repo, { flags: ['--branch', 'story/khac'] })
  check('F2', 'exit 1', r.code === 1, `code=${r.code}`)
  check('F2', '❌ Branch nêu rõ 2 bên', r.out.includes("đang 'story/test-main', cần 'story/khac'"), r.out)
  check('F2', 'PRE-FLIGHT FAIL', r.out.includes('PRE-FLIGHT FAIL'), r.out)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== F3 tracked dirty → FAIL; untracked-only → vẫn PASS ==')
{
  const repo = makeRepo('f3')
  writeFileSync(join(repo, 'README.md'), 'dirty\n')
  const r1 = runPreflight(repo, { flags: ['--branch', 'story/test-main'] })
  check('F3', 'dirty tracked FAIL', r1.code === 1 && r1.out.includes('files dirty'), r1.out)
  // untracked file (??) bị loại khỏi dirty count
  rmSync(join(repo, 'README.md'), { force: true })
  git_restore(repo)
  writeFileSync(join(repo, 'untracked.txt'), '??\n')
  const r2 = runPreflight(repo, { flags: ['--branch', 'story/test-main'] })
  check('F3', 'untracked-only không chặn', r2.code === 0, `code=${r2.code} out=${r2.out}`)
  rmSync(repo, { recursive: true, force: true })
}
function git_restore(repo) {
  spawnSync('git', ['checkout', '--', '.'], { cwd: repo })
}

console.log('== F4 node_modules thiếu → FAIL; PREFLIGHT_NODE_MODULES=0 → tắt check ==')
{
  const repo = makeRepo('f4')
  rmSync(join(repo, 'node_modules'), { recursive: true, force: true })
  const r1 = runPreflight(repo, { flags: ['--branch', 'story/test-main'] })
  check('F4', 'node_modules thiếu FAIL + hint pnpm', r1.code === 1 && r1.out.includes('node_modules thiếu') && r1.out.includes('pnpm install'), r1.out)
  const r2 = runPreflight(repo, { flags: ['--branch', 'story/test-main'], env: { PREFLIGHT_NODE_MODULES: '0' } })
  check('F4', 'config tắt check → PASS', r2.code === 0 && !r2.out.includes('node_modules'), r2.out)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== F5 config file: .env path tùy chỉnh + hint pkg manager ==')
{
  const repo = makeRepo('f5')
  writeFileSync(join(repo, '.story-preflight.conf'), 'PREFLIGHT_ENV_FILE=apps/server/.env\nPREFLIGHT_PKG_MGR=npm\n')
  const r = runPreflight(repo, { flags: ['--branch', 'story/test-main'] })
  check('F5', 'config được đọc (nêu path)', r.out.includes('.story-preflight.conf'), r.out)
  check('F5', 'WARN .env custom thiếu', r.out.includes('⚠ apps/server/.env thiếu'), r.out)
  check('F5', 'WARN không chặn (exit 0)', r.code === 0, `code=${r.code}`)
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
