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

// =====================================================================
console.log(`\n== [gh40] task-executor def — REPORT fence template + validator self-check ==`)
{
  const md = readFileSync(join(AGENTS, 'task-executor.md'), 'utf8')
  // Template fence đủ 6 field + fence đóng
  check('gh40', 'có fence mở REPORT', /^REPORT$/m.test(md))
  check('gh40', 'có fence đóng /REPORT', /^\/REPORT$/m.test(md))
  for (const field of ['task-id:', 'status:', 'commit:', 'files:', 'tests:', 'description:']) {
    check('gh40', `template có field ${field}`, md.includes(`\n${field} `) || md.includes(`\n${field}<`))
  }
  // Validator self-check advisory — KHÔNG hard-gate
  check('gh40', 'nhắc chạy story-report-validate trước gửi', md.includes('story-report-validate'))
  check('gh40', 'self-check là advisory (không hard-gate — hook-stop fail-open)', /advisory/.test(md) && md.includes('fail-open'))
  // Grammar pins: none chỉ khi BLOCKED; tránh /REPORT trong description; notes fold
  check('gh40', 'none chỉ khi BLOCKED (DONE đòi giá trị thật)', /none chỉ khi BLOCKED/.test(md))
  check('gh40', 'cảnh báo tránh /REPORT trong description', md.includes('TRÁNH paste log chứa /REPORT'))
  check('gh40', 'notes fold vào description', md.includes('notes/deviations/follow-ups fold'))
  // Legacy warn semantics được nêu đúng
  check('gh40', 'legacy no-fence chỉ WARN (FAIL từ kit 2.8.0)', md.includes('LEGACY-REPORT') && md.includes('2.8.0'))
  // Token chỉ đích danh nằm trong def (executor tự sửa 1 lần)
  check('gh40', 'token MISSING-FIELD chỉ đích danh', md.includes('MISSING-FIELD <name> (got: <v>)'))
  // fence đứng SAU headline DONE/BLOCKED (headline giữ — spec T5)
  const iHeadline = md.indexOf('On failure: `BLOCKED <task-id>')
  const iFence = md.search(/^REPORT$/m)
  check('gh40', 'fence đứng sau DONE/BLOCKED headline', iHeadline > -1 && iFence > iHeadline)
}

// =====================================================================
console.log(`\n== [gh42-exec] task-executor KHÔNG bị deny tool (GH-42) ==`)
{
  const md = readFileSync(join(AGENTS, 'task-executor.md'), 'utf8')
  // executor chạy full trong worktree — path scope qua briefing + story-diff-review
  // hậu kiểm. Denylist per-agent — executor KHÔNG có dòng disallowedTools.
  check('gh42-exec', 'frontmatter KHÔNG có disallowedTools', !/^disallowedTools:/m.test(md))
}

// =====================================================================
// GH-42 — frontmatter parser mini (zero-dep). Mô phỏng YAML đủ dùng cho agent
// defs: key: value + inline comment (`#` chỉ mở comment khi đầu value hoặc sau
// whitespace) + quotes. Comment sai chỗ làm value cụt → name parse fail → test
// FAIL (chặn agent biến mất khỏi listing vì YAML hỏng — skip âm thầm).
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!m) return null
  const fields = {}
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/)
    if (!kv) return { invalid: line }
    let value = kv[2] ?? ''
    // `#` mở inline comment chỉ khi đứng sau whitespace (đúng spec YAML)
    const hash = value.search(/(^|\s)#/)
    if (hash !== -1) value = value.slice(0, hash)
    value = value.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    fields[kv[1]] = value
  }
  return fields
}

const GH42_AGENT_FILES = [
  'code-reviewer', 'security-audit', 'spec-critic', 'plan-critic',
  'phase0-impact-analyst', 'verifier', 'rollback-fixer', 'designer', 'task-executor'
]

console.log(`\n== [gh42-yaml] frontmatter parse được trên cả 9 defs (chặn skip âm thầm) ==`)
{
  for (const name of GH42_AGENT_FILES) {
    const md = readFileSync(join(AGENTS, `${name}.md`), 'utf8')
    const fm = parseFrontmatter(md)
    check('gh42-yaml', `${name}.md frontmatter block tồn tại`, fm !== null)
    if (!fm || fm.invalid) continue
    check('gh42-yaml', `${name}.md name field parse được + khớp file`, fm.name === name, `got: ${JSON.stringify(fm.name)}`)
    check('gh42-yaml', `${name}.md color parse non-empty (inline comment strip đúng)`, typeof fm.color === 'string' && fm.color.length > 0)
    check('gh42-yaml', `${name}.md description parse non-empty`, typeof fm.description === 'string' && fm.description.length > 0)
    if (fm.disallowedTools !== undefined) {
      check('gh42-yaml', `${name}.md disallowedTools là comma-separated string nguyên vẹn`, fm.disallowedTools === 'Edit, Write, NotebookEdit', `got: ${JSON.stringify(fm.disallowedTools)}`)
    }
  }
}

// =====================================================================
// GH-42 — matrix lint: kit/permission-matrix.md là nguồn truth duy nhất, test
// hardcode matrix và buộc frontmatter khớp TỪNG file. Lệch matrix → FAIL
// (2 bản sao của cùng profile không được phép lệch nhau).
const GH42_MATRIX = {
  'code-reviewer': 'Edit, Write, NotebookEdit',
  'security-audit': 'Edit, Write, NotebookEdit',
  'spec-critic': 'Edit, Write, NotebookEdit',
  'plan-critic': 'Edit, Write, NotebookEdit',
  'phase0-impact-analyst': 'Edit, Write, NotebookEdit',
  'verifier': 'Edit, Write, NotebookEdit',
  'rollback-fixer': 'Edit, Write, NotebookEdit',
  'designer': 'Edit, Write, NotebookEdit',
  'task-executor': null // executor full trong worktree — không deny
}
const MATRIX_DOC = resolve(testsDir, '../kit/permission-matrix.md')

console.log(`\n== [gh42-lint] disallowedTools khớp matrix hardcode per-agent ==`)
{
  for (const name of GH42_AGENT_FILES) {
    const fm = parseFrontmatter(readFileSync(join(AGENTS, `${name}.md`), 'utf8'))
    if (!fm || fm.invalid) { check('gh42-lint', `${name}.md parse được (precondition)`, false); continue }
    const actual = fm.disallowedTools ?? null
    check('gh42-lint', `${name}: disallowedTools === matrix entry`,
      actual === GH42_MATRIX[name], `matrix=${JSON.stringify(GH42_MATRIX[name])} got=${JSON.stringify(actual)}`)
  }
  // Bash không deny đồng loạt: 8 def restricted vẫn giữ Bash (rollback-fixer cần
  // git revert; designer cần preview; analysts cần đọc phân tích)
  const restricted = GH42_AGENT_FILES.filter(n => GH42_MATRIX[n])
  check('gh42-lint', 'không def nào deny Bash (denylist 3 tool write duy nhất)',
    restricted.every(n => {
      const fm = parseFrontmatter(readFileSync(join(AGENTS, `${n}.md`), 'utf8'))
      return fm && !/Bash/.test(fm.disallowedTools ?? '')
    }))
  // không def nào dùng allowlist `tools:` (agent không chết vì thiếu tool)
  check('gh42-lint', 'không def nào có allowlist tools: trong frontmatter',
    GH42_AGENT_FILES.every(n => !/^tools:/m.test(readFileSync(join(AGENTS, `${n}.md`), 'utf8'))))
}

console.log(`\n== [gh42-doc] permission-matrix.md tồn tại + liệt kê đủ 9 agents ==`)
{
  let matrix = ''
  try { matrix = readFileSync(MATRIX_DOC, 'utf8') } catch { /* miss */ }
  check('gh42-doc', 'kit/permission-matrix.md tồn tại', matrix.length > 0)
  for (const name of GH42_AGENT_FILES) {
    check('gh42-doc', `matrix chứa agent ${name}`, matrix.includes(name))
  }
  check('gh42-doc', 'matrix có cột tool-deny', /tool-deny/.test(matrix))
  check('gh42-doc', 'matrix có cột ask-scope', /ask-scope/.test(matrix))
  check('gh42-doc', 'matrix có cột escape', /escape/.test(matrix))
  check('gh42-doc', 'matrix có Bash-gap note', /Bash-gap/.test(matrix))
  check('gh42-doc', 'matrix có degrade note (fail-open Claude Code cũ)', /fail-open/.test(matrix))
  check('gh42-doc', 'matrix tham chiếu story-diff-review KHÔNG tái định nghĩa guard',
    matrix.includes('story-diff-review') && matrix.includes('KHÔNG tái định nghĩa'))
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (tex-lesson-step/rbf-restore-protocol)')
