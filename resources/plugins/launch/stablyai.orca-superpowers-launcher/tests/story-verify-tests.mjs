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
function pinKitConfig(home) {
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(join(home, '.claude', 'story-kit.json'), JSON.stringify({
    verify: { evidenceGate: true, realModeRule: true, reviewerChecklist: true, runtimeSmoke: false, tddMode: true },
    distributed: { enabled: false }
  }))
}

// 1 chuỗi path script sẽ derive ra: HOME forward-slash → bash glob + cygpath -m
// đều ổn; stub JSON dùng CÙNG chuỗi đó → match hoặc không là hành vi thật.
function runScenario(tag, buildWorktrees, { withBracket = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), `story-verify-${tag}-`))
  pinKitConfig(home)
  const wt = makeWorktree(home)
  if (!withBracket) {
    rmSync(join(wt, 'docs', 'superpowers', 'brackets'), { recursive: true, force: true })
  }
  const wtPath = wt.replaceAll('\\', '/')
  const worktrees = buildWorktrees(wtPath)
  const { stub, env } = makeOrcaStub(home, JSON.stringify({ result: { worktrees } }))
  const r = spawnSync('bash', [BIN, SF], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, HOME: wtPath.slice(0, wtPath.lastIndexOf('/orca/')) || home, ORCA_BIN: stub, STORY_KIT_CONFIG: join(home, '.claude', 'story-kit.json'), PYTHONUTF8: '1', ...env }
  })
  // Detail line = dòng 'code:' + 'dest:' duy nhất. KHÔNG filter theo SF: SF chỉ
  // lọt detail qua đường dẫn evidence trong note lỗi (coupling ngẫu nhiên — hết
  // khi evidence gate PASS).
  const line = (r.stdout || '').split('\n').find((l) => l.includes('code:') && l.includes('dest:')) || ''
  return { line, wtPath, home }
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

console.log(`\n== story-verify-tests: TOTAL ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log(failures.map((f) => `FAIL: ${f}`).join('\n'))
  process.exit(1)
}
