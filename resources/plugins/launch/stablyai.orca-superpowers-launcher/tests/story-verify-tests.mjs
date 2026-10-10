#!/usr/bin/env node
// story-verify tests — derive linear/dest qua ORCA_BIN stub + fixture worktree
// (fake HOME — không đụng worktree thật/Linear thật; tên SF "sf-91-hv" cố ý
// độc nhất để không trúng process/branch ngoài). Phủ metadata-first derive:
// (1) MSYS path normalize + linkedLinearIssue thắng bracket stale, (2) dest từ
// parent-worktree branch khi baseRef rỗng, (3) baseRef thắng parent,
// (4) bracket fallback nguyên vẹn khi không có metadata, (5) linear metadata
// không bị bracket clobber khi chỉ thiếu dest.
//
// Deterministic contract (LOCAL-2 SF-1): cùng kết quả trên mọi checkout tươi.
// - Stub orca chmod 755 — bin chỉ giữ ORCA_BIN khi executable, không thì fallback
//   sang orca thật của máy → metadata-first không chạy → FAIL tùy máy có orca.
// - Commit fixture ghim GIT_AUTHOR_DATE/GIT_COMMITTER_DATE → hash HEAD cố định
//   (hash commit phụ thuộc timestamp — nguyên nhân evidence "đòi hash mới mỗi
//   môi trường": các hash quan sát trước đây là các lần chạy, không phải HEAD).
// - Evidence sinh LÚC TEST CHẠY trong fake HOME: test-run.txt chứa hash HEAD
//   fixture + dòng tdd: → evidence gate của bin luôn thấy bằng chứng khớp.
// - STORY_KIT_CONFIG ghim trong fake HOME: gate matrix + distributed.enabled=0
//   không nhiễm từ máy chạy test (B4 local-only → không git fetch → không mạng).
// Chạy: node tests/story-verify-tests.mjs
// Refresh evidence/fixtures: tests/README-story-verify-refresh.md
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-verify')
const SF = 'sf-91-hv'

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

const GIT = (args, extraEnv) => spawnSync('git', args, { encoding: 'utf8', env: extraEnv ? { ...process.env, ...extraEnv } : process.env })

// Commit fixture tất định: content + identity + date cố định → hash HEAD như nhau
// trên mọi máy/lần chạy (hash git phụ thuộc timestamp committer/author).
const FIXED_DATE_ENV = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' }

// fixture worktree: git repo thật (WTS loop đòi rev-parse) + bracket STALE cố
// tình ghi linear/Destination khác metadata — derive đúng phải bỏ qua nó.
// Evidence gate (bin B1+) cần test-run.txt chứa hash HEAD + dòng tdd: — sinh
// ngay tại đây (runtime, fake HOME) nên luôn khớp HEAD vừa commit.
function makeWorktree(home) {
  const wt = join(home, 'orca', 'workspaces', 'ws1', SF)
  const bd = join(wt, 'docs', 'superpowers', 'brackets')
  mkdirSync(bd, { recursive: true })
  writeFileSync(join(bd, 'fi888-stale.md'), `# Story: FI-888 — stale fixture
Destination: story/stale-wrong

## SF-91 Stale fixture
Tier: 0
linear: FI-888
Depends on: —
What: bracket stale để chứng minh metadata-first thắng glob-first.
Tasks: task-a
`)
  GIT(['-C', wt, '-c', 'init.defaultBranch=main', 'init', '-q'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'])
  GIT(['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], FIXED_DATE_ENV)
  const head = (GIT(['-C', wt, 'rev-parse', '--short', 'HEAD']).stdout || '').trim()
  const ed = join(wt, 'docs', 'superpowers', 'evidence', SF)
  mkdirSync(ed, { recursive: true })
  writeFileSync(join(ed, 'test-run.txt'), `story-verify-tests fixture run\nHEAD ${head}\ntdd: RED→GREEN\n`)
  return wt
}

// stub orca: worktree list in STUB_WT_JSON; linear issue trả Done rỗng comments
// (B3/B5 verdict không phải đối tượng test ở đây — chỉ derive detail line).
// chmod 755 BẮT BUỘC: bin thay ORCA_BIN không-exec bằng orca thật của máy.
function makeOrcaStub(dir, wtJson) {
  const stub = join(dir, 'orca-stub.sh')
  writeFileSync(stub, `#!/usr/bin/env bash
case "\$1 \$2" in
  "worktree list") printf '%s' "\$STUB_WT_JSON" ;;
  "linear issue"*) printf '{"result":{"issue":{"state":{"name":"Done"}},"comments":{"nodes":[]}}}' ;;
  *) printf '{}' ;;
esac
`)
  chmodSync(stub, 0o755)
  return { stub, env: { STUB_WT_JSON: wtJson } }
}

function wtEntry(id, path, { linear = null, baseRef = '', parentId = null, branch = '' } = {}) {
  return {
    id,
    git: { path, branch: branch || 'refs/heads/wt-branch' },
    linkedLinearIssue: linear,
    baseRef,
    lineage: parentId ? { parentWorktreeId: parentId } : null
  }
}

// verify config ghim trong fake HOME — gate matrix đúng mặc định + distributed
// OFF (B4 không fetch) → hành vi bin không đổi theo máy chạy + không mạng.
// smoke: bật runtimeSmoke để cover smoke evidence fallback (P2 SF-3).
function pinKitConfig(home, { smoke = false } = {}) {
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(join(home, '.claude', 'story-kit.json'), JSON.stringify({
    verify: { evidenceGate: true, realModeRule: true, reviewerChecklist: true, runtimeSmoke: smoke, tddMode: true },
    distributed: { enabled: false }
  }))
}

// 1 chuỗi path script sẽ derive ra: HOME forward-slash → bash glob + cygpath -m
// đều ổn; stub JSON dùng CÙNG chuỗi đó → match hoặc không là hành vi thật.
// mindmaps: null = không có; else { "<file>.wakii": {story, epic, dest, linear} } —
// B3 scoping (SF-3) đòi fixture đa-mindmap theo tên (token `hv` từ sf-91-hv).
function runScenario(tag, buildWorktrees, { withBracket = true, mindmaps = null, smoke = false, jsonOut = false } = {}) {
  const home = mkdtempSync(join(tmpdir(), `story-verify-${tag}-`))
  pinKitConfig(home, { smoke })
  const wt = makeWorktree(home)
  if (!withBracket) {
    rmSync(join(wt, 'docs', 'superpowers', 'brackets'), { recursive: true, force: true })
  }
  if (mindmaps) {
    const md = join(wt, 'docs', 'superpowers', 'mindmaps')
    mkdirSync(md, { recursive: true })
    for (const [fname, spec] of Object.entries(mindmaps)) {
      writeFileSync(join(md, fname), JSON.stringify({
        wakiiMindmap: 1,
        meta: { story: spec.story, epic: spec.epic, dest: spec.dest,
          generatedAt: '2026-09-28T00:00:00Z', generator: 'test' },
        nodes: [
          { id: 'epic', kind: 'epic', title: spec.story },
          { id: 'sf-91', kind: 'sf', title: 'Wakii SF', state: 'pending', linear: spec.linear }
        ],
        edges: [{ from: 'epic', to: 'sf-91', rel: 'contains' }]
      }, null, 2))
    }
  }
  const wtPath = wt.replaceAll('\\', '/')
  const worktrees = buildWorktrees(wtPath)
  const { stub, env } = makeOrcaStub(home, JSON.stringify({ result: { worktrees } }))
  const r = spawnSync('bash', [BIN, SF, ...(jsonOut ? ['--json'] : [])], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, HOME: wtPath.slice(0, wtPath.lastIndexOf('/orca/')) || home, ORCA_BIN: stub, STORY_KIT_CONFIG: join(home, '.claude', 'story-kit.json'), PYTHONUTF8: '1', ...env }
  })
  // Detail line = dòng 'code:' + 'dest:' duy nhất. KHÔNG filter theo SF: SF chỉ
  // lọt detail qua đường dẫn evidence trong note lỗi (coupling ngẫu nhiên — hết
  // khi evidence gate PASS).
  const line = (r.stdout || '').split('\n').find((l) => l.includes('code:') && l.includes('dest:')) || ''
  return { line, wtPath, home, stdout: r.stdout || '' }
}

const PARENT_ID = 'wt-parent-x1'

// 1. Metadata linear thắng bracket stale + dest từ parent branch khi baseRef rỗng
{
  const { line, home } = runScenario('s1', (wtPath) => [
    wtEntry('wt-sf', wtPath, { linear: 'FI-999', parentId: PARENT_ID }),
    wtEntry(PARENT_ID, 'C:/elsewhere/parent-wt', { baseRef: 'x', branch: 'refs/heads/feature/parent-x' })
  ])
  check('S1', 'linear từ metadata thắng bracket stale', line.includes('review:FI-999'), line.trim())
  check('S1', 'dest từ parent-worktree branch khi baseRef rỗng', line.includes('dest:refs/heads/feature/parent-x'), line.trim())
  check('S1', 'evidence sinh runtime → gate pass, không warn', line !== '' && !line.includes('evidence'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 2. baseRef (metadata) thắng parent branch
{
  const { line, home } = runScenario('s2', (wtPath) => [
    wtEntry('wt-sf', wtPath, { linear: 'FI-999', baseRef: 'refs/heads/base-y', parentId: PARENT_ID }),
    wtEntry(PARENT_ID, 'C:/elsewhere/parent-wt', { baseRef: 'x', branch: 'refs/heads/feature/parent-x' })
  ])
  check('S2', 'baseRef metadata thắng parent branch', line.includes('dest:refs/heads/base-y'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 3. Không có metadata row cho wt → bracket fallback nguyên vẹn (FI-888/stale)
{
  const { line, home } = runScenario('s3', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ])
  check('S3', 'bracket fallback khi không có metadata', line.includes('review:FI-888') && line.includes('dest:story/stale-wrong'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 4. Metadata linear + không parent + không bracket → linear giữ, dest rỗng (?:)
{
  const { line, home } = runScenario('s4', (wtPath) => [wtEntry('wt-sf', wtPath, { linear: 'FI-999' })], { withBracket: false })
  check('S4', 'linear metadata không bị mất khi chỉ thiếu dest', line.includes('review:FI-999') && line.includes('dest:?'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 5. Không metadata + KHÔNG bracket + có .wakii khớp story token `hv` → derive
//    linear/dest từ node+meta (B3 scoping: mindmap phải khớp `hv-*` từ sf-91-hv)
{
  const { line, home } = runScenario('s5', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: { 'hv-wakii.wakii': { story: 'FI-777 — wakii derive fixture', epic: 'FI-777', dest: 'story/wakii-dest', linear: 'FI-777' } }
  })
  check('S5', 'linear từ node sf-91 (.wakii fallback khớp token)', line.includes('review:FI-777'), line.trim())
  check('S5', 'dest từ meta.dest', line.includes('dest:story/wakii-dest'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 6. Story-level derive đọc mindmap KHỚP story token (SF-91 Done theo stub → 1/1)
{
  const { stdout, home } = runScenario('s6', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: { 'hv-wakii.wakii': { story: 'FI-777 — wakii derive fixture', epic: 'FI-777', dest: 'story/wakii-dest', linear: 'FI-777' } }
  })
  check('S6', 'story-level derive 1/1 từ .wakii', stdout.includes('Linear derive: 1/1 SF Done'), stdout)
  rmSync(home, { recursive: true, force: true })
}

// 7. --json shape KHÔNG ĐỔI: [{sf, verdict, steps{code_tests,...}, detail}]
{
  const { stdout, home } = runScenario('s7', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: { 'hv-wakii.wakii': { story: 'FI-777 — wakii derive fixture', epic: 'FI-777', dest: 'story/wakii-dest', linear: 'FI-777' } },
    jsonOut: true
  })
  let arr = null
  try { arr = JSON.parse(stdout || '') } catch { /* để check */ }
  check('S7', '--json parse được (mảng)', Array.isArray(arr), stdout.slice(0, 200))
  const row = Array.isArray(arr) && arr[0]
  check('S7', 'row có sf + verdict', !!row && row.sf === SF && typeof row.verdict === 'string', JSON.stringify(row))
  const st = row && row.steps
  check('S7', 'steps đủ 7 khóa contract', !!st && ['code_tests', 'plan_ticked', 'surface_lint', 'review', 'merged', 'linear_done', 'runtime_smoke'].every(k => k in st), JSON.stringify(st))
  check('S7', 'detail derive từ .wakii', !!row && String(row.detail).includes('FI-777'), row && row.detail)
  rmSync(home, { recursive: true, force: true })
}

// 8. B3 scoping — 2 mindmaps alphabetical-xung-đột: story cũ (fi305, tên trước)
//    KHÔNG được chặn story local (hv-*, khớp token) — bệnh FI-305/local4-sf-3.
{
  const { line, stdout, home } = runScenario('s8', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: {
      'fi305-superpowers-android.wakii': { story: 'FI-305 — android story cũ', epic: 'FI-305', dest: 'story/fi305-wrong', linear: 'FI-305' },
      'hv-improve-kit.wakii': { story: 'HV-1 — story local', epic: 'HV-1', dest: 'story/hv-dest', linear: 'FI-777' }
    }
  })
  check('S8', 'resolve đúng story local (không glob-first alphabet)', line.includes('review:FI-777'), line.trim())
  check('S8', 'dest từ mindmap story local', line.includes('dest:story/hv-dest'), line.trim())
  check('S8', 'story cũ alphabetically-trước không nhiễm', !stdout.includes('FI-305'), stdout)
  rmSync(home, { recursive: true, force: true })
}

// 9. B3 0-match → UNKNOWN fail-open (giống linear-rỗng), KHÔNG FAIL; story cũ
//    trong mindmaps không được leak vào B3 lẫn story-level derive.
{
  const { line, stdout, home } = runScenario('s9', (wtPath) => [
    wtEntry('wt-sf', wtPath, { baseRef: 'refs/heads/base-y' })
  ], {
    withBracket: false,
    mindmaps: { 'fi305-superpowers-android.wakii': { story: 'FI-305 — android story cũ', epic: 'FI-305', dest: 'story/fi305-wrong', linear: 'FI-305' } }
  })
  check('S9', '0-match → linear rỗng (B3 UNKNOWN, không phán)', line.includes('review:?'), line.trim())
  check('S9', 'dest vẫn từ metadata (không mượn mindmap lạ)', line.includes('dest:refs/heads/base-y'), line.trim())
  check('S9', 'mindmap lạ không leak vào derive', !stdout.includes('FI-305'), stdout)
  rmSync(home, { recursive: true, force: true })
}

// 10. B3 >1-match (2 mindmaps cùng khớp token) → AMBIGUOUS fail-open, không chọn hộ
{
  const { line, stdout, home } = runScenario('s10', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: {
      'hv-a.wakii': { story: 'FI-800 — bản A', epic: 'FI-800', dest: 'story/hv-a', linear: 'FI-800' },
      'hv-b.wakii': { story: 'FI-801 — bản B', epic: 'FI-801', dest: 'story/hv-b', linear: 'FI-801' }
    }
  })
  check('S10', '>1-match → không phán (review:?)', line.includes('review:?'), line.trim())
  check('S10', 'không chọn hộ mindmap đầu alphabet', !stdout.includes('FI-800') && !stdout.includes('FI-801'), stdout)
  check('S10', 'detail có trace ambiguous (lỗi rõ, chỉ đếm không liệt kê tên)', /mindmap ambiguous: [0-9]+/.test(line), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 11. B3 exact-match thắng boundary-match (đúng token `hv` trước `hv-*`)
{
  const { line, home } = runScenario('s11', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], {
    withBracket: false,
    mindmaps: {
      'hv.wakii': { story: 'FI-100 — exact', epic: 'FI-100', dest: 'story/hv-exact', linear: 'FI-100' },
      'hv-x.wakii': { story: 'FI-200 — boundary', epic: 'FI-200', dest: 'story/hv-x', linear: 'FI-200' }
    }
  })
  check('S11', 'exact <stem>.wakii thắng boundary <token>-*', line.includes('review:FI-100') && line.includes('dest:story/hv-exact'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 12. B1 evidence — fixture-pin chính sách: primary = thư mục TÊN WORKTREE ĐẦY ĐỦ;
//     decoy slug (`sf-91+decoy`, hash cũ) không được thắng khi primary tồn tại (P1-5)
{
  const { line, home } = runScenario('s12', () => [
    wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })
  ], { withBracket: false, mindmaps: null })
  check('S12', 'evidence full-worktree-name → gate PASS, không warn', line !== '' && !line.includes('evidence thiếu'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 13. B1 fallback neo biên: `sf-91-*` khớp slug dir, KHÔNG khớp `sf-910-*`/`sf-91+*`
//     (glob `sf-91*` cũ bắt nhầm decoy — 2 decoy vì `ls` sort theo collation locale:
//     byte-order '+' thắng, en_US bỏ-punctuation 'sf-910' thắng → cũ FAIL ảo chắc chắn)
{
  const { line, home } = runScenario('s13', (wtPath) => {
    const head = (GIT(['-C', wtPath, 'rev-parse', '--short', 'HEAD']).stdout || '').trim()
    const ed = join(wtPath, 'docs', 'superpowers', 'evidence')
    rmSync(join(ed, SF), { recursive: true, force: true }) // bỏ primary — đi qua fallback
    for (const d of ['sf-91+stale', 'sf-910-stale']) {
      mkdirSync(join(ed, d), { recursive: true }) // decoy: glob cũ `sf-91*` match, glob mới loại
      writeFileSync(join(ed, d, 'test-run.txt'), `stale\nHEAD 0000000\n`)
    }
    mkdirSync(join(ed, 'sf-91-real'), { recursive: true }) // slug convention thật (sf-<n>-<slug>)
    writeFileSync(join(ed, 'sf-91-real', 'test-run.txt'), `run\nHEAD ${head}\ntdd: RED→GREEN\n`)
    return [wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })]
  })
  check('S13', 'fallback `sf-<n>-*` lấy đúng slug dir (decoy bị neo biên loại)', line !== '' && !line.includes('evidence thiếu') && !line.includes('thiếu dòng'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 14. Evidence thiếu hẳn → FAIL RÕ (chính sách: thiếu = FAIL, không âm thầm PASS)
{
  const { line, stdout, home } = runScenario('s14', (wtPath) => {
    rmSync(join(wtPath, 'docs', 'superpowers', 'evidence', SF), { recursive: true, force: true })
    return [wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })]
  })
  check('S14', 'thiếu evidence → B1 FAIL (row) + note rõ (detail)', stdout.includes('B1:FAIL') && line.includes('evidence thiếu'), line.trim())
  rmSync(home, { recursive: true, force: true })
}

// 15. Smoke fallback (P2) — cùng luật neo biên: slug dir `sf-91-smoke` thắng,
//     decoy (glob cũ match, mới loại) không được chọn
{
  const { stdout, home } = runScenario('s15', (wtPath) => {
    const head = (GIT(['-C', wtPath, 'rev-parse', '--short', 'HEAD']).stdout || '').trim()
    const ed = join(wtPath, 'docs', 'superpowers', 'evidence')
    for (const d of ['sf-91+stale', 'sf-910-stale']) {
      mkdirSync(join(ed, d), { recursive: true })
      writeFileSync(join(ed, d, 'smoke.txt'), `stale\nHEAD 0000000\n`)
    }
    mkdirSync(join(ed, 'sf-91-smoke'), { recursive: true })
    writeFileSync(join(ed, 'sf-91-smoke', 'smoke.txt'), `smoke ok\nHEAD ${head}\n`)
    return [wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })]
  }, { smoke: true })
  check('S15', 'smoke fallback neo biên → Smoke:PASS', stdout.includes('Smoke:PASS'), stdout)
  rmSync(home, { recursive: true, force: true })
}

// 15b. Smoke chỉ có evidence ngoài biên (`sf-910-*`) → glob mới KHÔNG match →
//      Smoke:FAIL rõ (glob cũ match decoy → grep hash-rỗng pass ảo → test này RED)
{
  const { stdout, home } = runScenario('s15b', (wtPath) => {
    const ed = join(wtPath, 'docs', 'superpowers', 'evidence')
    mkdirSync(join(ed, 'sf-910-stale'), { recursive: true })
    writeFileSync(join(ed, 'sf-910-stale', 'smoke.txt'), `stale\nHEAD 0000000\n`)
    return [wtEntry('wt-other', 'C:/elsewhere/unrelated', { linear: 'FI-1', baseRef: 'refs/heads/o' })]
  }, { smoke: true })
  check('S15b', 'smoke ngoài biên → không match, FAIL rõ', stdout.includes('Smoke:FAIL') && stdout.includes('smoke evidence thiếu'), stdout)
  rmSync(home, { recursive: true, force: true })
}

console.log(`\n== story-verify-tests: TOTAL ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log(failures.map((f) => `FAIL: ${f}`).join('\n'))
  process.exit(1)
}
