#!/usr/bin/env node
// story-mindmap --update-state tests — updater state in-place (VU-14 SF-5).
// ACCEPTANCE: sửa notes[] tay → chạy updater → notes GIỮ NGUYÊN, chỉ
// state/evidence/generatedAt đổi. Kèm: idempotent, orca chết fail-open không
// ghi, file INVALID không đè, epic derive complete.
// Chạy: node tests/story-mindmap-update-state-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-mindmap')

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
  const dir = mkdtempSync(join(tmpdir(), `mindmap-update-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// fake orca: vocabulary orca THẬT (task-handlers.ts:9-16 — completed/dispatched,
// không phải done/in_progress vocab giả từng làm test xanh ảo) — STORY_MINDMAP_RUN skíp discovery
const FAKE_ORCA = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('task-list')) {
  console.log(JSON.stringify({ result: { tasks: [
    { task_title: 'VU SF-1 lam gi do', status: 'completed' },
    { task_title: 'VU SF-2 lam khac', status: 'dispatched' }
  ] } }))
  process.exit(0)
}
if (args.includes('run-list')) { console.log(JSON.stringify({ result: { runs: [] } })); process.exit(0) }
process.exit(1)
`

function fixture(dir) {
  const doc = {
    wakiiMindmap: 1,
    meta: {
      story: 'FI-900 — Test story',
      epic: 'FI-900',
      dest: 'story/fi900-test-story',
      generatedAt: '2026-09-28T00:00:00Z',
      generator: 'story-mindmap 1.0.0'
    },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'FI-900 — Test story', state: 'in-progress' },
      {
        id: 'sf-1', kind: 'sf', title: 'First', state: 'pending', tier: 0, linear: 'FI-901',
        summary: 'SF một làm registry',
        acceptance: ['registry load được', 'fallback không vỡ'],
        tests: ['unit registry', 'golden fixture'],
        notes: ['GHI TAY: chú ý boundary — không đụng fingerprint'],
        filesTouched: ['src/main/registry.ts']
      },
      { id: 'sf-2', kind: 'sf', title: 'Second', state: 'in-progress', tier: 1, linear: 'FI-902', notes: ['GHI TAY: giữ nguyên'] },
      { id: 't-1.1', kind: 'task', title: 'task-mot', state: 'pending', parent: 'sf-1' },
      { id: 's-1.1', kind: 'step', title: 'bước một', parent: 'sf-1', detail: 'cơ chế một (nguồn: Spec slice mục 1, best-effort)' }
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'epic', to: 'sf-2', rel: 'contains' },
      { from: 'sf-1', to: 't-1.1', rel: 'contains' },
      { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
    ],
    evidence: [{ node: 'sf-1', summary: 'evidence ghi tay', ref: 'commit abc' }]
  }
  const p = join(dir, 'fi900-test-story.wakii')
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n')
  return p
}

function runUpdater(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function load(p) { return JSON.parse(readFileSync(p, 'utf8')) }

// ═══ 1. notes GIỮ NGUYÊN, chỉ state/generatedAt đổi ═══
{
  const dir = tempDir('preserve')
  const fake = join(dir, 'fake-orca.mjs')
  writeFileSync(fake, FAKE_ORCA)
  const p = fixture(dir)
  const before = load(p)
  const r = runUpdater(['--update-state', p], { STORY_ORCA_BIN: fake, STORY_MINDMAP_RUN: 'test-run' })
  check('T2.1', 'updater exit 0', r.status === 0, `exit=${r.status} out=${r.stdout} err=${r.stderr}`)
  const after = load(p)
  const sf1b = before.nodes.find(n => n.id === 'sf-1')
  const sf1a = after.nodes.find(n => n.id === 'sf-1')
  check('T2.2', 'notes[] giữ nguyên', JSON.stringify(sf1a.notes) === JSON.stringify(sf1b.notes), JSON.stringify(sf1a.notes))
  check('T2.3', 'summary giữ nguyên', sf1a.summary === sf1b.summary)
  check('T2.4', 'acceptance giữ nguyên', JSON.stringify(sf1a.acceptance) === JSON.stringify(sf1b.acceptance))
  check('T2.5', 'tests giữ nguyên', JSON.stringify(sf1a.tests) === JSON.stringify(sf1b.tests))
  check('T2.6', 'filesTouched giữ nguyên', JSON.stringify(sf1a.filesTouched) === JSON.stringify(sf1b.filesTouched))
  check('T2.7', 'title giữ nguyên', sf1a.title === sf1b.title)
  check('T2.8', 'sf-1 state pending → done (map completed→done)', sf1b.state === 'pending' && sf1a.state === 'done', `${sf1b.state} → ${sf1a.state}`)
  const sf2a = after.nodes.find(n => n.id === 'sf-2')
  check('T2.9', 'sf-2 in-progress giữ (map dispatched→in-progress khớp nguồn)', sf2a.state === 'in-progress', sf2a.state)
  const task = after.nodes.find(n => n.id === 't-1.1')
  check('T2.10', 'task state không đụng (không có nguồn)', task.state === 'pending', task.state)
  const step = after.nodes.find(n => n.id === 's-1.1')
  check('T2.11', 'step node nguyên vẹn', JSON.stringify(step) === JSON.stringify(before.nodes.find(n => n.id === 's-1.1')))
  check('T2.12', 'edges nguyên vẹn', JSON.stringify(after.edges) === JSON.stringify(before.edges))
  check('T2.13', 'evidence người ghi giữ nguyên', JSON.stringify(after.evidence) === JSON.stringify(before.evidence))
  const epic = after.nodes.find(n => n.id === 'epic')
  check('T2.14', 'epic state derive (chưa all done → in-progress)', epic.state === 'in-progress', epic.state)
  check('T2.15', 'generatedAt bump khi state đổi', after.meta.generatedAt !== before.meta.generatedAt, after.meta.generatedAt)
  check('T2.16', 'generator giữ nguyên', after.meta.generator === before.meta.generator, after.meta.generator)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 2. idempotent — chạy lần 2 cùng nguồn → file byte-identical ═══
{
  const dir = tempDir('idem')
  const fake = join(dir, 'fake-orca.mjs')
  writeFileSync(fake, FAKE_ORCA)
  const p = fixture(dir)
  runUpdater(['--update-state', p], { STORY_ORCA_BIN: fake, STORY_MINDMAP_RUN: 'test-run' })
  const once = readFileSync(p, 'utf8')
  const r2 = runUpdater(['--update-state', p], { STORY_ORCA_BIN: fake, STORY_MINDMAP_RUN: 'test-run' })
  const twice = readFileSync(p, 'utf8')
  check('T2.17', 'lần 2 exit 0', r2.status === 0, `exit=${r2.status}`)
  check('T2.18', 'idempotent — byte-identical', once === twice)
  check('T2.19', 'lần 2 in unchanged', /unchanged/.test(r2.stdout), r2.stdout)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 3. epic complete khi mọi SF done ═══
{
  const dir = tempDir('complete')
  const fake = join(dir, 'fake-orca.mjs')
  writeFileSync(fake, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('task-list')) {
  console.log(JSON.stringify({ result: { tasks: [
    { task_title: 'VU SF-1 a', status: 'completed' },
    { task_title: 'VU SF-2 b', status: 'completed' }
  ] } }))
  process.exit(0)
}
process.exit(1)
`)
  const p = fixture(dir)
  runUpdater(['--update-state', p], { STORY_ORCA_BIN: fake, STORY_MINDMAP_RUN: 'test-run' })
  const after = load(p)
  const epic = after.nodes.find(n => n.id === 'epic')
  check('T2.20', 'epic derive complete khi mọi SF done', epic.state === 'complete', epic.state)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 4. orca chết → exit 0, KHÔNG ghi (fail-open, không data không phán) ═══
{
  const dir = tempDir('dead')
  const p = fixture(dir)
  const before = readFileSync(p, 'utf8')
  const r = runUpdater(['--update-state', p], { STORY_ORCA_BIN: join(dir, 'không-tồn-tại-orca') })
  check('T2.21', 'orca chết exit 0', r.status === 0, `exit=${r.status}`)
  check('T2.22', 'orca chết không ghi', readFileSync(p, 'utf8') === before)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 5. file INVALID → exit 1 không đè ═══
{
  const dir = tempDir('badfile')
  const p = join(dir, 'bad.wakii')
  writeFileSync(p, '{ vỡ')
  const r = runUpdater(['--update-state', p], {})
  check('T2.23', 'file INVALID exit 1', r.status === 1, `exit=${r.status}`)
  check('T2.24', 'file INVALID không đè', readFileSync(p, 'utf8') === '{ vỡ')
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 6. no-downgrade — node done absorbing: orchestration reset (ready) không hạ done (P1-4) ═══
{
  const dir = tempDir('no-down')
  const fake = join(dir, 'fake-orca.mjs')
  writeFileSync(fake, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('task-list')) {
  console.log(JSON.stringify({ result: { tasks: [
    { task_title: 'VU SF-1 lam gi do', status: 'ready' }
  ] } }))
  process.exit(0)
}
if (args.includes('run-list')) { console.log(JSON.stringify({ result: { runs: [] } })); process.exit(0) }
process.exit(1)
`)
  const p = fixture(dir)
  const doc = load(p)
  doc.nodes.find(n => n.id === 'sf-1').state = 'done' // đã xong trước đó
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n')
  const r = runUpdater(['--update-state', p], { STORY_ORCA_BIN: fake, STORY_MINDMAP_RUN: 'test-run' })
  check('T2.25', 'updater exit 0', r.status === 0, `exit=${r.status} out=${r.stdout} err=${r.stderr}`)
  check('T2.26', 'done absorbing — ready không hạ done', load(p).nodes.find(n => n.id === 'sf-1').state === 'done', load(p).nodes.find(n => n.id === 'sf-1').state)
  check('T2.27', 'không đổi gì → unchanged (không ghi)', /unchanged/.test(r.stdout), r.stdout)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 7. ORCA_STATE_MAP exported (contract SF-3) — vocabulary orca thật, value ∈ KNOWN_STATE ═══
{
  // require bin chạy main() khi chưa có main-guard → probe qua subprocess cho RED sạch
  const probe = script => spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15_000 })
  const reqBin = `require(${JSON.stringify(BIN)})`
  const r1 = probe(`const m = ${reqBin}; console.log('map:' + (m.ORCA_STATE_MAP instanceof Map) + ':' + m.ORCA_STATE_MAP.get('completed'))`)
  check('T2.28', 'ORCA_STATE_MAP exported + completed→done', r1.status === 0 && r1.stdout.trim() === 'map:true:done', `exit=${r1.status} out=${r1.stdout} err=${(r1.stderr || '').split('\n')[0]}`)
  const r2 = probe(`const m = ${reqBin};
const bad = [...m.ORCA_STATE_MAP.values()].filter(v => !m.KNOWN_STATE.has(v));
console.log('inv:' + (bad.length === 0) + ':' + ['ready|pending', 'dispatched|in-progress', 'failed|blocked', 'blocked|blocked', 'pending|pending'].every(p => { const [k, v] = p.split('|'); return m.ORCA_STATE_MAP.get(k) === v }))`)
  check('T2.29', 'mọi value ∈ KNOWN_STATE + đủ cặp spec', r2.status === 0 && r2.stdout.trim() === 'inv:true:true', `exit=${r2.status} out=${r2.stdout} err=${(r2.stderr || '').split('\n')[0]}`)
}

console.log(`\n${pass} PASS, ${fail} FAIL`)
if (fail > 0) {
  for (const f of failures) console.log('  FAIL: ' + f)
  process.exit(1)
}
