#!/usr/bin/env node
// QA failure-paths (SF-3 GH-26) — mọi đường fail phải xử lý đúng:
//   1. stale-stamp: lessons.jsonl lệch HEAD → fact-pack báo ⚠ stale, KHÔNG dùng
//   2. pop-conflict: restore có conflict → FAIL-Restore-incomplete + stash CÒN
//   3. hook fail-open: xoá bin / xoá store / xoá hooks — agent vẫn chạy exit 0
//   4. meta session (không brackets): record + stop-audit KHÔNG ghi
// Chạy: node tests/qa-failure-paths.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin')
const CP = join(BIN, 'story-checkpoint')
const LESSON = join(BIN, 'story-lesson')
const HOOK_POST = join(BIN, 'hook-post-tool-use')
const HOOK_SESSION = join(BIN, 'hook-session-start')
const HOOK_STOP = join(BIN, 'hook-stop')

function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()
const BASH = 'bash'

let pass = 0, fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

function initStoryRepo(tag, { brackets = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `qa-fail-${tag}-`))
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'qa@t')
  git(dir, 'config', 'user.name', 'qa')
  git(dir, 'config', 'core.autocrlf', 'false')
  if (brackets) {
    mkdirSync(join(dir, 'docs/superpowers/brackets'), { recursive: true })
    writeFileSync(join(dir, 'docs/superpowers/brackets/gh26-qa-fail.md'), '# Story: QA failure fixture\n')
  }
  writeFileSync(join(dir, 'app.txt'), 'v1\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

const baseEnv = (repo) => ({
  ...process.env,
  STORY_CHECKPOINT_BIN: CP,
  STORY_LESSON_BIN: LESSON,
  STORY_LESSON_CHECKPOINT_BIN: CP,
  STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack'),
  STORY_FACT_PACK_CHECKPOINT_BIN: CP,
  STORY_CHECKPOINT_REPO: repo,
  STORY_FACT_PACK_CWD: repo,
})

// =====================================================================
console.log(`== F1. stale-stamp — consumer báo stale thay vì dùng im lặng ==`)
{
  const repo = initStoryRepo('stale')
  const store = join(repo, '.wakii')
  mkdirSync(store, { recursive: true })
  const head1 = git(repo, 'rev-parse', 'HEAD').out
  // lesson đóng stamp theo HEAD1; sau đó HEAD advance → stamp thành stale
  writeFileSync(join(store, 'lessons.jsonl'),
    `(generated-from: ${head1}, at: 2026-09-09T00:00:00Z)\n{"v":1,"ts":"2026-09-09T00:00:00Z","date":"2026-09-09","session_id":"s","source":"session","ref":null,"tags":[],"text":"bài học thời HEAD1"}\n`)
  // HEAD advance: commit mới → stamp cũ lệch
  writeFileSync(join(repo, 'app2.txt'), 'v2\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'advance')
  const head2 = git(repo, 'rev-parse', 'HEAD').out
  // consumer #2: fact-pack
  const fp = spawnSync(PY, [join(BIN, 'story-fact-pack')], {
    input: JSON.stringify({ source: 'startup', cwd: repo }), encoding: 'utf8',
    timeout: 60000, cwd: repo, env: baseEnv(repo),
  })
  check('F1', 'fact-pack in ⚠ stale với cả 2 stamp', fp.stdout.includes(`⚠ lessons stale (stamp: ${head1} vs HEAD: ${head2})`), fp.stdout.slice(-250))
  check('F1', 'stale → KHÔNG dùng lesson content', !fp.stdout.includes('bài học thời HEAD1') && !fp.stdout.includes('lessons:'))
  // consumer #1: ghi đè chỉ khi an toàn — story-lesson add sau khi HEAD advance
  // → regen file với stamp MỚI, consumer sau đó dùng được (freshness loop kín)
  const add = spawnSync(PY, [LESSON, 'add', 'lesson sau advance', '--source', 'session'], {
    encoding: 'utf8', timeout: 30000, cwd: repo, env: { ...baseEnv(repo), CLAUDE_SESSION_ID: 's2' },
  })
  check('F1', 'add sau advance exit 0', add.status === 0, add.stderr)
  const fp2 = spawnSync(PY, [join(BIN, 'story-fact-pack')], {
    input: JSON.stringify({ source: 'startup', cwd: repo }), encoding: 'utf8',
    timeout: 60000, cwd: repo, env: baseEnv(repo),
  })
  check('F1', 'sau add (stamp mới) → lessons dùng lại bình thường',
    fp2.stdout.includes('lessons:') && fp2.stdout.includes('lesson sau advance') && !fp2.stdout.includes('⚠ lessons stale'), fp2.stdout.slice(-200))
  // partial file (mô phỏng crash giữa chừng): dòng JSON hỏng cuối → malformed skip, không chết
  writeFileSync(join(store, 'lessons.jsonl'),
    `(generated-from: ${git(repo, 'rev-parse', 'HEAD').out}, at: 2026-09-09T00:00:00Z)\n{"v":1,"text":"tốt"}\n{"v":1,"text":"gãy"`)
  const fp3 = spawnSync(PY, [join(BIN, 'story-fact-pack')], {
    input: JSON.stringify({ source: 'startup', cwd: repo }), encoding: 'utf8',
    timeout: 60000, cwd: repo, env: baseEnv(repo),
  })
  check('F1', 'partial file → record tốt vẫn dùng, dòng gãy skip', fp3.status === 0 && fp3.stdout.includes('tốt') && !fp3.stdout.includes('gãy'))
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== F2. pop-conflict — FAIL-Restore-incomplete + stash còn ==`)
{
  const repo = initStoryRepo('pop')
  const wt = mkdtempSync(join(tmpdir(), 'qa-fail-wt-'))
  git(repo, 'worktree', 'add', '-q', wt, '-b', 'wt-fail')
  // v2 đổi f.txt; local edit f.txt → pop conflict có kiểm soát
  writeFileSync(join(wt, 'f.txt'), 'v2-conflict\n')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'v2')
  const shaV2 = git(wt, 'rev-parse', 'HEAD').out
  writeFileSync(join(wt, 'f.txt'), 'local conflict edit\n')
  const r = spawnSync(PY, [CP, 'restore', shaV2 + '~1'], {
    encoding: 'utf8', timeout: 60000, cwd: wt,
  })
  check('F2', 'exit 1 (exit code thật — lệnh tay)', r.status === 1, `status=${r.status}`)
  check('F2', 'báo FAIL-Restore-incomplete', r.stdout.includes('FAIL-Restore-incomplete'))
  check('F2', 'stash còn nguyên (không drop)', git(wt, 'stash', 'list').out.includes('story-checkpoint auto'))
  check('F2', 'liệt kê conflict files', r.stdout.includes('conflict files') && r.stdout.includes('f.txt'), r.stdout.slice(-200))
  check('F2', 'hướng dẫn thủ công có mặt', r.stdout.includes('Xử lý thủ công'))
  // dọn worktree
  git(wt, 'reset', '--hard', shaV2)
  git(wt, 'stash', 'drop')
  git(repo, 'worktree', 'remove', '--force', wt)
  rmSync(wt, { recursive: true, force: true })
  rmSync(repo, { recursive: true, force: true })
}

console.log(`\n== F3. hook fail-open — xoá bin/store/hooks, agent vẫn chạy ==`)
{
  // 3a. xoá bin (missing-bin): cả 3 wrapper exit 0 im lặng
  const repoA = initStoryRepo('nobin')
  const missing = join(mkdtempSync(join(tmpdir(), 'qa-empty-')), 'nope')
  for (const w of [HOOK_POST, HOOK_SESSION, HOOK_STOP]) {
    const r = spawnSync(BASH, [w], {
      input: JSON.stringify({ session_id: 's', cwd: repoA, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }),
      encoding: 'utf8', timeout: 30000, cwd: repoA,
      env: { ...process.env, STORY_CHECKPOINT_BIN: missing, STORY_LESSON_BIN: missing, STORY_FACT_PACK_BIN: missing },
    })
    check('F3a', `${w.split('/').pop()} missing-bin → exit 0 im lặng`, r.status === 0 && (r.stdout || '').trim() === '', `status=${r.status}`)
  }
  rmSync(repoA, { recursive: true, force: true })

  // 3b. xoá store: hooks + CLI vẫn chạy, tự tạo lại store khi cần
  const repoB = initStoryRepo('nostore')
  rmSync(join(repoB, '.wakii'), { recursive: true, force: true })
  let r = spawnSync(BASH, [HOOK_SESSION], {
    input: JSON.stringify({ source: 'startup', cwd: repoB }), encoding: 'utf8',
    timeout: 60000, cwd: repoB, env: baseEnv(repoB),
  })
  check('F3b', 'SessionStart store vắng → exit 0, story section vẫn inject (tail/lessons graceful skip), không crash',
    r.status === 0 && (r.stdout || '').includes('story:') && !r.stdout.includes('recent checkpoints') && !r.stdout.includes('lessons:'))
  r = spawnSync(BASH, [HOOK_STOP], {
    input: JSON.stringify({ session_id: 's' }), encoding: 'utf8',
    timeout: 30000, cwd: repoB, env: baseEnv(repoB),
  })
  check('F3b', 'Stop store vắng → exit 0 im lặng', r.status === 0 && (r.stdout || '').trim() === '')
  r = spawnSync(BASH, [HOOK_POST], {
    input: JSON.stringify({ session_id: 's3', cwd: repoB, tool_name: 'Bash', tool_input: { command: 'git commit -m "tái tạo store"' } }),
    encoding: 'utf8', timeout: 60000, cwd: repoB, env: baseEnv(repoB),
  })
  check('F3b', 'PostToolUse store vắng → exit 0 + tự tạo store + ghi record', r.status === 0 && existsSync(join(repoB, '.wakii', 'checkpoints.jsonl')))
  rmSync(repoB, { recursive: true, force: true })

  // 3c. python chết hoàn toàn (wrapper trỏ interpreter không tồn tại qua bin hỏng):
  // wrapper vẫn phải exit 0 (for-loop fallback rồi exit 0)
  const repoC = initStoryRepo('nopy')
  const fakeBin = join(mkdtempSync(join(tmpdir(), 'qa-fakebin-')), 'story-checkpoint')
  writeFileSync(fakeBin, '#!/bin/bash\nexit 42\n') // bin tồn tại nhưng "chết"
  const rc = spawnSync(BASH, [HOOK_POST], {
    input: JSON.stringify({ session_id: 's', cwd: repoC, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }),
    encoding: 'utf8', timeout: 30000, cwd: repoC,
    env: { ...process.env, STORY_CHECKPOINT_BIN: fakeBin, STORY_LESSON_BIN: fakeBin },
  })
  check('F3c', 'bin hỏng exit 42 → wrapper vẫn nuốt exit 0', rc.status === 0, `status=${rc.status}`)
  rmSync(repoC, { recursive: true, force: true })
}

console.log(`\n== F4. meta session — record + stop-audit không ghi ==`)
{
  const repo = initStoryRepo('meta', { brackets: false }) // KHÔNG có brackets = meta
  // 4a. record: meta session không ghi
  const r = spawnSync(BASH, [HOOK_POST], {
    input: JSON.stringify({ session_id: 'sess-META', cwd: repo, tool_name: 'Bash', tool_input: { command: 'git commit -m "meta commit"' } }),
    encoding: 'utf8', timeout: 60000, cwd: repo, env: baseEnv(repo),
  })
  check('F4', 'record meta → exit 0, KHÔNG tạo store', r.status === 0 && !existsSync(join(repo, '.wakii')))
  // meta có lesson file sẵn (trường hợp khác) — stop-audit vẫn phải audit được
  // hay im lặng? Stop-audit đọc store theo env — meta KHÔNG có store → im lặng.
  const r2 = spawnSync(BASH, [HOOK_STOP], {
    input: JSON.stringify({ session_id: 'sess-META' }), encoding: 'utf8',
    timeout: 30000, cwd: repo, env: baseEnv(repo),
  })
  check('F4', 'stop-audit meta (không store) → exit 0 im lặng, không tạo store', r2.status === 0 && !existsSync(join(repo, '.wakii')))
  // 4b. meta session vẫn add lesson TAY được qua env store (CLI không lọc story-context — ghi tay được)
  const storeOverride = join(mkdtempSync(join(tmpdir(), 'qa-meta-store-')), '.wakii')
  const r3 = spawnSync(PY, [LESSON, 'add', 'lesson meta ghi tay', '--source', 'session'], {
    encoding: 'utf8', timeout: 30000, cwd: repo,
    env: { ...baseEnv(repo), STORY_CHECKPOINT_STORE: storeOverride },
  })
  check('F4', 'CLI ghi tay meta (env store) → exit 0', r3.status === 0, r3.stderr)
  rmSync(repo, { recursive: true, force: true })
}

// ---- HOME guard ----
const homeWakii = join(process.env.HOME || process.env.USERPROFILE || '', '.wakii')
check('guard', '~/.wakii không xuất hiện', !existsSync(homeWakii))

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('QA-FAILURE-PATHS GREEN (stale/conflict/fail-open/meta)')
