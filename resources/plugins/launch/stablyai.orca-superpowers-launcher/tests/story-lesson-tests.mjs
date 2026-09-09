#!/usr/bin/env node
// story-lesson tests (SF-3 GH-26) — spawn python3 thật trên temp git repos
// (injectable qua STORY_CHECKPOINT_REPO/STORE/NOW), KHÔNG chạm store thật.
// Chạy: node tests/story-lesson-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-lesson')
const CP_BIN = resolve(testsDir, '../kit/bin/story-checkpoint')
const HOOK_STOP = resolve(testsDir, '../kit/bin/hook-stop')

function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()
const BASH = 'bash'

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempDir(tag) {
  return mkdtempSync(join(tmpdir(), `sles-${tag}-`))
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  writeFileSync(join(dir, 'f.txt'), 'v1\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return git(dir, 'rev-parse', 'HEAD').out
}

function lesson(args, { repo, env = {}, input = '' } = {}) {
  return spawnSync(PY, [BIN, ...args], {
    input, encoding: 'utf8', timeout: 30000, cwd: repo || process.cwd(),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: 'sess-L1',
      STORY_LESSON_CHECKPOINT_BIN: CP_BIN,
      ...(repo ? { STORY_CHECKPOINT_REPO: repo } : {}),
      ...env,
    },
  })
}

const lessonsPath = (repo) => join(repo, '.wakii', 'lessons.jsonl')
const readLessons = (repo) => readFileSync(lessonsPath(repo), 'utf8')

console.log(`== add: happy path — schema + stamp (SC5) ==`)
const repoA = tempDir('a')
const shaA0 = initRepo(repoA)
{
  const r = lesson(['add', 'pattern DSH: nhắc kết quả cũ thay vì re-run grep', '--source', 'session', '--tags', 'gh26,sf3'], { repo: repoA })
  check('add', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  check('add', 'file tạo', existsSync(lessonsPath(repoA)))
  const text = readLessons(repoA)
  const lines = text.trim().split('\n')
  check('add', 'đúng 2 dòng: stamp header + 1 record', lines.length === 2, `got ${lines.length}`)
  check('add', 'stamp header đúng nguồn (HEAD main checkout)',
    lines[0].startsWith('(generated-from: ') && lines[0].includes(shaA0), lines[0].slice(0, 90))
  const rec = JSON.parse(lines[1])
  check('add', 'v=1', rec.v === 1)
  check('add', 'ts ISO parse được', !Number.isNaN(Date.parse(rec.ts)))
  check('add', 'date = ngày của ts', rec.date === rec.ts.slice(0, 10))
  check('add', 'session_id từ CLAUDE_SESSION_ID', rec.session_id === 'sess-L1')
  check('add', 'source session', rec.source === 'session')
  check('add', 'ref null khi không truyền', rec.ref === null)
  check('add', 'tags tách phẩy', JSON.stringify(rec.tags) === '["gh26","sf3"]', JSON.stringify(rec.tags))
  check('add', 'text nguyên văn tiếng Việt', rec.text === 'pattern DSH: nhắc kết quả cũ thay vì re-run grep')
}

console.log(`\n== add: validation — text rỗng/ >1000, source enum, exit code ==`)
{
  const before = readLessons(repoA)
  let r = lesson(['add', '   ', '--source', 'session'], { repo: repoA })
  check('val', 'text rỗng → exit 2', r.status === 2, `status=${r.status}`)
  r = lesson(['add', 'x'.repeat(1001), '--source', 'session'], { repo: repoA })
  check('val', 'text 1001 chars → exit 2', r.status === 2)
  r = lesson(['add', 'đúng 1000 biên trên được chấp nhận: ' + 'y'.repeat(964), '--source', 'session'], { repo: repoA })
  check('val', 'text đúng 1000 chars → exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  r = lesson(['add', 't', '--source', 'wiki'], { repo: repoA })
  check('val', 'source ngoài enum → exit 2', r.status === 2)
  r = lesson(['add', 't'], { repo: repoA })
  check('val', 'thiếu --source → exit 2 (argparse required)', r.status === 2)
  // 1000-char lesson + 2 validation-fail KHÔNG ghi thêm dòng nào ngoài 1
  const lines = readLessons(repoA).trim().split('\n')
  check('val', 'validate-fail không ghi dòng', lines.length === 3, `got ${lines.length}`) // stamp + lesson1 + lesson1000
  check('val', 'lesson 1000 chars ghi đúng', JSON.parse(lines.at(-1)).text.length === 1000, `len=${JSON.parse(lines.at(-1)).text.length}`)
  check('val', 'không dòng nào hỏng', before.includes('pattern DSH'))
}

console.log(`\n== add: session_id fallback + ref + stamp regen khi thêm lần 2 (SC5 atomic) ==`)
{
  const r = lesson(['add', 'l2', '--source', 'issue', '--ref', 'GH-26', '--tags', ' a , b , '], {
    repo: repoA, env: { CLAUDE_SESSION_ID: '' },
  })
  check('regen', 'exit 0', r.status === 0, r.stderr)
  const rec = JSON.parse(readLessons(repoA).trim().split('\n').at(-1))
  check('regen', 'session_id fallback null', rec.session_id === null)
  check('regen', 'ref ghi đúng', rec.ref === 'GH-26')
  check('regen', 'tags trim + bỏ rỗng', JSON.stringify(rec.tags) === '["a","b"]', JSON.stringify(rec.tags))
  const lines = readLessons(repoA).trim().split('\n')
  check('regen', 'vẫn đúng 1 stamp header (regen thay vì nối đè)', lines.filter(l => l.startsWith('(generated-from: ')).length === 1)
}

console.log(`\n== add: legacy lessons không stamp (SF-2 fixture cũ) → migrate trên lần add đầu ==`)
{
  const repoL = tempDir('l')
  initRepo(repoL)
  mkdirSync(join(repoL, '.wakii'), { recursive: true })
  writeFileSync(lessonsPath(repoL), '{"text":"legacy","source":"session","ref":"s1"}\n')
  const r = lesson(['add', 'mới', '--source', 'session'], { repo: repoL })
  check('mig', 'exit 0', r.status === 0, r.stderr)
  const lines = readLessons(repoL).trim().split('\n')
  check('mig', 'stamp thêm đầu + 2 record giữ nguyên legacy', lines.length === 3 && lines[0].startsWith('(generated-from: '))
  check('mig', 'legacy text không mất', readLessons(repoL).includes('"legacy"'))
}

console.log(`\n== add: không git → stamp no-git, vẫn ghi (lệnh tay không chết) ==`)
{
  const noGit = tempDir('ng')
  mkdirSync(noGit, { recursive: true })
  const r = lesson(['add', 'ngoài git', '--source', 'commit', '--ref', 'abc1234'], {
    repo: noGit, // STORY_CHECKPOINT_REPO trỏ dir không git → stamp no-git
    env: { STORY_CHECKPOINT_STORE: join(noGit, '.wakii') },
  })
  check('nogit', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  const text = readFileSync(lessonsPath(noGit), 'utf8')
  check('nogit', 'stamp no-git', text.startsWith('(generated-from: no-git, at: '), text.slice(0, 60))
  check('nogit', 'record đầy đủ', JSON.parse(text.trim().split('\n')[1]).source === 'commit')
}

console.log(`\n== list: recency desc + --match case-insensitive trên text + tags ==`)
{
  let r = lesson(['list'], { repo: repoA })
  check('list', 'exit 0', r.status === 0)
  const out = r.stdout
  check('list', 'mới nhất trước (mới ở dòng đầu)', out.indexOf('l2') < out.indexOf('pattern DSH'), out)
  check('list', 'footer đếm', out.includes('-- 3/3 lessons'), out.slice(-40))
  r = lesson(['list', '--match', 'dsh'], { repo: repoA })
  check('list', 'match case-insensitive trên text', r.stdout.includes('pattern DSH') && r.stdout.includes('-- 1/3 lessons'), r.stdout.slice(-40))
  r = lesson(['list', '--match', 'GH26'], { repo: repoA })
  check('list', 'match case-insensitive trên tags', r.stdout.includes('pattern DSH'), r.stdout)
  r = lesson(['list', '--match', 'zqq-khong-co'], { repo: repoA })
  check('list', 'no match → 0', r.stdout.includes('-- 0/3 lessons'))
  // malformed + future skip
  writeFileSync(lessonsPath(repoA), readLessons(repoA) + '{broken\n' + JSON.stringify({ v: 2, text: 'tương lai' }) + '\n')
  r = lesson(['list'], { repo: repoA })
  check('list', 'malformed skip + đếm, v>1 skip im lặng',
    r.stdout.includes('malformed skip: 1') && r.stdout.includes('future-version skip: 1') && !r.stdout.includes('tương lai'), r.stdout.slice(-80))
  // stamp header không hiện trong list
  check('list', 'stamp header không lọt output', !r.stdout.includes('generated-from'))
}

console.log(`\n== stop-audit: đếm lessons theo session_id (hook path, fail-open) ==`)
{
  // session sess-AU có đúng 1 lesson (l2 là session null) — thêm 1 nữa cho ≥2
  lesson(['add', 'au-1', '--source', 'session', '--tags', ''], { repo: repoA, env: { CLAUDE_SESSION_ID: 'sess-AU' } })
  lesson(['add', 'au-2', '--source', 'session', '--tags', ''], { repo: repoA, env: { CLAUDE_SESSION_ID: 'sess-AU' } })
  const errLog = join(repoA, '.wakii', 'errors.log')
  const countLines = () => existsSync(errLog) ? readFileSync(errLog, 'utf8').trim().split('\n').filter(Boolean).length : 0

  let before = countLines()
  let r = lesson(['stop-audit'], { repo: repoA, input: JSON.stringify({ session_id: 'sess-AU', source: 'stop' }) })
  check('aud', 'exit 0', r.status === 0)
  check('aud', 'stdout rỗng (Stop không vào context)', r.stdout.trim() === '', JSON.stringify(r.stdout.slice(0, 60)))
  let after = countLines()
  check('aud', '≥1 lesson → +1 dòng audit', after === before + 1, `before=${before} after=${after}`)
  const lastLine = existsSync(errLog) ? readFileSync(errLog, 'utf8').trim().split('\n').at(-1) : ''
  check('aud', 'format stop-audit: session <id> — N lessons',
    lastLine.includes('stop-audit: session sess-AU —'), lastLine)
  const auCount = readLessons(repoA).trim().split('\n')
    .filter(l => { try { return JSON.parse(l).session_id === 'sess-AU' } catch { return false } }).length
  check('aud', 'đếm đúng N lessons của session', lastLine.includes(`— ${auCount} lessons`) && auCount >= 2, `file-count=${auCount}`)

  before = countLines()
  r = lesson(['stop-audit'], { repo: repoA, input: JSON.stringify({ session_id: 'sess-KHONG-LESSON' }) })
  check('aud', '0 lesson → exit 0 im lặng', r.status === 0 && countLines() === before)

  before = countLines()
  r = lesson(['stop-audit'], { repo: repoA, input: 'stdin hỏng không json' })
  check('aud', 'stdin hỏng → exit 0 im lặng', r.status === 0 && countLines() === before)

  before = countLines()
  r = lesson(['stop-audit'], { repo: repoA, input: '{"no-session-field":true}' })
  check('aud', 'thiếu session_id → im lặng', r.status === 0 && countLines() === before)
}

console.log(`\n== stop-audit: store vắng + helper module vắng → im lặng exit 0 ==`)
{
  const repoEmpty = tempDir('e')
  initRepo(repoEmpty)
  const r1 = lesson(['stop-audit'], { repo: repoEmpty, input: JSON.stringify({ session_id: 'x' }) })
  check('aud2', 'store vắng → exit 0, stdout rỗng', r1.status === 0 && r1.stdout.trim() === '')
  // helper module vắng (trỏ bin không tồn tại) → không crash
  const r2 = lesson(['stop-audit'], {
    repo: repoEmpty, input: JSON.stringify({ session_id: 'x' }),
    env: { STORY_LESSON_CHECKPOINT_BIN: join(tempDir('missing'), 'story-checkpoint') },
  })
  check('aud2', 'helper vắng → exit 0 im lặng', r2.status === 0 && r2.stdout.trim() === '', `status=${r2.status}`)
  // add loud-fail khi helper vắng (lệnh tay phải biết lỗi)
  const r3 = lesson(['add', 't', '--source', 'session'], {
    repo: repoEmpty, env: { STORY_LESSON_CHECKPOINT_BIN: join(tempDir('missing'), 'story-checkpoint') },
  })
  check('aud2', 'add helper vắng → exit 1 LOUD (lệnh tay)', r3.status === 1 && r3.stderr.includes('FAIL'), `status=${r3.status}`)
}

console.log(`\n== hook-stop wrapper: logic bên trong — GHỬ VÀO story-lesson-tests SAU task hook-stop (SF-3); wrapper no-op SF-2 vẫn pass ==`)
{
  const repoW = tempDir('w')
  initRepo(repoW)
  const wrap = (payload, env = {}) => spawnSync(BASH, [HOOK_STOP], {
    input: payload, encoding: 'utf8', timeout: 30000, cwd: repoW,
    env: { ...process.env, ...env },
  })
  let r = wrap('x'.repeat(100000))
  check('wrap', 'wrapper no-op (SF-2) stdin lớn → exit 0', r.status === 0)
  r = wrap(JSON.stringify({ session_id: 'x' }))
  check('wrap', 'wrapper no-op stdin JSON → exit 0 im lặng', r.status === 0 && (r.stdout || '').trim() === '')
}

console.log(`\n== module import không chạy main (seam cho test khác) ==`)
{
  const r = spawnSync(PY, ['-c', `
import importlib.util, importlib.machinery, sys
loader = importlib.machinery.SourceFileLoader('m3', sys.argv[1])
spec = importlib.util.spec_from_loader('m3', loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
assert m.SOURCES == ("session", "issue", "commit") and m.MAX_TEXT == 1000
recs, mal, fut = m.read_lessons(sys.argv[2])
print("import-safe", len(recs), mal, fut)
  `, BIN, repoA], { encoding: 'utf8', timeout: 30000 })
  check('imp', 'import + read_lessons chạy được', r.stdout.startsWith('import-safe'), r.stderr)
}

// ---- cleanup ----------------------------------------------------------------
for (const d of [repoA]) rmSync(d, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (add/val/regen/migrate/nogit/list/audit/aud2/wrap/imp)')
