#!/usr/bin/env node
// story-review-fuse tests (GH-32 SF-1) — spawn fuse thật trên temp OUTBOX dirs
// (qua --dir override — KHÔNG /tmp thật, KHÔNG dir reviews/ thật). Fixture:
// bullet shape, bảng security-audit, unparsed, N=0, N=1, cluster same-area,
// --min-conf, tie-break, B3 regex-assert VERDICT byte-stable.
// Chạy: node tests/review-fuse-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-review-fuse')

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

// ---- runner -----------------------------------------------------------------
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
  const dir = mkdtempSync(join(tmpdir(), `review-fuse-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function writeReviews(dir, files) {
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
}

function runFuse(slug, dir, { minConf, dryRun, env = {} } = {}) {
  const args = [BIN, slug, '--dir', dir]
  if (minConf) args.push('--min-conf', minConf)
  if (dryRun) args.push('--dry-run')
  const r = spawnSync(PY, args, {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...env },
  })
  return { code: r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

// ---- fixtures ---------------------------------------------------------------
const T1 = `- [P1][confidence:med] null deref trong resolve (api.ts:45)
  evidence: const q = cfg.x.y
`
// cùng finding khác từ ngữ + line 48 (window ±10 của 45) — nguồn thứ 2
const T1B = `- [P1][confidence:med] deref null khi resolve config (api.ts:48)
  evidence: const q = cfg.x.y
`
const HIGH = `- [P1][confidence:high] race condition (io.ts:120)
  evidence: await write() không await
`
const LOW_TABLE = `| ID | Vulnerability | Location | Severity | Conf | Evidence |
|----|---------------|----------|----------|------|----------|
| M-1 | Missing CSP | \`index.html\` | Medium | low | không có CSP header |
`
const MED_TABLE_MID = `| ID | Issue | Location | Conf | Recommendation | Evidence |
|----|-------|----------|------|----------------|----------|
| M-2 | Log injection | \`log.ts:9\` | med | Escape newline | raw t.Logf |
`
const UNPARSED = `- dòng này không khớp template nào nhưng là bullet
`
const MISSING_CONF = `- [P2] thiếu confidence (a.ts:7)
`

// =====================================================================
console.log('== A2 hai OUTBOX cùng finding khác từ ngữ → same-area [2 sources] ==')
{
  const dir = tempDir('a2')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-a.md': `# Review\n### P1\n${T1}\nVERDICT: CHANGES-REQUESTED — P1: fix\n`,
    'verifier-sf-a.md': `# Gate\n### Findings\n${T1B}\nVERDICT: FAIL — x\n`,
  })
  const r = runFuse('sf-a', rd)
  check('A2', 'exit 0', r.code === 0, `code=${r.code} out=${r.out.slice(0, 200)}`)
  check('A2', 'nhóm same-area [2 sources]', r.out.includes('same-area [2 sources]'), r.out.slice(0, 400))
  check('A2', 'giữ nguyên văn finding nguồn 1', r.out.includes('null deref trong resolve'), '')
  check('A2', 'giữ nguyên văn finding nguồn 2 (không merge text)', r.out.includes('deref null khi resolve config'), '')
  check('A2', 'cùng cluster key — 45 và 48 cùng nhóm', (r.out.match(/null deref|deref null/g) || []).length === 2, '')
  check('A2', 'invariant 2/2', /in_ra=2\/2/.test(r.out), r.out.slice(-200))
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A3 bảng security-audit 3 shape cột khác nhau ==')
{
  const dir = tempDir('a3')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'security-audit-sf-b.md':
      `# Audit\n${LOW_TABLE}\n${MED_TABLE_MID}\n| ID | Vulnerability | Location | Severity | Conf | Evidence |\n` +
      `|----|---------------|----------|----------|------|----------|\n| C-9 | SQLi | \`db.ts:5\` | Critical | high | concat input |\n` +
      `\nVERDICT: FINDINGS — P0: 1 · P1: 0 · P2: 2 — SQLi\n`,
  })
  const r = runFuse('sf-b', rd)
  check('A3', 'exit 0', r.code === 0, `code=${r.code}`)
  check('A3', 'đọc được cả 3 bảng → parsed=3', /parsed=3/.test(r.out), r.out.slice(-300))
  check('A3', 'bảng 5 cột (Critical) parse', r.out.includes('SQLi'), '')
  check('A3', 'bảng 6 cột (Medium alt) parse', r.out.includes('Log injection'), '')
  check('A3', 'location từ bảng kèm line (db.ts:5)', r.out.includes('db.ts:5'), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A4 missing-confidence + unparsed → NEEDS VERIFICATION, invariant ==')
{
  const dir = tempDir('a4')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-c.md': `# Review\n${T1}${MISSING_CONF}${UNPARSED}\nVERDICT: CHANGES-REQUESTED — P1/P2\n`,
  })
  const r = runFuse('sf-c', rd)
  check('A4', 'exit 0', r.code === 0, `code=${r.code}`)
  check('A4', 'missing-conf xuống NEEDS', /NEEDS VERIFICATION[\s\S]*thiếu confidence/.test(r.out), r.out.slice(0, 500))
  check('A4', 'unparsed giữ nguyên văn + tag', r.out.includes('[unparsed] - dòng này không khớp'), '')
  check('A4', 'invariant 3/3 (1 parsed med + 1 missing + 1 unparsed)', /in_ra=3\/3/.test(r.out), r.out.slice(-200))
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A5 N=1 vẫn parse xếp mục; N=0 in dir resolved exit 0 ==')
{
  const dir = tempDir('a5')
  const rd = join(dir, 'reviews')
  writeReviews(rd, { 'verifier-sf-d.md': `# Gate\n${T1}\nVERDICT: FAIL — x\n` })
  const r1 = runFuse('sf-d', rd)
  check('A5', 'N=1 exit 0', r1.code === 0, `code=${r1.code}`)
  check('A5', 'N=1 vẫn xếp mục (PRIMARY hiện)', r1.out.includes('══ PRIMARY ══'), '')

  const r0 = runFuse('sf-none', rd)
  check('A5', 'N=0 exit 0', r0.code === 0, `code=${r0.code}`)
  check('A5', 'N=0 in dir đã resolve', r0.out.includes('dir đã resolve') && r0.out.includes(rd), r0.out.slice(0, 300))
  check('A5', 'N=0 in no findings files', r0.out.includes('no findings files'), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A6 --min-conf high/med; env WAKII_FUSE_MIN_CONF ==')
{
  const dir = tempDir('a6')
  const rd = join(dir, 'reviews')
  // med bullet + high bullet trong 1 file
  writeReviews(rd, {
    'code-reviewer-sf-e.md': `# Review\n${T1}${HIGH}\nVERDICT: CHANGES-REQUESTED — P1 x2\n`,
  })
  const rHigh = runFuse('sf-e', rd, { minConf: 'high' })
  check('A6', 'min-conf high: med xuống NEEDS', /NEEDS VERIFICATION[\s\S]*null deref/.test(rHigh.out), rHigh.out.slice(0, 400))
  check('A6', 'min-conf high: high ở PRIMARY', /PRIMARY[\s\S]*race condition/.test(rHigh.out), '')

  const rMed = runFuse('sf-e', rd)
  check('A6', 'default med: med ở PRIMARY', /PRIMARY[\s\S]*null deref/.test(rMed.out), rMed.out.slice(0, 500))
  check('A6', 'default med: high ở PRIMARY', /PRIMARY[\s\S]*race condition/.test(rMed.out), '')

  const rEnv = runFuse('sf-e', rd, { env: { WAKII_FUSE_MIN_CONF: 'high' } })
  check('A6', 'env WAKII_FUSE_MIN_CONF=high dùng làm default', /NEEDS VERIFICATION[\s\S]*null deref/.test(rEnv.out), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A7 tie-break ổn định (cùng conf → file+line tăng) ==')
{
  const dir = tempDir('a7')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-f.md':
      `# Review\n- [P2][confidence:low] beta muộn (b.ts:20)\n- [P2][confidence:low] alpha sớm (a.ts:5)\n` +
      `- [P2][confidence:low] gamma (c.ts:1)\nVERDICT: CHANGES-REQUESTED — P2 x3\n`,
  })
  const r = runFuse('sf-f', rd)
  const iAlpha = r.out.indexOf('(a.ts:5)')
  const iBeta = r.out.indexOf('(b.ts:20)')
  const iGamma = r.out.indexOf('(c.ts:1)')
  check('A7', 'exit 0', r.code === 0, `code=${r.code}`)
  check('A7', 'thứ tự a.ts:5 < b.ts:20 < c.ts:1', iAlpha > -1 && iAlpha < iBeta && iBeta < iGamma, r.out.slice(0, 600))
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A8 invariant không bao giờ drop (nhiều shape trộn) ==')
{
  const dir = tempDir('a8')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-g.md': `# Review\n${T1}${HIGH}${MISSING_CONF}\nVERDICT: CHANGES-REQUESTED\n`,
    'security-audit-sf-g.md': `# Audit\n${LOW_TABLE}${MED_TABLE_MID}\nVERDICT: FINDINGS — P0:0 P1:0 P2:2\n`,
    'verifier-sf-g.md': `# Gate\n${T1B}${UNPARSED}\nVERDICT: PARTIAL — x\n`,
  })
  const r = runFuse('sf-g', rd)
  check('A8', 'exit 0', r.code === 0, `code=${r.code}`)
  // parsed: T1, HIGH, MISSING_CONF, LOW_TABLE, MED_TABLE_MID, T1B = 6; unparsed: 1
  check('A8', 'invariant 7/7', /in_ra=7\/7/.test(r.out), r.out.slice(-300))
  check('A8', 'KHÔNG có FUSE FAIL', !r.out.includes('FUSE FAIL'), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A9 --dry-run chỉ in thống kê ==')
{
  const dir = tempDir('a9')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-h.md': `# Review\n${T1}\nVERDICT: CHANGES-REQUESTED — P1\n`,
  })
  const r = runFuse('sf-h', rd, { dryRun: true })
  check('A9', 'exit 0', r.code === 0, `code=${r.code}`)
  check('A9', 'có dry-run stats', r.out.includes('review-fuse dry-run:') && r.out.includes('parsed=1'), r.out.slice(0, 300))
  check('A9', 'KHÔNG in report đầy đủ', !r.out.includes('══ PRIMARY ══'), '')
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A10 0-byte OUTBOX → exit 1 catastrophic; usage sai → exit 2 ==')
{
  const dir = tempDir('a10')
  const rd = join(dir, 'reviews')
  writeReviews(rd, { 'code-reviewer-sf-i.md': '' })
  const r1 = runFuse('sf-i', rd)
  check('A10', '0-byte exit 1 + FUSE FAIL', r1.code === 1 && r1.out.includes('FUSE FAIL'), `code=${r1.code}`)

  const r2 = spawnSync(PY, [BIN], { encoding: 'utf8', timeout: 15000 })
  check('A10', 'usage exit 2', r2.status === 2 && String(r2.stderr || '').includes('usage:'), `status=${r2.status}`)

  const r3 = runFuse('sf-i', rd, { minConf: 'ultra' })
  check('A10', 'min-conf sai → exit 2', r3.code === 2, `code=${r3.code} err=${r3.err.slice(0, 200)}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n== A11 nhiễm chéo sf-10 vs sf-1 (exact prefix) ==')
{
  const dir = tempDir('a11')
  const rd = join(dir, 'reviews')
  writeReviews(rd, {
    'code-reviewer-sf-1.md': `# Review\n${T1}\nVERDICT: CHANGES-REQUESTED\n`,
    'code-reviewer-sf-10.md': `- [P0][confidence:high] finding của sf-10 (x.ts:1)\nVERDICT: CHANGES-REQUESTED\n`,
  })
  const r = runFuse('sf-1', rd)
  check('A11', 'exit 0', r.code === 0, `code=${r.code}`)
  check('A11', 'sf-1 chỉ thấy file của mình (parsed=1)', /parsed=1/.test(r.out), r.out.slice(-300))
  check('A11', 'finding sf-10 KHÔNG xuất hiện', !r.out.includes('finding của sf-10'), '')
  rmSync(dir, { recursive: true, force: true })
}

// =====================================================================
console.log('\n== B3 regex-assert: VERDICT line byte-stable trong OUTBOX mới ==')
{
  // Sample output MỚI (có findings template) — fuse KHÔNG đụng dòng VERDICT,
  // story-verify B3 grep `VERDICT[^\n]{0,40}APPROVED` phải vẫn match được.
  const sampleOutbox =
    `# Code Review: task-1\n\n### P1 — Important\n` +
    `- [P1][confidence:med] null deref (api.ts:45)\n  evidence: const q = cfg.x.y\n\n` +
    `### Surgical-scope check\n- In-scope edits: 2 files → OK\n\n` +
    `VERDICT: APPROVED — đã soi diff, chỉ P1\n`
  const dir = tempDir('b3')
  const rd = join(dir, 'reviews')
  writeReviews(rd, { 'code-reviewer-sf-b3.md': sampleOutbox })
  const fused = runFuse('sf-b3', rd).out
  check('B3', 'fuse parse được sample mới (parsed=1)', /parsed=1/.test(fused), fused.slice(-200))
  const B3 = /VERDICT[^\n]{0,40}APPROVED/
  check('B3', 'B3 regex match sample OUTBOX mới', B3.test(sampleOutbox), '')
  // VERDICT line KHÔNG bị fuse đổi: đọc lại OUTBOX sau khi fuse chạy — byte bằng
  const { readFileSync } = await import('node:fs')
  const after = readFileSync(join(rd, 'code-reviewer-sf-b3.md'), 'utf8')
  check('B3', 'OUTBOX byte không đổi sau fuse', after === sampleOutbox, '')

  // 3 agent-defs: dòng VERDICT thật vẫn nguyên văn theo spec (so sánh literal)
  const AGENTS = resolve(testsDir, '../kit/agents')
  const verdicts = {
    'code-reviewer.md': '- `VERDICT: APPROVED — <1 dòng lý do>`',
    'security-audit.md': '- `VERDICT: CLEAN — không finding`',
    'verifier.md': '- `VERDICT: PASS — <1 dòng bằng chứng>`',
  }
  for (const [f, line] of Object.entries(verdicts)) {
    const md = readFileSync(join(AGENTS, f), 'utf8')
    check('B3', `${f} VERDICT line nguyên văn`, md.includes(line), '')
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
