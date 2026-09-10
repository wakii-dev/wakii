#!/usr/bin/env node
// agent-def protocol tests (SF-3 GH-26) — grep-assert protocol mới trong
// agent-defs theo exit criteria của context pack: (1) task-executor có bước
// lesson ĐÚNG VỊ TRÍ (sau tick plan, trước tester review); (2) rollback-fixer
// có đủ 3 điểm checkpoint-restore protocol.
// Chạy: node tests/agent-def-protocol-tests.mjs
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const AGENTS = resolve(testsDir, '../kit/agents')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

// =====================================================================
console.log(`== [tex] task-executor def — bước lesson optional trong complete-run checklist ==`)
{
  const md = readFileSync(join(AGENTS, 'task-executor.md'), 'utf8')
  check('tex', 'checklist có bước story-lesson add', md.includes('story-lesson add'), '')
  check('tex', 'bước là OPTIONAL (không ép ghi mỗi task)', /OPTIONAL[\s\S]{0,40}LESSON/.test(md))
  check('tex', 'flag --source session (provenance)', md.includes('--source session'))
  check('tex', 'flag --tags với epic/sf', md.includes('--tags'))
  // đúng vị trí: sau TICK plan, trước TESTER REVIEW
  const iTick = md.indexOf('TICK plan file')
  const iLesson = md.indexOf('story-lesson add')
  const iReview = md.indexOf('TESTER REVIEW:')
  const iMerge = md.indexOf('MERGE vào NHÁNH ĐÍCH')
  const iDone = md.indexOf('RỒI MỚI: orca linear status set <ISSUE> --to Done')
  check('tex', 'exit criteria: sau bước tick plan', iTick > -1 && iLesson > iTick)
  check('tex', 'exit criteria: trước tester review', iReview > -1 && iLesson < iReview)
  check('tex', 'thứ tự toàn checklist: tick → lesson → review → merge → Done',
    iTick < iLesson && iLesson < iReview && iReview < iMerge && iMerge < iDone)
  // hướng dẫn skip + không tự trích
  check('tex', 'ghi rõ skip khi không có lesson', md.includes('skip nếu không có'))
  check('tex', 'không tự trích lesson từ transcript', md.includes('không tự trích từ transcript'))
}

console.log(`\n== [rbf] rollback-fixer def — protocol checkpoint-restore đủ 3 điểm ==`)
{
  const md = readFileSync(join(AGENTS, 'rollback-fixer.md'), 'utf8')
  // (a) liệt kê refs + target = step TRƯỚC bước hỏng + fallback git revert
  check('rbf-a', 'liệt kê refs qua git for-each-ref refs/wakii/checkpoints/', md.includes('git for-each-ref refs/wakii/checkpoints'))
  check('rbf-a', 'target = ref của step TRƯỚC bước hỏng', /TRƯỚC[\s\S]{0,80}bước hỏng|step trước[\s\S]{0,40}bước hỏng/.test(md))
  check('rbf-a', 'không ref phù hợp → git revert (giữ pattern hiện tại)', md.includes('git revert'))
  // (b) restore qua story-checkpoint restore <sha>
  check('rbf-b', 'restore qua story-checkpoint restore <sha>', /story-checkpoint restore/.test(md))
  // (c) pop-conflict protocol — FAIL + giữ stash + báo, KHÔNG tự resolve KHÔNG retry
  check('rbf-c', 'pop-conflict → FAIL-Restore-incomplete', md.includes('FAIL-Restore-incomplete'))
  check('rbf-c', 'GIỮ stash (không drop)', /GIỮ stash|giữ stash/.test(md))
  check('rbf-c', 'báo coordinator + người', /báo coordinator/.test(md))
  check('rbf-c', 'KHÔNG tự resolve KHÔNG retry', /KHÔNG tự resolve/.test(md) && /KHÔNG retry/.test(md))
  check('rbf-c', 'tree half-restored tệ hơn ban đầu (cảnh báo rõ)', /half-restored/.test(md))
  // protocol đứng trong section riêng (dễ brief khi dispatch)
  check('rbf', 'protocol nằm trong section checkpoint-restore riêng', /##\s+[\s\S]{0,20}checkpoint-restore/i.test(md)
    || md.includes('Checkpoint-restore protocol (story checkpoint refs)'))
}

// =====================================================================
console.log(`\n== [gh32] findings template — confidence + evidence trong 3 agent-defs ==`)
{
  // code-reviewer/verifier: bullet shape + evidence + VERDICT byte-stable note
  for (const f of ['code-reviewer.md', 'verifier.md']) {
    const md = readFileSync(join(AGENTS, f), 'utf8')
    check('gh32', `${f} có bullet shape [P?][confidence:?]`, /\[P\d\]\[confidence:(high|med|low)\]/.test(md))
    check('gh32', `${f} có evidence: trích nguyên văn`, /evidence:\s/.test(md))
    check('gh32', `${f} note VERDICT byte-stable`, md.includes('byte-stable'))
  }
  // security-audit: 3 bảng đều có cột Conf + Evidence
  const sa = readFileSync(join(AGENTS, 'security-audit.md'), 'utf8')
  const tables = sa.split('\n').filter(l => l.trim().startsWith('|') && l.includes('Location'))
  check('gh32', 'security-audit: các bảng Location đều có cột Conf',
    tables.length >= 3 && tables.every(l => /\|\s*Conf\s*\|/i.test(l)),
    `tables=${tables.length}`)
  check('gh32', 'security-audit: các bảng Location đều có cột Evidence',
    tables.every(l => /Evidence/i.test(l)))
  check('gh32', 'security-audit: confidence enum high/med/low trong doc', /high\/med\/low/.test(sa))
  check('gh32', 'security-audit: có OUTBOX reviews/ dir', sa.includes('docs/superpowers/reviews/security-audit-'))
  // OUTBOX dir protocol 3 defs (GH-32 task 1)
  for (const f of ['code-reviewer.md', 'verifier.md', 'task-executor.md']) {
    const md = readFileSync(join(AGENTS, f), 'utf8')
    check('gh32', `${f} OUTBOX trỏ docs/superpowers/reviews/`, md.includes('docs/superpowers/reviews/'))
    check('gh32', `${f} OUTBOX KHÔNG còn /tmp/story`, !md.includes('/tmp/story/'))
  }
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (tex-lesson-step/rbf-restore-protocol)')
