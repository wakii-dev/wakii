#!/usr/bin/env node
// story-watchdog .wakii derive tests (VU-14 SF-5 T5) — dry-run launch-next trên
// fixture .wakii-only (fake HOME + ORCA_BIN stub; không đụng worktree/Linear thật).
// Phủ: launch-next SF rows từ nodes+edges · wakii-validate gate fail-closed ·
// STORY-COMPLETE derive · story-status registry .wakii · deps Done gate.
// LOCAL-5 sf-2: fixture = git repo THẬT (dest branch thật — P1-1) + scoping:
// đa-story SKIP fail-closed · --story dash-normalization · dest-absent SKIP ·
// --story CHỈ scope launch_next · single-story regression.
// Chạy: node tests/story-watchdog-wakii-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs'
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

function wakiiDoc({ story = 'WI-9 — Watchdog wakii fixture', epic = 'WI-9', dest = 'story/wi-9',
  linear1 = 'FI-901', linear2 = 'FI-902', sf1 = 'First WI', sf2 = 'Second WI', dep = true } = {}) {
  return JSON.stringify({
    wakiiMindmap: 1,
    meta: { story, epic, dest, generatedAt: '2026-09-28T00:00:00Z', generator: 'test' },
    nodes: [
      { id: 'epic', kind: 'epic', title: story },
      { id: 'sf-1', kind: 'sf', title: sf1, state: 'pending', linear: linear1 },
      { id: 'sf-2', kind: 'sf', title: sf2, state: 'pending', linear: linear2 }
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

// stub story-resume: --check → 1 dòng STALLED (state cũ khớp → không notify);
// mọi lời gọi ghi vào $RESUME_LOG — dùng để chứng minh --story KHÔNG scope resume
function makeResumeStub(dir) {
  const stub = join(dir, 'resume-stub.sh')
  writeFileSync(stub, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RESUME_LOG"
[ "$1" = "--check" ] && echo "sf-7-fake|STALLED|fake-stall"
exit 0
`)
  chmodSync(stub, 0o755)
  return stub
}

// git repo THẬT (P1-1): init + empty commit + dest branches thật
function gitInit(repo, dests = []) {
  const run = (args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    if (r.error || r.status !== 0) throw new Error(`git ${args.join(' ')} fail: ${r.stderr || r.error}`)
  }
  run(['init', '-q'])
  run(['-c', 'user.email=kit-test@example', '-c', 'user.name=kit-test', 'commit', '--allow-empty', '-m', 'init'])
  for (const d of dests) run(['branch', d])
}

// fixture: repo với mindmaps/*.wakii (tùy tên) + fake HOME; dests = branch thật
function makeRepo(tag, files, dests = [], git = true) {
  const dir = tempDir(tag)
  const home = join(dir, 'fakehome')
  const repo = join(home, 'orca', 'projects', 'proj-wi')
  mkdirSync(join(repo, 'docs', 'superpowers', 'mindmaps'), { recursive: true })
  mkdirSync(join(repo, 'docs', 'superpowers', 'brackets'), { recursive: true })
  for (const f of files) {
    const p = f.name.endsWith('.md')
      ? join(repo, 'docs', 'superpowers', 'brackets', f.name)
      : join(repo, 'docs', 'superpowers', 'mindmaps', f.name)
    writeFileSync(p, f.content)
  }
  if (git) gitInit(repo, dests)
  return { dir, home, repo }
}

// fixture 1 mindmap wi-9 (mặc định) — W1-W4; dest luôn tạo (git thật P1-1)
function makeFixture(tag, doc) {
  return makeRepo(tag, [{ name: 'wi-9.wakii', content: doc }], ['story/wi-9'])
}

// fixture đa-story: aa-one + bb-two (2 stems, 2 dest thật)
function makeMultiFixture(tag) {
  return makeRepo(tag, [
    { name: 'aa-one.wakii', content: wakiiDoc({ story: 'AA-1 — Fixture A', epic: 'AA-1', dest: 'story/aa-one',
      linear1: 'FI-911', linear2: 'FI-912', sf1: 'Alpha One', sf2: 'Alpha Two' }) },
    { name: 'bb-two.wakii', content: wakiiDoc({ story: 'BB-2 — Fixture B', epic: 'BB-2', dest: 'story/bb-two',
      linear1: 'FI-913', linear2: 'FI-914', sf1: 'Bravo Two', sf2: 'Bravo Too', dep: false }) }
  ], ['story/aa-one', 'story/bb-two'])
}

// fixture dash-normalization: fi-458-alpha + fi458-beta (2 stems tương đương khi bỏ dash)
function makeDashFixture(tag) {
  return makeRepo(tag, [
    { name: 'fi-458-alpha.wakii', content: wakiiDoc({ story: 'FI-458 — alpha', epic: 'FI-458', dest: 'story/fi-458-alpha',
      linear1: 'FI-921', linear2: 'FI-922', sf1: 'Alpha Dash', sf2: 'Alpha Dash 2' }) },
    { name: 'fi458-beta.wakii', content: wakiiDoc({ story: 'FI-458 — beta', epic: 'FI-458', dest: 'story/fi458-beta',
      linear1: 'FI-923', linear2: 'FI-924', sf1: 'Beta NoDash', sf2: 'Beta NoDash 2', dep: false }) }
  ], ['story/fi-458-alpha', 'story/fi458-beta'])
}

function runWatchdog(fx, stub, env = {}, args = ['--dry-run', '--launch-next']) {
  const r = spawnSync('bash', [BIN, ...args], {
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

console.log('== S1 đa-story không --story → SKIP toàn cục + warning, exit 0, 0 launch ==')
{
  const fx = makeMultiFixture('s1')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S1', 'SKIP + lý do repo đa-story', r.out.includes('SKIP') && r.out.includes('repo đa-story') && r.out.includes('chỉ định --story'), r.out)
  check('S1', 'liệt kê repo bị skip', r.out.includes('proj-wi'), r.out)
  check('S1', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S1', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S2 --story <slug> (sau --launch-next) → launch đúng story ==')
{
  const fx = makeMultiFixture('s2')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--dry-run', '--launch-next', '--story', 'bb-two'])
  check('S2', 'launch SF kế của bb-two', r.out.includes('SẴN SÀNG LAUNCH: sf-1-bravo-two (FI-913)'), r.out)
  check('S2', 'không launch story kia (aa)', !r.out.includes('FI-911'), r.out)
  check('S2', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S3 --story dash-normalization (trước --launch-next): full-stem khớp duy nhất ==')
{
  const fx = makeDashFixture('s3')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--story', 'fi-458-alpha', '--launch-next', '--dry-run'])
  check('S3', 'launch fi-458-alpha (slug gạch khớp file gạch)', r.out.includes('SẴN SÀNG LAUNCH: sf-1-alpha-dash (FI-921)'), r.out)
  check('S3', 'không launch fi458-beta', !r.out.includes('FI-923'), r.out)
  check('S3', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S4 --story không khớp mindmap nào → warn + exit 0, 0 launch ==')
{
  const fx = makeMultiFixture('s4')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--launch-next', '--dry-run', '--story', 'khong-ton-tai'])
  check('S4', 'warn không khớp', r.out.includes('không khớp'), r.out)
  check('S4', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S4', 'exit 0 (không phải lỗi)', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S5 --story fi-458 khớp 2 stem tương đương → mơ hồ, fail-closed, exit 0 ==')
{
  const fx = makeDashFixture('s5')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--launch-next', '--dry-run', '--story', 'fi-458'])
  check('S5', 'warn mơ hồ', r.out.includes('mơ hồ'), r.out)
  check('S5', 'không pick hộ — 0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S5', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S6 dest missing (local show-ref + ls-remote miss), không --story → SKIP (launch path chung) ==')
{
  const fx = makeRepo('s6', [{ name: 'wi-9.wakii', content: wakiiDoc() }], []) // không tạo dest branch
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S6', 'SKIP + dest không tồn tại', r.out.includes('SKIP') && r.out.includes('dest không tồn tại'), r.out)
  check('S6', 'chi tiết ls-remote trong log (phân biệt mạng hỏng vs missing)', r.out.includes('ls-remote:'), r.out)
  check('S6', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S6', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S7 dest missing + --story → vẫn SKIP (check chung, không phải chỉ unscoped) ==')
{
  const fx = makeRepo('s7', [{ name: 'wi-9.wakii', content: wakiiDoc() }], [])
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--launch-next', '--dry-run', '--story', 'wi-9'])
  check('S7', 'SKIP + dest không tồn tại', r.out.includes('dest không tồn tại'), r.out)
  check('S7', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S7', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S8 single-story + dest tồn tại, không --story → hành vi cũ nguyên vẹn (regression) ==')
{
  const fx = makeRepo('s8', [{ name: 'aa-one.wakii', content: wakiiDoc({ story: 'AA-1 — Fixture A', epic: 'AA-1',
    dest: 'story/aa-one', linear1: 'FI-911', linear2: 'FI-912', sf1: 'Alpha One', sf2: 'Alpha Two' }) }], ['story/aa-one'])
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S8', 'launch như cũ', r.out.includes('SẴN SÀNG LAUNCH: sf-1-alpha-one (FI-911)'), r.out)
  check('S8', 'đích đúng', r.out.includes('đích story/aa-one'), r.out)
  check('S8', 'không SKIP đa-story', !r.out.includes('repo đa-story'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S9 --story CHỈ scope launch_next — auto-resume vẫn toàn cục ==')
{
  const fx = makeMultiFixture('s9')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const resume = makeResumeStub(fx.dir)
  const stateFile = join(fx.dir, 'wd-state')
  writeFileSync(stateFile, 'sf-7-fake|STALLED|1\n') // state cũ khớp → không notify
  const r = runWatchdog(fx, stub, { STORY_RESUME_BIN: resume, STATE_FILE: stateFile, RESUME_LOG: join(fx.dir, 'resume.log') },
    ['--auto-resume', '--launch-next', '--dry-run', '--story', 'khong-ton-tai'])
  const log = (() => { try { return readFileSync(join(fx.dir, 'resume.log'), 'utf8') } catch { return '' } })()
  check('S9', 'auto-resume vẫn chạy (stub nhận --send)', log.includes('--send'), log)
  check('S9', 'launch-next vẫn warn 0-match', r.out.includes('không khớp'), r.out)
  check('S9', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S10 bracket legacy .md tính vào union story count (P2) ==')
{
  const fx = makeRepo('s10', [
    { name: 'cc-one.wakii', content: wakiiDoc({ story: 'CC-1 — Fixture C', epic: 'CC-1', dest: 'story/cc-one',
      linear1: 'FI-931', linear2: 'FI-932', sf1: 'Cc One', sf2: 'Cc Two' }) },
    { name: 'dd-two.md', content: '# Story: DD-2 — legacy bracket\nDestination: story/dd-two\n\n## SF-1 First\nlinear: FI-933\nDepends on: —\n' }
  ], ['story/cc-one'])
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S10', '1 mindmap + 1 bracket = đa-story → SKIP', r.out.includes('repo đa-story'), r.out)
  check('S10', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S11 mindmap + bracket CÙNG stem → dedupe per-repo = 1 story → không SKIP ==')
{
  const fx = makeRepo('s11', [
    { name: 'ee-one.wakii', content: wakiiDoc({ story: 'EE-1 — Fixture E', epic: 'EE-1', dest: 'story/ee-one',
      linear1: 'FI-941', linear2: 'FI-942', sf1: 'Ee One', sf2: 'Ee Two' }) },
    { name: 'ee-one.md', content: '# Story: EE-1 — legacy same-stem (không Destination → parser bỏ qua)\n\n## SF-1 X\nlinear: FI-943\n' }
  ], ['story/ee-one'])
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S11', 'dedupe → không SKIP đa-story', !r.out.includes('repo đa-story'), r.out)
  check('S11', 'launch từ mindmap (trước bracket)', r.out.includes('SẴN SÀNG LAUNCH: sf-1-ee-one (FI-941)'), r.out)
  check('S11', 'đúng 1 launch plan (bracket cùng story không nhân đôi)', (r.out.match(/SẴN SÀNG LAUNCH/g) || []).length === 1, r.out)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S12 repo không-git → dest_exists fail-closed SKIP (P2 review-1) ==')
{
  const fx = makeRepo('s12', [{ name: 'wi-9.wakii', content: wakiiDoc() }], [], false)
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub)
  check('S12', 'SKIP + dest không tồn tại', r.out.includes('dest không tồn tại'), r.out)
  check('S12', '0 launch', !r.out.includes('SẴN SÀNG LAUNCH'), r.out)
  check('S12', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log('== S13 --story không kèm --launch-next/--dry-run → warn, không silent no-op (P2 review-1) ==')
{
  const fx = makeMultiFixture('s13')
  const stub = makeOrcaStub(fx.dir, fx.repo)
  const r = runWatchdog(fx, stub, {}, ['--story', 'bb-two'])
  check('S13', 'warn --story bị bỏ qua', r.out.includes('bị bỏ qua'), r.out)
  check('S13', 'exit 0', r.code === 0, `code=${r.code}`)
  rmSync(fx.dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  for (const f of failures) console.log('  FAIL: ' + f)
  process.exit(1)
}
