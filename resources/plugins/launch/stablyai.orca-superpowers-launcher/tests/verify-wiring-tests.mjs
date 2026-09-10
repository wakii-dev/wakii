#!/usr/bin/env node
// story-verify B2b surface-lint wiring tests (GH-30 SF-1, review P1-2) —
// HOME-override clone: story-verify quét $HOME/orca/workspaces/*/sf-*/ nên fake
// HOME chứa clone tên sf-1-test là đủ, không đụng worktree thật. Lint base trỏ
// commit cụ thể (STORY_LINT_BASE) để fixtures tự chủ.
// Chạy: node tests/verify-wiring-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const VERIFY = join(pluginRoot, 'kit/bin/story-verify')
const KIT_JSON = join(pluginRoot, 'kit/kit.json')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 60000 })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

// Fake HOME: clone resources/ của plugin vào sf-1-test (tên khớp glob sf-*/ của
// story-verify) — story-verify tự tìm lint bin qua git toplevel của worktree.
function fakeHome(tag) {
  const home = mkdtempSync(join(tmpdir(), `sv-wiring-${tag}-`))
  const wt = join(home, 'orca', 'workspaces', 'proj', 'sf-1-test')
  const pluginDest = join(wt, 'resources', 'plugins', 'launch', 'stablyai.orca-superpowers-launcher')
  mkdirSync(pluginDest, { recursive: true })
  cpSync(pluginRoot, pluginDest, { recursive: true })
  git(wt, 'init', '-q')
  git(wt, 'config', 'user.email', 't@t')
  git(wt, 'config', 'user.name', 't')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'base')
  return { home, wt }
}

function runVerify(home, baseSha) {
  const r = spawnSync('bash', [VERIFY], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, HOME: home, STORY_LINT_BASE: baseSha },
  })
  return { code: r.status, out: (r.stdout || '') }
}

// ---- W1: lint CLEAN (base = HEAD) → B2b:PASS, không kéo verify xuống INCOMPLETE riêng lẻ ----
{
  console.log('\n== W1 lint-clean ==')
  const { home, wt } = fakeHome('clean')
  const base = git(wt, 'rev-parse', 'HEAD').out
  const r = runVerify(home, base)
  check('W1', 'B2b:PASS in ra stdout', r.out.includes('B2b:PASS'), r.out.slice(0, 400))
  check('W1', 'KHÔNG B2b:FAIL', !r.out.includes('B2b:FAIL'), r.out.slice(0, 200))
  check('W1', 'exit KHÔNG phải 2 (không violation)', r.code !== 2, `code=${r.code}`)
  rmSync(home, { recursive: true, force: true })
}

// ---- W2: lint FAIL (rename thiếu alias) → B2b:FAIL + exit 1 INCOMPLETE ----
{
  console.log('\n== W2 lint-fail ==')
  const { home, wt } = fakeHome('fail')
  const base = git(wt, 'rev-parse', 'HEAD').out
  const kitJsonPath = join(wt, 'resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/kit.json')
  const kit = JSON.parse(readFileSync(KIT_JSON, 'utf8'))
  kit.provides = kit.provides.filter(e => e.name !== 'story-watchdog')
  kit.provides.push({ name: 'story-watchdog-v2', type: 'bin', description: 'renamed without alias' })
  writeFileSync(kitJsonPath, JSON.stringify(kit, null, 2))
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'bad rename')
  const r = runVerify(home, base)
  check('W2', 'B2b:FAIL', r.out.includes('B2b:FAIL'), r.out.slice(0, 400))
  check('W2', 'exit 1 (INCOMPLETE)', r.code === 1, `code=${r.code}`)
  check('W2', 'stdout có token MISSING-ALIAS từ lint', r.out.includes('MISSING-ALIAS story-watchdog'), r.out.slice(0, 400))
  rmSync(home, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
