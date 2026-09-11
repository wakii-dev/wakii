#!/usr/bin/env node
// story-kb bin tests (GH-45 SF-1) — fixture KB qua --dir temp dir (KHÔNG đụng
// dir thật): stats counts, query-adr match/no-match, query-repo + grading,
// glossary/moc term+TOC, fail-open dir vắng, --dir override, WAKII_KB_DIR env.
// Chạy: node tests/kb-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-kb')

// Resolve python launcher: Windows spawnSync dính Store alias stub cho
// 'python3' (9009) → fallback 'python' rồi 'py' (pattern review-fuse-tests).
let PY
for (const name of ['python3', 'python', 'py']) {
  const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
  if (r.status === 0) { PY = name; break }
}
if (!PY) throw new Error('không tìm thấy python3/python/py chạy được')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

function run(args, opts = {}) {
  return spawnSync(PY, [BIN, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  })
}

// ---- Fixture KB (temp, LF, nội dung đếm được chính xác) ---------------------
const kbRoot = mkdtempSync(join(tmpdir(), 'kb-tests-'))
mkdirSync(join(kbRoot, 'adr'), { recursive: true })
mkdirSync(join(kbRoot, 'repos'), { recursive: true })

const ADR = [
  '---',
  'id: 0001',
  'title: ADE knowledge schema',
  'status: accepted',
  'date: 2026-09-10',
  'grading: ADOPT(layer1) DIRECTION(layer2) WATCH(layer3)',
  '---',
  '',
  '# 0001 — ADE knowledge schema',
  '',
  'Knowledge schema contract cho ADE.',
  '',
].join('\n')
const REPO_CORE = [
  '---',
  'title: Wakii core',
  'grading: ADOPT(layer1)',
  '---',
  '',
  'Electron terminal app.',
  '',
].join('\n')
const REPO_SITE = [
  '---',
  'title: Wakii site',
  'grading: WATCH(layer3)',
  '---',
  '',
  'Knowledge host.',
  '',
].join('\n')
const GLOSSARY = [
  '# Glossary',
  '',
  '## KB',
  'Knowledge Base dir.',
  '',
  '## ADE',
  'Agent-Driven Engineering.',
  '',
].join('\n')
const MOC = [
  '# MOC',
  '',
  '## Schema',
  'See adr/0001.',
  '',
  '## Layers',
  'Layer 1 ADOPT.',
  '',
].join('\n')

writeFileSync(join(kbRoot, 'adr', '0001-ade-knowledge-schema.md'), ADR)
writeFileSync(join(kbRoot, 'repos', 'wakii-dev--wakii.md'), REPO_CORE)
writeFileSync(join(kbRoot, 'repos', 'wakii-dev--wakii-site.md'), REPO_SITE)
writeFileSync(join(kbRoot, 'glossary.md'), GLOSSARY)
writeFileSync(join(kbRoot, 'MOC.md'), MOC)

// cwd trống không-git cho fail-open/env tests — git rev-parse fail → fallback
// cwd, temp dir không có docs/knowledge → chắc chắn không dính KB thật.
const emptyCwd = mkdtempSync(join(tmpdir(), 'kb-tests-cwd-'))
const noKbEnv = { ...process.env }
delete noKbEnv.WAKII_KB_DIR

// ---- KB1: stats counts đúng --------------------------------------------------
console.log(`== [KB1] stats — counts + dir used ==`)
{
  const r = run(['stats', '--dir', kbRoot])
  check('KB1', 'exit 0', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  check('KB1', 'KB: dir used', r.stdout.includes(`KB: ${kbRoot}`), r.stdout)
  check('KB1', 'adr: 1 files', r.stdout.includes('adr: 1 files'), r.stdout)
  check('KB1', 'repos: 2 files', r.stdout.includes('repos: 2 files'), r.stdout)
  check('KB1', 'glossary: 7 lines', r.stdout.includes('glossary: 7 lines'), r.stdout)
  check('KB1', 'MOC: 7 lines', r.stdout.includes('MOC: 7 lines'), r.stdout)
}

// ---- KB2: query-adr match ----------------------------------------------------
console.log(`\n== [KB2] query-adr match — top result 4 dòng + path ==`)
{
  const r = run(['query-adr', 'knowledge', '--dir', kbRoot])
  check('KB2', 'exit 0', r.status === 0, `code=${r.status}`)
  check('KB2', 'dòng == file', r.stdout.includes('== 0001-ade-knowledge-schema.md'), r.stdout)
  check('KB2', 'frontmatter title', r.stdout.includes('ADE knowledge schema'), r.stdout)
  check('KB2', 'snippet dòng match (H1 đầu tiên chứa kw)', r.stdout.includes('# 0001 — ADE knowledge schema'), r.stdout)
  check('KB2', '(path: ...)', /\(path: .+0001-ade-knowledge-schema\.md\)/.test(r.stdout), r.stdout)
  // KHÔNG dump cả file — output gọn (không chứa frontmatter body)
  check('KB2', 'không dump file (status: accepted vắng)', !r.stdout.includes('status: accepted'), r.stdout)
}

// ---- KB3: query-adr no-match + AND-match ------------------------------------
console.log(`\n== [KB3] query-adr no-match / AND semantics ==`)
{
  const r = run(['query-adr', 'zzz-khong-ton-tai', '--dir', kbRoot])
  check('KB3', 'no-match exit 0', r.status === 0, `code=${r.status}`)
  check('KB3', '"no ADR match"', r.stdout.trim() === 'no ADR match', r.stdout)
  const rAnd = run(['query-adr', 'knowledge', 'zzz-khong-ton-tai', '--dir', kbRoot])
  check('KB3', 'AND 1/2 kw → no match', rAnd.stdout.trim() === 'no ADR match', rAnd.stdout)
  const rAndOk = run(['query-adr', 'knowledge', 'schema', '--dir', kbRoot])
  check('KB3', 'AND đủ kw → match', rAndOk.stdout.includes('== 0001-ade-knowledge-schema.md'), rAndOk.stdout)
}

// ---- KB4: query-repo theo tên + grading line --------------------------------
console.log(`\n== [KB4] query-repo — tên + grading + path ==`)
{
  const r = run(['query-repo', 'site', '--dir', kbRoot])
  check('KB4', 'exit 0', r.status === 0, `code=${r.status}`)
  check('KB4', 'tìm theo org--repo filename', r.stdout.includes('== wakii-dev--wakii-site.md'), r.stdout)
  check('KB4', 'grading line WATCH', r.stdout.includes('grading: WATCH(layer3)'), r.stdout)
  check('KB4', '(path: ...)', /\(path: .+wakii-dev--wakii-site\.md\)/.test(r.stdout), r.stdout)
  const r2 = run(['query-repo', 'ADOPT', '--dir', kbRoot])
  check('KB4', 'query theo grading', r2.stdout.includes('== wakii-dev--wakii.md')
    && r2.stdout.includes('grading: ADOPT(layer1)'), r2.stdout)
  const r3 = run(['query-repo', 'zzz', '--dir', kbRoot])
  check('KB4', 'no-match → "no repo match" exit 0', r3.status === 0 && r3.stdout.trim() === 'no repo match', r3.stdout)
}

// ---- KB5: glossary term + TOC ------------------------------------------------
console.log(`\n== [KB5] glossary — term block + TOC ==`)
{
  const r = run(['glossary', 'ade', '--dir', kbRoot])
  check('KB5', 'term case-insens → block', r.stdout.includes('## ADE')
    && r.stdout.includes('Agent-Driven Engineering.'), r.stdout)
  check('KB5', 'block không lẫn term khác', !r.stdout.includes('## KB'), r.stdout)
  const rToc = run(['glossary', '--dir', kbRoot])
  check('KB5', 'không term → TOC (3 heading)', rToc.status === 0
    && rToc.stdout.includes('# Glossary')
    && rToc.stdout.includes('## KB') && rToc.stdout.includes('## ADE'), rToc.stdout)
  check('KB5', 'TOC không in body', !rToc.stdout.includes('Knowledge Base dir.'), rToc.stdout)
  const rMiss = run(['glossary', 'zzz', '--dir', kbRoot])
  check('KB5', 'term lạ → "no glossary entry" exit 0', rMiss.status === 0
    && rMiss.stdout.includes("no glossary entry for 'zzz'"), rMiss.stdout)
}

// ---- KB6: moc section + TOC --------------------------------------------------
console.log(`\n== [KB6] moc — section + TOC ==`)
{
  const r = run(['moc', 'layers', '--dir', kbRoot])
  check('KB6', 'section match → block đến heading kế', r.stdout.includes('## Layers')
    && r.stdout.includes('Layer 1 ADOPT.'), r.stdout)
  const rToc = run(['moc', '--dir', kbRoot])
  check('KB6', 'không section → TOC', rToc.status === 0
    && rToc.stdout.includes('## Schema') && rToc.stdout.includes('## Layers'), rToc.stdout)
  const rHit = run(['moc', 'adr/0001', '--dir', kbRoot])
  check('KB6', 'entry-line hit → in dòng', rHit.stdout.includes('See adr/0001.'), rHit.stdout)
}

// ---- KB7: dir vắng fail-open --------------------------------------------------
console.log(`\n== [KB7] fail-open — KB vắng → exit 0 "KB not configured" ==`)
{
  const r = run(['stats'], { cwd: emptyCwd, env: noKbEnv })
  check('KB7', 'exit 0', r.status === 0, `code=${r.status}`)
  check('KB7', '"KB not configured — probed:"', r.stdout.includes('KB not configured — probed:'), r.stdout)
  check('KB7', 'probed liệt kê candidate 1', r.stdout.includes(join('docs', 'knowledge')), r.stdout)
  check('KB7', 'probed liệt kê candidate 2 (wakii-site)', r.stdout.includes(join('wakii-site', 'docs', 'knowledge')), r.stdout)
  const rQ = run(['query-adr', 'anything'], { cwd: emptyCwd, env: noKbEnv })
  check('KB7', 'query-adr fail-open tương tự', rQ.status === 0 && rQ.stdout.includes('KB not configured'), rQ.stdout)
}

// ---- KB8: --dir override ------------------------------------------------------
console.log(`\n== [KB8] --dir override + --dir invalid ==`)
{
  const r = run(['stats', '--dir', kbRoot], { cwd: emptyCwd, env: noKbEnv })
  check('KB8', '--dir fixture từ cwd trống', r.status === 0 && r.stdout.includes(`KB: ${kbRoot}`), r.stdout)
  const bad = run(['stats', '--dir', join(emptyCwd, 'no-such')])
  check('KB8', '--dir invalid → fail-open exit 0', bad.status === 0
    && bad.stdout.includes('KB not configured')
    && bad.stdout.includes('no-such'), bad.stdout)
}

// ---- KB9: WAKII_KB_DIR env ----------------------------------------------------
console.log(`\n== [KB9] WAKII_KB_DIR env resolve ==`)
{
  const r = run(['stats'], { cwd: emptyCwd, env: { ...noKbEnv, WAKII_KB_DIR: kbRoot } })
  check('KB9', 'env trỏ fixture → resolve', r.status === 0 && r.stdout.includes(`KB: ${kbRoot}`), r.stdout)
  const r2 = run(['stats'], { cwd: emptyCwd, env: { ...noKbEnv, WAKII_KB_DIR: join(emptyCwd, 'nope') } })
  check('KB9', 'env trỏ dir vô hiệu → fail-open', r2.status === 0
    && r2.stdout.includes('KB not configured'), r2.stdout)
  const r3 = run(['stats', '--dir', kbRoot], { cwd: emptyCwd, env: { ...noKbEnv, WAKII_KB_DIR: join(emptyCwd, 'nope') } })
  check('KB9', '--dir > env precedence', r3.status === 0 && r3.stdout.includes(`KB: ${kbRoot}`), r3.stdout)
}

// ---- KB10: usage + subcommand lạ ----------------------------------------------
console.log(`\n== [KB10] usage errors ==`)
{
  const r = run(['bogus'])
  check('KB10', 'subcommand lạ → exit 2', r.status === 2, `code=${r.status}`)
  const rNoKw = run(['query-adr', '--dir', kbRoot])
  check('KB10', 'query-adr thiếu keyword → exit 2', rNoKw.status === 2, `code=${rNoKw.status}`)
}

rmSync(kbRoot, { recursive: true, force: true })
rmSync(emptyCwd, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (story-kb 10 KB)')
