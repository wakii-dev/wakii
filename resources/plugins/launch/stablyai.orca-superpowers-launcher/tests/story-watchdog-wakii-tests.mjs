#!/usr/bin/env node
// story-watchdog .wakii derive tests (VU-14 SF-5 T5) — dry-run launch-next trên
// fixture .wakii-only (fake HOME + ORCA_BIN stub; không đụng worktree/Linear thật).
// Phủ: launch-next SF rows từ nodes+edges · wakii-validate gate fail-closed ·
// STORY-COMPLETE derive · story-status registry .wakii · deps Done gate.
// Chạy: node tests/story-watchdog-wakii-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-watchdog')
const STATUS = resolve(testsDir, '../kit/bin/story-status')

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
  const dir = mkdtempSync(join(tmpdir(), `wd-wakii-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function wakiiDoc({ linear1 = 'FI-901', linear2 = 'FI-902', dep = true } = {}) {
  return JSON.stringify({
    wakiiMindmap: 1,
    meta: { story: 'WI-9 — Watchdog wakii fixture', epic: 'WI-9', dest: 'story/wi-9',
      generatedAt: '2026-09-28T00:00:00Z', generator: 'test' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'WI-9 — Watchdog wakii fixture' },
      { id: 'sf-1', kind: 'sf', title: 'First WI', state: 'pending', linear: linear1 },
      { id: 'sf-2', kind: 'sf', title: 'Second WI', state: 'pending', linear: linear2 }
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'epic', to: 'sf-2', rel: 'contains' },
      ...(dep ? [{ from: 'sf-2', to: 'sf-1', rel: 'depends-on' }] : [])
    ]
  }, null, 2)
}

// stub orca: repo list → fixture repo; linear issue → STUB_STATE (Done/Todo)
function makeOrcaStub(dir, repoPath) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/usr/bin/env bash
case "$1 $2" in
  "repo list") printf '{"result":{"repos":[{"path":"%s"}]}}' "$STUB_REPO" ;;
  "linear issue"*) printf '{"result":{"issue":{"state":{"name":"%s"}}}}' "$STUB_STATE" ;;
  *) printf '{}' ;;
esac
`)
  chmodSync(stub, 0o755)
  return stub
}

// fixture: repo với mindmaps/*.wakii duy nhất (không bracket) + fake HOME
function makeFixture(tag, doc) {
  const dir = tempDir(tag)
  const home = join(dir, 'fakehome')
  const repo = join(home, 'orca', 'projects', 'proj-wi')
  mkdirSync(join(repo, 'docs', 'superpowers', 'mindmaps'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'superpowers', 'mindmaps', 'wi-9.wakii'), doc)
  return { dir, home, repo }
}

function runWatchdog(fx, stub, env = {}) {
  const r = spawnSync('bash', [BIN, '--dry-run', '--launch-next'], {
    encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, HOME: fx.home, ORCA_BIN: stub, STUB_REPO: fx.repo,
      STUB_STATE: 'Todo', PYTHONUTF8: '1', ...env },
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

console.log('== W1 launch-next .wakii-only: SF rows từ nodes, dest từ meta, dry-run ==')
{
  const fx = makeFixture('w1', wakiiDoc())
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('W1', 'SF-1 sẵn sàng launch (linear từ node)', r.out.includes('SẴN SÀNG LAUNCH: sf-1-first-wi (FI-901)'), r.out)
  check('W1', 'dest từ meta.dest', r.out.includes('đích story/wi-9'), r.out)
  check('W1', 'SF-2 dep Todo → chờ (deps từ edges depends-on)', r.out.includes('chờ: SF-2 (FI-902) — deps: SF-1=Todo'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== W2 gate fail-closed: wakii-validate thiếu → SKIP mọi story ==')
{
  const fx = makeFixture('w2', wakiiDoc())
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, { STORY_VALIDATE_BIN: join(fx.dir, 'validator-khong-ton-tai') })
  check('W2', 'in cảnh báo SKIP fail-closed', r.out.includes('launch-next SKIP mọi story'), r.out)
  check('W2', 'không launch gì', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== W3 .wakii INVALID → skip file, không đoán ==')
{
  const fx = makeFixture('w3', '{ vỡ')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('W3', 'skip với lý do validator', /skip wi-9\.wakii — wakii-validate: (INVALID|KHÔNG-ĐỌC-ĐƯỢC)/.test(r.out), r.out)
  check('W3', 'không launch gì', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== W4 STORY-COMPLETE: mọi SF Done theo stub → derive ==')
{
  const fx = makeFixture('w4', wakiiDoc())
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, { STUB_STATE: 'Done' })
  check('W4', 'STORY-COMPLETE từ .wakii', r.out.includes('STORY-COMPLETE: WI-9'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== W5 story-status: story .wakii hiện registry ==')
{
  const fx = makeFixture('w5', wakiiDoc())
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = spawnSync('bash', [STATUS], {
    encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, HOME: fx.home, ORCA_BIN: stub, STUB_REPO: fx.repo, STUB_STATE: 'Todo', PYTHONUTF8: '1', REPO: fx.repo },
  })
  const out = (r.stdout || '') + (r.stderr || '')
  check('W5', 'header mới mindmaps + brackets', out.includes('STORIES (mindmaps/ + brackets/)'), out)
  check('W5', 'epic từ meta (WI-9)', out.includes('● WI-9'), out)
  check('W5', 'label mindmap + đích', out.includes('mindmap: wi-9.wakii · 2 SFs · đích: story/wi-9'), out)
  check('W5', 'states từ node linear (FI-901:Todo)', out.includes('FI-901:Todo'), out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  for (const f of failures) console.log('  FAIL: ' + f)
  process.exit(1)
}
