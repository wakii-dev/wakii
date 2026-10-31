#!/usr/bin/env node
// wakii-validate tests — spawn bin thật trên fixture .wakii trong temp dir
// (KHÔNG đụng docs/superpowers/mindmaps/ thật). Phủ ACCEPTANCE SF-5:
// fixture OK · INVALID mỗi luật §3 (mỗi luật 1 case) · WARN linear-deferred —
// exit đúng 0/1/2 · --json shape · --resolve-primary contract.
// Chạy: node tests/wakii-validate-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/wakii-validate')

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
  const dir = mkdtempSync(join(tmpdir(), `wakii-validate-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LINEAR_API_KEY: '', ...env }
  })
}

function wakii({ meta = {}, nodes, edges, magic = 1 } = {}) {
  return JSON.stringify({
    ...(magic === null ? {} : { wakiiMindmap: magic }),
    meta: {
      story: 'FI-900 — Test story',
      generatedAt: '2026-09-28T00:00:00Z',
      generator: 'test 1.0.0',
      ...meta
    },
    nodes,
    edges
  })
}

const OK_NODES = [
  { id: 'epic', kind: 'epic', title: 'FI-900 — Test story', state: 'in-progress' },
  { id: 'sf-1', kind: 'sf', title: 'First', state: 'pending', tier: 0, linear: 'FI-901' },
  { id: 'sf-2', kind: 'sf', title: 'Second', state: 'pending', tier: 1, linear: 'FI-902' }
]
const OK_EDGES = [
  { from: 'epic', to: 'sf-1', rel: 'contains' },
  { from: 'epic', to: 'sf-2', rel: 'contains' },
  { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
]

function fixture(dir, name, text) {
  const p = join(dir, name)
  writeFileSync(p, text)
  return p
}

// ═══ 1. OK fixture ═══
{
  const dir = tempDir('ok')
  const p = fixture(dir, 'ok.wakii', wakii({ meta: { epic: 'FI-900', dest: 'story/fi900-test-story', worktreeModel: 'legacy' }, nodes: OK_NODES, edges: OK_EDGES }))
  const r = run([p])
  check('T1.1', 'OK fixture exit 0', r.status === 0, `exit=${r.status} out=${r.stdout}`)
  check('T1.2', 'OK fixture verdict in stdout', /OK/.test(r.stdout), r.stdout)
  const rj = run([p, '--json'])
  let j = null
  try { j = JSON.parse(rj.stdout) } catch { /* để check dưới */ }
  check('T1.3', '--json parse được', j !== null, rj.stdout)
  check('T1.4', '--json verdict OK', j && j.verdict === 'OK', JSON.stringify(j))
  check('T1.5', '--json sf_count=2', j && j.sf_count === 2, JSON.stringify(j))
  check('T1.6', '--json fails rỗng', j && Array.isArray(j.fails) && j.fails.length === 0, JSON.stringify(j))
  check('T1.7', '--json warns là array', j && Array.isArray(j.warns), JSON.stringify(j))
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 2. INVALID — mỗi luật §3 một case ═══
const INVALID_CASES = [
  ['T2.1', 'magic thiếu', wakii({ magic: null, nodes: OK_NODES, edges: OK_EDGES })],
  ['T2.2', 'version lạ', wakii({ magic: 2, nodes: OK_NODES, edges: OK_EDGES })],
  ['T2.3', 'meta.story thiếu', wakii({ meta: { story: undefined }, nodes: OK_NODES, edges: OK_EDGES })],
  ['T2.4', 'meta.generatedAt thiếu', wakii({ meta: { generatedAt: undefined }, nodes: OK_NODES, edges: OK_EDGES })],
  ['T2.5', 'meta.generator thiếu', wakii({ meta: { generator: undefined }, nodes: OK_NODES, edges: OK_EDGES })],
  ['T2.6', 'node thiếu title', wakii({ nodes: OK_NODES.map((n, i) => (i === 1 ? { ...n, title: undefined } : n)), edges: OK_EDGES })],
  ['T2.7', 'edge thiếu rel', wakii({ nodes: OK_NODES, edges: OK_EDGES.map((e, i) => (i === 2 ? { from: e.from, to: e.to } : e)) })],
  ['T2.8', 'duplicate id', wakii({ nodes: [...OK_NODES, { id: 'sf-1', kind: 'sf', title: 'Dup' }], edges: OK_EDGES })],
  ['T2.9', 'dangling edge', wakii({ nodes: OK_NODES, edges: [...OK_EDGES, { from: 'ghost', to: 'sf-1', rel: 'flows-to' }] })],
  ['T2.10', 'dangling parent', wakii({ nodes: OK_NODES.map((n, i) => (i === 1 ? { ...n, parent: 'ghost' } : n)), edges: OK_EDGES })],
  ['T2.11', 'self-loop', wakii({ nodes: OK_NODES, edges: [...OK_EDGES, { from: 'sf-1', to: 'sf-1', rel: 'flows-to' }] })],
  ['T2.12', 'không epic node', wakii({ nodes: OK_NODES.slice(1), edges: OK_EDGES.slice(2) })],
  ['T2.13', 'không node sf (wakii-validate story rule)', wakii({ nodes: [OK_NODES[0]], edges: [] })],
  ['T2.14', 'JSON vỡ', '{ không phải json'],
  // wakii-validate story-level: linear format + cycle
  ['T2.15', 'linear sai format', wakii({ nodes: OK_NODES.map((n, i) => (i === 1 ? { ...n, linear: 'FI901' } : n)), edges: OK_EDGES })],
  ['T2.16', 'duplicate linear giữa các SF', wakii({ nodes: OK_NODES.map((n, i) => (i === 2 ? { ...n, linear: 'FI-901' } : n)), edges: OK_EDGES })],
  ['T2.17', 'depends-on cycle', wakii({ nodes: OK_NODES, edges: [...OK_EDGES.slice(0, 2), { from: 'sf-1', to: 'sf-2', rel: 'depends-on' }, { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }] })]
]
{
  const dir = tempDir('invalid')
  for (const [id, name, text] of INVALID_CASES) {
    const p = fixture(dir, `${id}.wakii`, text)
    const r = run([p])
    check(id, `INVALID ${name} — exit 1`, r.status === 1, `exit=${r.status} out=${(r.stdout + r.stderr).slice(0, 200)}`)
  }
  // >5MB — luật cap input
  const big = JSON.stringify({
    wakiiMindmap: 1,
    meta: { story: 'x', generatedAt: 't', generator: 'g' },
    nodes: [{ id: 'epic', kind: 'epic', title: 'e', detail: 'z'.repeat(5 * 1024 * 1024) }],
    edges: []
  })
  const pb = fixture(dir, 'T2.18.wakii', big)
  const rb = run([pb])
  check('T2.18', 'INVALID >5MB — exit 1', rb.status === 1, `exit=${rb.status}`)
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 3. WARN — không chặn (exit 0) ═══
{
  const dir = tempDir('warn')
  // tier lệch: sf-2 tier 0 nhưng depends sf-1 (tier 0) → G2 WARN, verdict OK
  const p1 = fixture(dir, 'tier.wakii', wakii({
    nodes: OK_NODES.map((n, i) => (i === 2 ? { ...n, tier: 0 } : n)),
    edges: OK_EDGES
  }))
  const r1 = run([p1])
  check('T3.1', 'tier lệch → WARN exit 0', r1.status === 0, `exit=${r1.status} out=${r1.stdout}`)
  check('T3.2', 'tier lệch in dòng WARN', /WARN/.test(r1.stdout), r1.stdout)
  // --linear không key → WARN skip, exit 0
  const p2 = fixture(dir, 'lin.wakii', wakii({ nodes: OK_NODES, edges: OK_EDGES }))
  const r2 = run([p2, '--linear'])
  check('T3.3', '--linear thiếu key → WARN skip exit 0', r2.status === 0, `exit=${r2.status} out=${r2.stdout}`)
  check('T3.4', '--linear thiếu key in WARN', /WARN/.test(r2.stdout), r2.stdout)
  // decodeWarnings từ unknown enum → WARN + OK (forward-compat)
  const p3 = fixture(dir, 'enum.wakii', wakii({
    nodes: [...OK_NODES, { id: 'x-1', kind: 'alien', title: 'X' }],
    edges: OK_EDGES
  }))
  const r3 = run([p3])
  check('T3.5', 'unknown kind → drop + WARN exit 0', r3.status === 0 && /WARN/.test(r3.stdout), `exit=${r3.status} out=${r3.stdout}`)
  // --json warns chứa nội dung
  const rj = run([p1, '--json'])
  let j = null
  try { j = JSON.parse(rj.stdout) } catch { /* */ }
  check('T3.6', '--json warns không rỗng khi tier lệch', j && j.warns.length > 0 && j.verdict === 'OK', JSON.stringify(j))
  rmSync(dir, { recursive: true, force: true })
}

// ═══ 4. usage + file đọc lỗi — exit 2 ═══
{
  const r1 = run([])
  check('T4.1', 'không args → exit 2', r1.status === 2, `exit=${r1.status}`)
  const r2 = run([join(tempDir('u'), 'không-tồn-tại.wakii')])
  check('T4.2', 'file không tồn tại → exit 2', r2.status === 2, `exit=${r2.status}`)
  const r3 = run(['--flag-lạ'])
  check('T4.3', 'flag lạ → exit 2', r3.status === 2, `exit=${r3.status}`)
}

// ═══ 5. --resolve-primary contract (port từ story-validate) ═══
{
  const repo = resolve(testsDir, '../../..')
  const r1 = run(['--resolve-primary', '--primary', 'feature/clone-vs-vscode', '--repo', repo])
  check('T5.1', 'resolve-primary explicit hit → exit 0 + in ref', r1.status === 0 && /feature\/clone-vs-vscode/.test(r1.stdout), `exit=${r1.status} out=${r1.stdout}`)
  const r2 = run(['--resolve-primary', '--primary', 'không-tồn-tại-branch-xyz', '--repo', repo])
  check('T5.2', 'resolve-primary explicit miss → exit 1', r2.status === 1, `exit=${r2.status} out=${r2.stdout}`)
  const r3 = run(['--resolve-primary', '--primary', ''])
  check('T5.3', 'resolve-primary --primary rỗng → exit 2 usage', r3.status === 2, `exit=${r3.status}`)
}

// ═══ tóm ═══
console.log(`\n${pass} PASS, ${fail} FAIL`)
if (fail > 0) {
  for (const f of failures) console.log('  FAIL: ' + f)
  process.exit(1)
}
