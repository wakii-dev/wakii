#!/usr/bin/env node
// story-checkpoint tests (SF-1 GH-26) — spawn python3 thật trên temp git repos
// (injectable qua STORY_CHECKPOINT_REPO/STORE/NOW), KHÔNG chạm store thật.
// Chạy: node tests/story-checkpoint-tests.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-checkpoint')

// Resolve python launcher: Windows spawnSync dính Store alias stub cho
// 'python3' (9009) → fallback 'python' rồi 'py'; macOS/Linux chỉ có 'python3'.
function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()

// Import helpers từ bin extensionless qua SourceFileLoader (cách SF-2/SF-3 sẽ dùng)
const helperScript = `
import importlib.util, importlib.machinery, json, sys
p = sys.argv[1]
loader = importlib.machinery.SourceFileLoader('story_checkpoint_mod', p)
spec = importlib.util.spec_from_loader('story_checkpoint_mod', loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)
req = json.loads(sys.argv[2])
out = getattr(mod, req["fn"])(*req.get("args", []))
print(json.dumps({"ok": True, "result": out}))
`
function callHelper(fnName, args, env = {}) {
  const c = spawnSync(PY, ['-c', helperScript, BIN, JSON.stringify({ fn: fnName, args })], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env },
  })
  if (c.status !== 0) throw new Error(`helper ${fnName} crash: ${c.stderr}`)
  const line = c.stdout.trim().split('\n').at(-1)
  return JSON.parse(line)
}

// ---- runner -----------------------------------------------------------------
let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempDir(tag) {
  return mkdtempSync(join(tmpdir(), `scp-${tag}-`))
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

function initRepo(dir, { brackets = false } = {}) {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'core.autocrlf', 'false') // CRLF checkout vs LF stash → pop conflict giả
  if (brackets) {
    mkdirSync(join(dir, 'docs/superpowers/brackets'), { recursive: true })
    writeFileSync(join(dir, 'docs/superpowers/brackets/gh26-fixture.md'), '# fixture\n')
  }
  writeFileSync(join(dir, 'f.txt'), 'v1a\nv1b\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return git(dir, 'rev-parse', 'HEAD').out
}

function recordOn(repo, payload, env = {}) {
  return spawnSync(PY, [BIN, 'record'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30000,
    cwd: repo,
    env: { ...process.env, ...env },
  })
}

const jsonl = (repo) => join(repo, '.wakii', 'checkpoints.jsonl')

// ---- fixtures ---------------------------------------------------------------
const repoA = tempDir('a')          // story repo (có brackets)
initRepo(repoA, { brackets: true })
const shaA0 = initSha(repoA)
const repoMeta = tempDir('m')       // meta repo (không brackets)
initRepo(repoMeta)
const repoNoGit = tempDir('n')      // không phải git repo
mkdirSync(repoNoGit, { recursive: true })

function initSha(repo) { return git(repo, 'rev-parse', 'HEAD').out }

const HOOK = (cmd, over = {}) => ({
  session_id: 'sess-A1',
  cwd: repoA,
  tool_name: 'Bash',
  tool_input: { command: cmd },
  ...over,
})
// HOOK với cwd của repo khác (record dùng payload.cwd để resolve store)
const HOOKAT = (repo, cmd, over = {}) => HOOK(cmd, { cwd: repo, ...over })

console.log(`== store resolve + record happy path ==`)
{
  const r = recordOn(repoA, HOOK('git commit -m "feature x"'))
  check('rec', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  check('rec', 'JSONL xuất hiện', existsSync(jsonl(repoA)))
  const lines = readFileSync(jsonl(repoA), 'utf8').trim().split('\n')
  check('rec', 'đúng 1 dòng', lines.length === 1, `got ${lines.length}`)
  const rec = JSON.parse(lines[0])
  check('rec', 'v=1', rec.v === 1)
  check('rec', 'session_id', rec.session_id === 'sess-A1')
  check('rec', 'repo = basename main checkout', rec.repo === repoA.split(/[\\/]/).pop())
  check('rec', 'commit = HEAD', rec.commit === shaA0)
  check('rec', 'branch main', rec.branch === 'main')
  check('rec', 'prompt_summary nguyên văn ≤500', rec.prompt_summary === 'git commit -m "feature x"')
  check('rec', 'ts ISO', !Number.isNaN(Date.parse(rec.ts)))
  check('rec', 'task_id/step null', rec.task_id === null && rec.step === null)
  check('rec', 'error_lines rỗng cho command sạch', rec.error_lines.length === 0)
  check('rec', '.wakii/.gitignore tự tạo', existsSync(join(repoA, '.wakii', '.gitignore')))
  check('rec', '.gitignore chặn mọi thứ trừ chính nó',
    readFileSync(join(repoA, '.wakii', '.gitignore'), 'utf8') === '*\n!.gitignore\n')
  // store gitignored: -uall chỉ còn .wakii/.gitignore (by design — un-ignore
  // chính nó để project commit 1 lần), checkpoints.jsonl KHÔNG bị liệt kê
  const st = git(repoA, 'status', '--porcelain', '--untracked-files=all').out
  check('rec', 'store gitignored — jsonl/lock không liệt kê',
    st.includes('.wakii/.gitignore') && !st.includes('checkpoints.jsonl') && !st.includes('errors.log'), st)
}

console.log(`\n== commit detection ==`)
{
  recordOn(repoA, HOOK('cd x && git commit -m compound'))
  recordOn(repoA, HOOK('git commit --dry-run -m "no"'))
  recordOn(repoA, HOOK('git status'))
  recordOn(repoA, HOOK('git add -A && git push')) // git nhưng không commit
  recordOn(repoA, HOOK('git commit -m "timeout error failed"', { session_id: 'sess-ERR' }))
  const lines = readFileSync(jsonl(repoA), 'utf8').trim().split('\n')
  check('det', 'compound khớp; dry-run/status/git-không-commit loại', lines.length === 3, `got ${lines.length}`)
  const rec2 = JSON.parse(lines[1])
  check('det', 'compound record đúng', rec2.prompt_summary === 'cd x && git commit -m compound')
  const recErr = JSON.parse(lines[2])
  check('det', 'error_lines giữ nguyên dòng khớp 12 từ khoá',
    recErr.error_lines.length === 1 && recErr.error_lines[0] === 'git commit -m "timeout error failed"',
    JSON.stringify(recErr.error_lines))
  // tool_name khác Bash → im lặng
  const before = readFileSync(jsonl(repoA), 'utf8').split('\n').length
  recordOn(repoA, HOOK('git commit -m "x"', { tool_name: 'Edit' }))
  check('det', 'tool_name != Bash → không ghi', readFileSync(jsonl(repoA), 'utf8').split('\n').length === before)
}

console.log(`\n== story-context filter ==`)
{
  const before = existsSync(jsonl(repoMeta)) ? readFileSync(jsonl(repoMeta), 'utf8') : ''
  const r = recordOn(repoMeta, HOOKAT(repoMeta, 'git commit -m "meta session"'))
  check('ctx', 'meta session exit 0', r.status === 0)
  check('ctx', 'meta session không tạo store', !existsSync(join(repoMeta, '.wakii')))
  // brackets tồn tại nhưng rỗng → vẫn meta
  const bDir = join(repoMeta, 'docs/superpowers/brackets')
  mkdirSync(bDir, { recursive: true })
  recordOn(repoMeta, HOOKAT(repoMeta, 'git commit -m "bracket rỗng"'))
  check('ctx', 'brackets rỗng → không ghi', (existsSync(jsonl(repoMeta)) ? readFileSync(jsonl(repoMeta), 'utf8') : '') === before)
  // brackets path là FILE (không dir) → coi như meta, skip im lặng
  const repoFile = tempDir('mf')
  initRepo(repoFile)
  mkdirSync(join(repoFile, 'docs/superpowers'), { recursive: true })
  writeFileSync(join(repoFile, 'docs/superpowers/brackets'), 'not a dir')
  const rf = recordOn(repoFile, HOOKAT(repoFile, 'git commit -m x'))
  check('ctx', 'brackets là file → exit 0 im lặng, không tạo store',
    rf.status === 0 && !existsSync(join(repoFile, '.wakii')))
  writeFileSync(join(bDir, 'gh26-x.md'), '# bracket')
  recordOn(repoMeta, HOOKAT(repoMeta, 'git commit -m "bracket có file"', { session_id: 'sess-META' }))
  check('ctx', 'bracket có ≥1 file → ghi', existsSync(jsonl(repoMeta)) && readFileSync(jsonl(repoMeta), 'utf8').includes('bracket có file'))
}

console.log(`\n== fail-open ==`)
{
  // không phải git repo, không env override → im lặng exit 0, không log
  const r = recordOn(repoNoGit, HOOKAT(repoNoGit, 'git commit -m x'))
  check('fail', 'không git → exit 0 im lặng', r.status === 0 && r.stdout === '' && r.stderr === '', `status=${r.status}`)
  // stdin hỏng → exit 0 + errors.log 1 dòng (store resolve qua env)
  const broken = spawnSync(PY, [BIN, 'record'], {
    input: '{oops', encoding: 'utf8', timeout: 30000,
    cwd: repoA, env: { ...process.env, STORY_CHECKPOINT_STORE: join(repoA, '.wakii') },
  })
  check('fail', 'stdin hỏng → exit 0', broken.status === 0)
  check('fail', 'errors.log có dòng JSON hỏng',
    readFileSync(join(repoA, '.wakii', 'errors.log'), 'utf8').trim().split('\n').filter(Boolean).length >= 1)
}

console.log(`\n== record với ORCA_* env + checkpoint ref ==`)
{
  writeFileSync(join(repoA, 'f2.txt'), 'x')
  git(repoA, 'add', '-A')
  git(repoA, 'commit', '-q', '-m', 'ref target')
  const sha = git(repoA, 'rev-parse', 'HEAD').out
  const r = recordOn(repoA, HOOK('git commit -m "ref"'), {
    ORCA_TASK_ID: 'T-42', ORCA_STEP: 'implement/store-dir',
  })
  check('env', 'exit 0', r.status === 0)
  const last = readFileSync(jsonl(repoA), 'utf8').trim().split('\n').at(-1)
  const rec = JSON.parse(last)
  check('env', 'task_id/step từ ORCA_*', rec.task_id === 'T-42' && rec.step === 'implement/store-dir', JSON.stringify({ t: rec.task_id, s: rec.step }))
  const refOut = git(repoA, 'rev-parse', 'refs/wakii/checkpoints/T-42/implement-store-dir')
  check('env', 'checkpoint ref tạo đúng sha', refOut.code === 0 && refOut.out === sha, refOut.err)
  // task_id có mà step rỗng → không tạo ref, record vẫn ghi
  const nBefore = readFileSync(jsonl(repoA), 'utf8').trim().split('\n').length
  recordOn(repoA, HOOK('git commit -m "ref2"'), { ORCA_TASK_ID: 'T-43' })
  const noRef = git(repoA, 'for-each-ref', 'refs/wakii/checkpoints/T-43', '--format=%(refname)')
  check('env', 'thiếu step → không ref nhưng record vẫn ghi',
    readFileSync(jsonl(repoA), 'utf8').trim().split('\n').length === nBefore + 1 && noRef.out === '')
}

console.log(`\n== record tiếng Việt (P1 review: utf-8 stdin + git subprocess decode) ==`)
{
  // repoA branch có dấu + command có dấu → stdin JSON + git() decode phải
  // giữ nguyên văn qua JSONL (không mojibake cp1252)
  git(repoA, 'checkout', '-q', '-b', 'nhánh-tiếng-việt')
  writeFileSync(join(repoA, 'vn.txt'), 'x\n')
  git(repoA, 'add', '-A')
  git(repoA, 'commit', '-q', '-m', 'vn commit')
  const sha = git(repoA, 'rev-parse', 'HEAD').out
  const r = recordOn(repoA, HOOK('git commit -m "thêm nhánh tiếng Việt"', { session_id: 'sess-VN' }))
  check('vn', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  const rec = JSON.parse(readFileSync(jsonl(repoA), 'utf8').trim().split('\n').at(-1))
  check('vn', 'prompt_summary nguyên văn có dấu', rec.prompt_summary === 'git commit -m "thêm nhánh tiếng Việt"', JSON.stringify(rec.prompt_summary))
  check('vn', 'branch nguyên văn có dấu (git() utf-8 decode)', rec.branch === 'nhánh-tiếng-việt', JSON.stringify(rec.branch))
  check('vn', 'commit đúng sha', rec.commit === sha)
  // query round-trip qua stdout utf-8
  const q = spawnSync(PY, [BIN, 'query', 'tiếng'], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, STORY_CHECKPOINT_REPO: repoA },
  })
  check('vn', 'query trả record + branch không mojibake',
    q.stdout.includes('thêm nhánh tiếng Việt') && q.stdout.includes('nhánh-tiếng-việt'), q.stdout.slice(0, 160))
  git(repoA, 'checkout', '-q', 'main')
}

console.log(`\n== query ==`)
{
  const q = (args) => spawnSync(PY, [BIN, 'query', ...args], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, STORY_CHECKPOINT_REPO: repoA },
  })
  let r = q(['FEATURE'])
  check('q', 'case-insensitive match', r.status === 0 && r.stdout.includes('feature x'), r.stdout.slice(0, 80))
  r = q(['feature x', '--last', '1'])
  check('q', '--last 1 giới hạn 1', r.stdout.trim().split('\n').at(-1).startsWith('-- 1 match'), r.stdout.slice(-60))
  r = q(['compound'])
  check('q', 'compound tìm được', r.stdout.includes('cd x && git commit -m compound'))
  r = q(['timeout', '--session', 'sess-ERR'])
  check('q', '--session lọc đúng', r.stdout.includes('-- 1 match'), r.stdout.slice(-60))
  r = q(['timeout', '--session', 'sess-KHAC'])
  check('q', 'session sai → 0 match', r.stdout.includes('-- 0 match'))
  r = q(['zqq-khong-co'])
  check('q', 'no match → 0', r.stdout.includes('-- 0 match'))
  // malformed + future-version skip
  const path = jsonl(repoA)
  const orig = readFileSync(path, 'utf8')
  writeFileSync(path, orig + '{broken\n' + JSON.stringify({ v: 2, ts: 'x' }) + '\n')
  r = q(['feature'])
  check('q', 'malformed skip + đếm, v>1 skip im lặng',
    r.stdout.includes('malformed skip: 1') && r.stdout.includes('future-version skip: 1'), r.stdout.slice(-80))
  writeFileSync(path, orig) // phục hồi
}

console.log(`\n== stats ==`)
{
  const r = spawnSync(PY, [BIN, 'stats'], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, STORY_CHECKPOINT_REPO: repoA },
  })
  check('st', 'exit 0', r.status === 0)
  check('st', 'in store path + records + sessions', r.stdout.includes('store:')
    && r.stdout.includes('records:') && r.stdout.includes('sessions:'))
  check('st', 'đếm theo session', r.stdout.includes('sess-A1:'))
}

console.log(`\n== concurrent append (2 processes ĐỒNG THỜI, Windows) ==`)
{
  const store = join(repoA, '.wakii')
  const before = readFileSync(jsonl(repoA), 'utf8').trim().split('\n').filter(Boolean).length
  const runRecord = (cmd) => new Promise((res) => {
    const p = spawn(PY, [BIN, 'record'], {
      cwd: repoA,
      env: { ...process.env },
    })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('close', (code) => res({ code, err }))
    p.stdin.write(JSON.stringify(HOOK(cmd)))
    p.stdin.end()
  })
  const [p1, p2] = await Promise.all([runRecord('git commit -m "concurrent 1"'), runRecord('git commit -m "concurrent 2"')])
  check('conc', 'cả 2 process exit 0', p1.code === 0 && p2.code === 0, `p1=${p1.code} p2=${p2.code} err=${p1.err}|${p2.err}`)
  const lines = readFileSync(jsonl(repoA), 'utf8').trim().split('\n').filter(Boolean)
  check('conc', 'cả 2 dòng đều ghi (không mất)', lines.length === before + 2, `before=${before} after=${lines.length}`)
  check('conc', 'mỗi dòng JSON hợp lệ (không dính nhau)',
    lines.every(l => { try { JSON.parse(l); return true } catch { return false } }))
  check('conc', 'lockfile dọn sạch', !existsSync(join(store, '.checkpoints.lock')))
}

console.log(`\n== restore: stash-untracked transaction ==`)
{
  const wt = tempDir('r') // worktree thứ 2 để restore an toàn (không phá repoA)
  const w = git(repoA, 'worktree', 'add', '-q', wt, '-b', 'wt-restore')
  if (w.code !== 0) throw new Error('worktree add fail: ' + w.err)
  // v2 đổi f.txt; local edit trên h.txt (file tracked từ v1, v2 không đụng) —
  // pop luôn sạch. (Edit cùng file restore lùi thì pop conflict KHẪN NGHIỆM cả
  // với git trần — case đó do pop-conflict test phía dưới phủ.)
  writeFileSync(join(wt, 'h.txt'), 'h-base\n')
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'add h')
  writeFileSync(join(wt, 'f.txt'), 'v2a\nv1b\n')
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'v2')
  const shaV2 = git(wt, 'rev-parse', 'HEAD').out
  writeFileSync(join(wt, 'h.txt'), 'h-local-edit\n') // edit tracked file ngoài vùng v2 đổi
  writeFileSync(join(wt, 'untracked-keep.txt'), 'untracked giữ đi giữ lại\n')
  const r = spawnSync(PY, [BIN, 'restore', shaV2 + '~1'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
  })
  check('rst', 'exit 0', r.status === 0, `err=${r.stderr}`)
  check('rst', 'code về sha cũ', git(wt, 'rev-parse', 'HEAD').out !== shaV2)
  check('rst', 'file untracked VẪN CÒN', existsSync(join(wt, 'untracked-keep.txt')))
  check('rst', 'local edit tracked-file ngoài vùng trả lại', readFileSync(join(wt, 'h.txt'), 'utf8') === 'h-local-edit\n')
  check('rst', 'stash dọn sạch', git(wt, 'stash', 'list').out === '')
  git(repoA, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
}

console.log(`\n== restore: giữ store .wakii (PF-1 — clean -fd không xoá store giữa giao dịch) ==`)
{
  const wt = tempDir('rs') // worktree có .wakii store riêng (kiểm cả env override)
  const w = git(repoA, 'worktree', 'add', '-q', wt, '-b', 'wt-store')
  if (w.code !== 0) throw new Error('worktree add fail: ' + w.err)
  // store .wakii trong wt với .gitignore self + data checkpoint + lesson
  mkdirSync(join(wt, '.wakii'), { recursive: true })
  writeFileSync(join(wt, '.wakii', '.gitignore'), '*\n!.gitignore\n')
  const storeData = '{"v":1,"ts":"2026-09-09T00:00:00Z"}\n'
  writeFileSync(join(wt, '.wakii', 'checkpoints.jsonl'), storeData)
  writeFileSync(join(wt, '.wakii', 'lessons.jsonl'), '{"v":1,"text":"giữ đi"}\n')
  // v2 đổi f.txt → restore lùi về v1
  writeFileSync(join(wt, 'f.txt'), 'v2-store\n')
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'v2-store')
  const shaV2 = git(wt, 'rev-parse', 'HEAD').out
  writeFileSync(join(wt, 'untracked-us.txt'), 'user file\n')
  const r = spawnSync(PY, [BIN, 'restore', shaV2 + '~1'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
    env: { ...process.env, STORY_CHECKPOINT_STORE: join(wt, '.wakii') },
  })
  check('rst2', 'exit 0', r.status === 0, `err=${r.stderr}`)
  check('rst2', 'store .wakii CÒN sau restore (PF-1 fix)', existsSync(join(wt, '.wakii', 'checkpoints.jsonl')),
    existsSync(join(wt, '.wakii')) ? 'dir còn, data mất' : 'dir mất')
  check('rst2', 'checkpoints.jsonl nguyên nội dung',
    existsSync(join(wt, '.wakii', 'checkpoints.jsonl')) && readFileSync(join(wt, '.wakii', 'checkpoints.jsonl'), 'utf8') === storeData)
  check('rst2', 'lessons.jsonl CÒN', existsSync(join(wt, '.wakii', 'lessons.jsonl')))
  check('rst2', '.wakii/.gitignore được stash pop trả lại', existsSync(join(wt, '.wakii', '.gitignore')))
  check('rst2', 'untracked user vẫn sống', existsSync(join(wt, 'untracked-us.txt')))
  git(wt, 'reset', '--hard', shaV2)
  git(repoA, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
}

console.log(`\n== restore: pop-conflict guarded ==`)
{
  const wt = tempDir('rc')
  git(repoA, 'worktree', 'add', '-q', wt, '-b', 'wt-conflict')
  writeFileSync(join(wt, 'f.txt'), 'v2-conflict\n')
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'v2c')
  const shaV2 = git(wt, 'rev-parse', 'HEAD').out
  // local edit f.txt → stash giữ nó; reset về cũ làm f.txt=v1; pop conflict vì v1 ≠ local edit
  writeFileSync(join(wt, 'f.txt'), 'local conflict edit\n')
  const r = spawnSync(PY, [BIN, 'restore', shaV2 + '~1'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
  })
  check('pop', 'exit 1', r.status === 1, `status=${r.status}`)
  check('pop', 'báo FAIL-Restore-incomplete', r.stdout.includes('FAIL-Restore-incomplete'))
  check('pop', 'stash còn nguyên (không drop)', git(wt, 'stash', 'list').out.includes('story-checkpoint auto'))
  check('pop', 'liệt kê conflict file', r.stdout.includes('f.txt'), r.stdout.slice(-200))
  git(wt, 'reset', '--hard', shaV2)
  git(wt, 'stash', 'drop')
  git(repoA, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
}

console.log(`\n== restore: sạch → bỏ pop (không pop nhầm stash cũ) + sha xấu ==`)
{
  const wt = tempDir('cl')
  git(repoA, 'worktree', 'add', '-q', wt, '-b', 'wt-clean')
  writeFileSync(join(wt, 'old.txt'), 'old stash\n')
  git(wt, 'add', '-A'); git(wt, 'commit', '-q', '-m', 'x')
  const shaHead = git(wt, 'rev-parse', 'HEAD').out
  // user có stash cũ từ TRƯỚC restore; tree hiện tại sạch
  writeFileSync(join(wt, 'old.txt'), 'modified\n')
  git(wt, 'stash', 'push', '-m', 'user old stash')
  const r = spawnSync(PY, [BIN, 'restore', shaHead + '~1'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
  })
  check('cln', 'exit 0', r.status === 0, r.stderr)
  check('cln', 'bỏ pop — stash cũ của user còn nguyên',
    git(wt, 'stash', 'list').out.includes('user old stash'))
  check('cln', 'HEAD về sha cũ', git(wt, 'rev-parse', 'HEAD').out !== shaHead)
  const bad = spawnSync(PY, [BIN, 'restore', 'deadbeef00'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
  })
  check('cln', 'sha không tồn tại → exit 1', bad.status === 1 && bad.stderr.includes('không phải commit'))
  git(wt, 'reset', '--hard', shaHead)
  git(wt, 'stash', 'drop')
  git(repoA, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
}

console.log(`\n== prune-refs ==`)
{
  const wt = tempDir('pr')
  git(repoA, 'worktree', 'add', '-q', wt, '-b', 'wt-prune')
  const base = git(wt, 'rev-parse', 'HEAD').out
  git(wt, 'update-ref', 'refs/wakii/checkpoints/T-a/step', base)
  git(wt, 'update-ref', 'refs/wakii/checkpoints/T-b/step', base)
  // refs T-42/T-43 từ case env cùng repo — đếm trước để expectation chính xác
  const preCount = git(wt, 'for-each-ref', 'refs/wakii/checkpoints', '--format=%(refname)').out
    .split('\n').filter(Boolean).length
  let r = spawnSync(PY, [BIN, 'prune-refs', '--older-than', '0s'], {
    encoding: 'utf8', timeout: 30000, cwd: wt,
  })
  check('pr', 'exit 0', r.status === 0, r.stderr)
  check('pr', '0s xoá hết mọi ref', r.stdout.includes(`xoá ${preCount} ref, giữ 0`), r.stdout)
  // ref cũ hơn 30d: commit rỗng với committerdate 2020
  const envOld = { ...process.env, GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z', GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z' }
  const c = spawnSync('git', ['-C', wt, 'commit', '-q', '--allow-empty', '-m', 'old'], { encoding: 'utf8', env: envOld })
  if (c.status !== 0) throw new Error('empty commit fail: ' + c.stderr)
  const oldCommit = git(wt, 'rev-parse', 'HEAD').out
  git(wt, 'update-ref', 'refs/wakii/checkpoints/T-old/step', oldCommit)
  git(wt, 'update-ref', 'refs/wakii/checkpoints/T-new/step', base)
  r = spawnSync(PY, [BIN, 'prune-refs'], { encoding: 'utf8', timeout: 30000, cwd: wt })
  check('pr', 'default 30d xoá ref 2020, giữ ref mới', r.stdout.includes('xoá 1 ref, giữ 1'), r.stdout)
  const bad = spawnSync(PY, [BIN, 'prune-refs', '--older-than', 'abc'], { encoding: 'utf8', timeout: 30000, cwd: wt })
  check('pr', 'duration sai → exit 2', bad.status === 2)
  git(repoA, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
}

console.log(`\n== shared helpers (module import — SF-2/SF-3 seam) ==`)
{
  const tmpFile = join(tempDir('h'), 'pack.md')
  const r1 = callHelper('write_atomic_with_stamp', [tmpFile, 'body line\n', 'sess-9 checkpoint tail'])
  check('sh', 'write_atomic_with_stamp trả ok', r1.ok)
  const content = readFileSync(tmpFile, 'utf8')
  check('sh', 'header stamp đúng format', content.startsWith('(generated-from: sess-9 checkpoint tail, at: ') && content.includes(')'), content.slice(0, 90))
  const r2 = callHelper('check_stamp', [tmpFile, 'sess-9 checkpoint tail'])
  check('sh', 'check_stamp cùng nguồn → không stale', r2.result === false)
  const r3 = callHelper('check_stamp', [tmpFile, 'nguồn-khác'])
  check('sh', 'check_stamp lệch nguồn → stale', r3.result === true)
  const r4 = callHelper('check_stamp', [join(tempDir('h2'), 'missing.md'), 'x'])
  check('sh', 'file vắng → stale', r4.result === true)
  const r5 = callHelper('extract_error_lines', ['line ok\nERROR: boom\nwarning timeout exceeded\nrejected: y'])
  check('sh', 'error-line helper giữ nguyên văn 12 từ khoá',
    JSON.stringify(r5.result) === JSON.stringify(['ERROR: boom', 'warning timeout exceeded', 'rejected: y']),
    JSON.stringify(r5.result))
  // append_line_locked fail-safe khi store không tạo được (path cha là FILE)
  const notADir = join(tempDir('h3'), 'file-blocker')
  writeFileSync(notADir, 'x')
  const r6 = callHelper('append_line_locked', [join(notADir, 'sub'), '{"v":1}\n'])
  check('sh', 'append fail (store bất khả) → false, không ném', r6.result === false)
}

console.log(`\n== module import không chạy main (SF-2 seam) ==`)
{
  const r = spawnSync(PY, ['-c', `
import importlib.util, importlib.machinery, sys
p = sys.argv[1]
loader = importlib.machinery.SourceFileLoader('m2', p)
spec = importlib.util.spec_from_loader('m2', loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
assert m.STAMP_PREFIX == "(generated-from: "
assert callable(m.extract_error_lines) and callable(m.write_atomic_with_stamp) and callable(m.check_stamp)
print("module-import-safe")
  `, BIN], { encoding: 'utf8', timeout: 30000 })
  check('imp', 'import không exit, helpers export đủ', r.stdout.includes('module-import-safe'), r.stderr)
}

console.log(`\n== HOME guard: record ngoài repo không đẻ rác vào HOME ==`)
{
  const homeWakii = join(process.env.HOME || process.env.USERPROFILE || '', '.wakii')
  const r = recordOn(repoNoGit, HOOKAT(repoNoGit, 'git commit -m x'))
  check('guard', 'exit 0 + ~/.wakii không xuất hiện', r.status === 0 && !existsSync(homeWakii))
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (store/detect/filter/fail-open/env+ref/query/stats/concurrent/restore/pop-conflict/clean-restore/prune/helpers/import/guard)')
