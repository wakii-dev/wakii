#!/usr/bin/env node
// story-memory-parse tests — validate/roundtrip trên fixture memory dir
// (STORY_MEMORY_DIR override — seam có sẵn trong bin). Phủ: OK path, ontology
// type sai, prefix sai, dup id, triple orphan ref, triple thiếu provenance,
// source-type sai enum, ts sai format, attrs sai dạng, roundtrip LF/CR.
// Chạy: node tests/story-memory-parse-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-memory-parse')
const PY = process.platform === 'win32' ? 'python' : 'python3'
const SEP = ' | '

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
  const dir = mkdtempSync(join(tmpdir(), `memory-parse-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

const ONTOLOGY = `<!-- parser-classes: Story, SF, Pattern, Bug, Decision, Task, File, Person -->
<!-- parser-literals: is_a -->
# Ontology\n`

// memory dir chuẩn: 1 entity + 1 triple + 1 provenance hợp lệ
function writeMemory(dir, { entities, triples, provs, onto = ONTOLOGY }) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'ontology.md'), onto)
  const w = (name, rows) =>
    writeFileSync(join(dir, name), rows.map((r) => r.join(SEP)).join('\n') + '\n')
  w('entities.md', entities)
  w('triples.md', triples)
  w('provenance.md', provs)
}

const E_OK = ['story:FI-1', 'Story', 'Story FI-1', 'state=Done']
const T_OK = ['story:FI-1', 'is_a', 'story:FI-1', '2026-09-20']
// literal "is_a" — tham chiếu qua literal thì không cần entity tồn tại
const P_OK = [[...T_OK.slice(0, 3), 'linear-comment', 'FI-1'].join(SEP)]

function baseMemory(dir, extra = {}) {
  writeMemory(dir, {
    entities: [E_OK, ...(extra.entities || [])],
    triples: [T_OK, ...(extra.triples || [])],
    provs: [P_OK.join(SEP).split(SEP).slice(0, 5), ...(extra.provs || [])],
    ...extra
  })
}

function runParse(dir, sub) {
  return spawnSync(PY, [BIN, sub], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, STORY_MEMORY_DIR: dir },
  })
}

console.log('== M1 memory hợp lệ → validate OK + roundtrip OK ==')
{
  const dir = tempDir('m1')
  baseMemory(dir)
  const v = runParse(dir, 'validate')
  check('M1', 'validate exit 0 + OK', v.status === 0 && v.stdout.includes('OK: 1 entities'), v.stdout)
  const r = runParse(dir, 'roundtrip')
  check('M1', 'roundtrip byte-identical', r.status === 0 && r.stdout.includes('ROUNDTRIP OK'), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M2 entity type ngoài ontology + prefix sai → FAIL ==')
{
  const dir = tempDir('m2')
  writeMemory(dir, {
    entities: [['story:FI-1', 'Alien', 'sai type', '']],
    triples: [], provs: []
  })
  const v = runParse(dir, 'validate')
  check('M2', 'exit 1 + type ngoài ontology', v.status === 1 && v.stdout.includes('type không thuộc ontology'), v.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M3 dup entity id → FAIL ==')
{
  const dir = tempDir('m3')
  writeMemory(dir, { entities: [E_OK, E_OK], triples: [], provs: [] })
  const v = runParse(dir, 'validate')
  check('M3', 'dup id FAIL', v.status === 1 && v.stdout.includes('entity id trùng'), v.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M4 triple tham chiếu entity không tồn tại → FAIL ==')
{
  const dir = tempDir('m4')
  writeMemory(dir, {
    entities: [E_OK],
    triples: [['story:FI-1', 'blocks', 'sf:99', '2026-09-20']],
    provs: [['story:FI-1', 'blocks', 'sf:99', 'git-commit', 'abc']]
  })
  const v = runParse(dir, 'validate')
  check('M4', 'orphan ref FAIL', v.status === 1 && v.stdout.includes('tham chiếu entity không tồn tại'), v.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M5 triple thiếu provenance → FAIL ==')
{
  const dir = tempDir('m5')
  writeMemory(dir, {
    entities: [E_OK],
    triples: [['story:FI-1', 'blocks', 'story:FI-2', '2026-09-20']],
    provs: []
  })
  const v = runParse(dir, 'validate')
  check('M5', 'thiếu provenance FAIL', v.status === 1 && v.stdout.includes('THIẾU PROVENANCE'), v.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M6 source-type sai enum + ts sai format → FAIL ==')
{
  const dir = tempDir('m6')
  writeMemory(dir, {
    entities: [E_OK],
    triples: [['story:FI-1', 'blocks', 'story:FI-2', '20/09/2026']],
    provs: [['story:FI-1', 'blocks', 'story:FI-2', 'twitter', 'x']]
  })
  const v = runParse(dir, 'validate')
  check('M6', 'source-type sai enum FAIL', v.stdout.includes('source-type sai enum'), v.stdout)
  check('M6', 'ts sai format FAIL', v.stdout.includes('ts sai YYYY-MM-DD'), v.stdout)
  check('M6', 'exit 1', v.status === 1, `code=${v.status}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M7 roundtrip: thiếu \\n cuối + CRLF → FAIL ==')
{
  const dir = tempDir('m7')
  baseMemory(dir)
  // phá canonical: bỏ \n cuối entities.md
  const p = join(dir, 'entities.md')
  const raw = (await import('node:fs')).readFileSync(p, 'utf8')
  ;(await import('node:fs')).writeFileSync(p, raw.replace(/\n$/, ''))
  const r = runParse(dir, 'roundtrip')
  check('M7', 'thiếu \\n cuối FAIL', r.status === 1 && r.stdout.includes('thiếu ký tự'), r.stdout)
  // CRLF case
  writeFileSync(p, raw.replace(/\n$/, '').replace(/\n/g, '\r\n') + '\r\n')
  const r2 = runParse(dir, 'roundtrip')
  check('M7', 'CRLF FAIL', r2.status === 1 && r2.stdout.includes('CRLF'), r2.stdout)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== M8 sai subcommand → usage exit != 0 ==')
{
  const dir = tempDir('m8')
  const v = runParse(dir, 'khong-co')
  check('M8', 'subcommand sai → exit != 0', v.status !== 0, `code=${v.status}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
