#!/usr/bin/env node
// story-mindmap --bootstrap round-trip tests (VU-14 SF-5 T7): fixture copy
// bracket kiểu VI-1 + context pack → --bootstrap → .wakii đủ 3 lớp khớp
// bracket → wakii-validate PASS. Không đụng VI-1 thật giữa run.
// Chạy: node tests/story-mindmap-bootstrap-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-mindmap')
const VALIDATE = resolve(testsDir, '../kit/bin/wakii-validate')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempRepo(tag) {
  const repo = mkdtempSync(join(tmpdir(), `bootstrap-${tag}-`))
  if (!repo.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  mkdirSync(join(repo, 'docs', 'superpowers', 'brackets'), { recursive: true })
  mkdirSync(join(repo, 'docs', 'superpowers', 'contexts'), { recursive: true })
  return repo
}

// Fixture bracket theo cấu trúc VI-1 (heading/Destination/Worktree model/SF
// Tier/linear/Depends on/Tasks) — dest tail = tên file .wakii mặc định.
function writeFixture(repo, { withModel = true, dest = 'story/vi-1-fixture' } = {}) {
  const lines = [
    '# Story: VI-1F — Fixture round-trip bootstrap',
    `Destination: ${dest}`,
    ...(withModel ? ['Worktree model: story-hub'] : []),
    '',
    '## SF-1 Lớp nền',
    'Tier: 0',
    'linear: FI-111',
    'Depends on: —',
    'Tasks: wiring / registry',
    '',
    '## SF-2 Lớp UI',
    'Tier: 1',
    'linear: FI-112',
    'Depends on: SF-1',
    ''
  ].join('\n')
  const bracketPath = join(repo, 'docs', 'superpowers', 'brackets', 'vi-1-fixture.md')
  writeFileSync(bracketPath, lines)
  // context pack cho SF-1 (Spec slice + Touch map) — layout contexts/<stem>/sf-N.md
  // (như vu-14 thật); SF-2 cố tình không có pack
  mkdirSync(join(repo, 'docs', 'superpowers', 'contexts', 'vi-1-fixture'), { recursive: true })
  writeFileSync(
    join(repo, 'docs', 'superpowers', 'contexts', 'vi-1-fixture', 'sf-1.md'),
    [
      '# VI-1F SF-1 pack',
      '',
      '## Spec slice',
      '1. Đọc bracket hiện tại trước khi sửa',
      '2. Áp dụng thay đổi trong scope cho phép',
      '',
      '## Touch map',
      '- Sở hữu: `src/main/example-wiring.ts` — đường wires chính',
      '- Read-only: `src/shared/example-types.ts` — chỉ đọc kiểu',
      ''
    ].join('\n')
  )
  return bracketPath
}

const NO_ORCA = process.execPath // node không in run-list JSON → fail-open rỗng

function runGenerate(repo, args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8', timeout: 60_000, cwd: repo,
    env: { ...process.env, STORY_ORCA_BIN: NO_ORCA, STORY_IMPACT_BIN: join(repo, 'no-impact'), PYTHONUTF8: '1' },
  })
}

function runValidate(repo, file) {
  return spawnSync(process.execPath, [VALIDATE, file], {
    encoding: 'utf8', timeout: 60_000, cwd: repo, env: { ...process.env, PYTHONUTF8: '1' },
  })
}

const stripGeneratedAt = (s) => s.replace(/"generatedAt": "[^"]*"/, '"generatedAt": ""')

// đọc an toàn — generation hỏng → null để suite báo FAIL thay vì crash giữa chừng
function readDoc(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

console.log('== B1 --bootstrap: mặc định ra docs/superpowers/mindmaps/<dest-tail>.wakii ==')
{
  const repo = tempRepo('b1')
  const bracket = writeFixture(repo)
  const r = runGenerate(repo, ['--bootstrap', bracket])
  const out = join(repo, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii')
  check('B1', 'exit 0', r.status === 0, `code=${r.status} ${r.stderr}`)
  check('B1', 'file .wakii ở mindmaps/', existsSync(out), r.stdout + r.stderr)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== B2 round-trip: .wakii qua wakii-validate PASS ==')
{
  const repo = tempRepo('b2')
  const bracket = writeFixture(repo)
  const out = join(repo, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii')
  runGenerate(repo, ['--bootstrap', bracket])
  const v = runValidate(repo, out)
  check('B2', 'wakii-validate exit 0', v.status === 0, `code=${v.status} ${v.stdout}${v.stderr}`)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== B3 đủ 3 lớp khớp bracket: structure + knowledge + progress ==')
{
  const repo = tempRepo('b3')
  const bracket = writeFixture(repo)
  const out = join(repo, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii')
  runGenerate(repo, ['--bootstrap', bracket])
  const doc = readDoc(out)
  const byId = new Map((doc?.nodes ?? []).map((n) => [n.id, n]))
  const edges = (rel, from) => (doc?.edges ?? []).filter((e) => e.rel === rel && (!from || e.from === from))
  // structure: epic + sf (title/tier/linear từ bracket)
  check('B3', 'epic title = heading story', byId.get('epic')?.title === 'VI-1F — Fixture round-trip bootstrap')
  check('B3', 'sf-1 title/tier/linear', byId.get('sf-1')?.title === 'Lớp nền' && byId.get('sf-1')?.tier === 0 && byId.get('sf-1')?.linear === 'FI-111')
  check('B3', 'sf-2 tier 1 + depends-on SF-1', byId.get('sf-2')?.tier === 1 && edges('depends-on', 'sf-2').some((e) => e.to === 'sf-1'))
  check('B3', 'contains epic→sf', edges('contains', 'epic').length === 2)
  // knowledge: steps từ Spec slice + files từ Touch map + tasks từ Tasks
  check('B3', 'step nodes từ pack (2)', [...byId.keys()].filter((id) => /^s-1\./.test(id)).length === 2)
  check('B3', 'step detail dẫn Spec slice', (byId.get('s-1.1')?.detail || '').includes('Spec slice'))
  check('B3', 'file node writes từ touch map', (doc?.nodes ?? []).some((n) => n.kind === 'file' && n.path === 'src/main/example-wiring.ts') && edges('writes', 'sf-1').length >= 1)
  check('B3', 'file node impacts từ read-only', edges('impacts', 'sf-1').length >= 1)
  check('B3', 'task nodes từ Tasks (2)', [...byId.keys()].filter((id) => /^t-1\./.test(id)).length === 2)
  check('B3', 'evidence trỏ pack', (doc?.evidence ?? []).some((e) => (e.ref || '').includes('vi-1-fixture') && (e.ref || '').includes('sf-1.md')))
  // progress: SF không có nguồn orchestration → pending GHI RÕ
  check('B3', 'sf state pending khi orca rỗng', byId.get('sf-1')?.state === 'pending')
  rmSync(repo, { recursive: true, force: true })
}

console.log('== B4 meta.worktreeModel optional: có dòng → có key, không dòng → không key ==')
{
  const repoA = tempRepo('b4a')
  const bracketA = writeFixture(repoA, { withModel: true })
  runGenerate(repoA, ['--bootstrap', bracketA])
  const docA = readDoc(join(repoA, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii'))
  check('B4', 'worktreeModel story-hub', docA?.meta?.worktreeModel === 'story-hub')

  const repoB = tempRepo('b4b')
  const bracketB = writeFixture(repoB, { withModel: false })
  runGenerate(repoB, ['--bootstrap', bracketB])
  const docB = readDoc(join(repoB, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii'))
  check('B4', 'không dòng → không key', !!docB && !('worktreeModel' in docB.meta))
  rmSync(repoA, { recursive: true, force: true })
  rmSync(repoB, { recursive: true, force: true })
}

console.log('== B5 alias: --bootstrap ≡ --bracket (payload trừ generatedAt byte-identical) ==')
{
  const repo = tempRepo('b5')
  const bracket = writeFixture(repo)
  runGenerate(repo, ['--bootstrap', bracket, '--out', join(repo, 'a.wakii')])
  runGenerate(repo, ['--bracket', bracket, '--out', join(repo, 'b.wakii')])
  let a = ''
  let b = ''
  try {
    a = stripGeneratedAt(readFileSync(join(repo, 'a.wakii'), 'utf8'))
    b = stripGeneratedAt(readFileSync(join(repo, 'b.wakii'), 'utf8'))
  } catch { /* file thiếu → assert false bên dưới */ }
  check('B5', 'payload giống nhau', a !== '' && a === b)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== B6 idempotent: chạy lại → unchanged ==')
{
  const repo = tempRepo('b6')
  const bracket = writeFixture(repo)
  runGenerate(repo, ['--bootstrap', bracket])
  const r2 = runGenerate(repo, ['--bootstrap', bracket])
  check('B6', 'in unchanged (idempotent)', (r2.stdout || '').includes('unchanged (idempotent)'), r2.stdout + r2.stderr)
  rmSync(repo, { recursive: true, force: true })
}

console.log('== B7 bracket CRLF (Windows): SF heading vẫn parse đủ ==')
{
  const repo = tempRepo('b7')
  const bracket = writeFixture(repo)
  writeFileSync(bracket, readFileSync(bracket, 'utf8').replace(/\n/g, '\r\n'))
  const out = join(repo, 'docs', 'superpowers', 'mindmaps', 'vi-1-fixture.wakii')
  const r = runGenerate(repo, ['--bootstrap', bracket])
  const doc = readDoc(out)
  const sfs = (doc?.nodes ?? []).filter((n) => n.kind === 'sf')
  check('B7', 'exit 0 + 2 SF từ CRLF', r.status === 0 && sfs.length === 2, `code=${r.status} sf=${sfs.length} ${r.stdout}${r.stderr}`)
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  for (const f of failures) console.log('  FAIL: ' + f)
  process.exit(1)
}
