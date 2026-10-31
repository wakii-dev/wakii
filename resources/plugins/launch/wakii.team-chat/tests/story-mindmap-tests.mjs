#!/usr/bin/env node
// story-mindmap tests — schema v1 decoder verdicts + golden 3 lớp + idempotent + fail-open wrapper.
// Hermetic: temp repo mỗi case, seam STORY_ORCA_BIN / STORY_IMPACT_BIN (không gọi orca thật).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const bin = resolve(import.meta.dirname, '../kit/bin/story-mindmap')
const wrapper = resolve(import.meta.dirname, '../kit/bin/story-mindmap-trigger')
let pass = 0, fail = 0
function check(caseId, name, cond, detail = '') {
  if (cond === true) pass++
  else fail++, console.log(`  [FAIL] ${caseId} ${name} — ${detail}`)
}
function run(file, args, cwd, env = {}) {
  try {
    const out = execFileSync('node', [file, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }
  }
}
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

const BRACKET = `# Story: VX-1 — đồ án thử — mindmap fixture
Destination: story/vx-1-do-an-thu

## SF-1 Lớp nền
Tier: 0
linear:
What: sinh file
Depends on: —
Tasks: lam-schema / lam-bin

## SF-2 Lớp xem
Tier: 1
linear: VX-1-2
What: mở file
Depends on: SF-1
Tasks: lam-viewer
`
const PACK1 = `# Context pack SF-1 — Lớp nền

## Spec slice
1. Schema \`.wakii\` v1: magic + meta + nodes + edges.
2. Decoder: bắt buộc magic/meta; sai cấu trúc → INVALID.
3. Ghi idempotent: payload không đổi → không ghi lại.

## Touch map
- Sở hữu (SF-1 tạo): \`kit/bin/lam-schema\` (mới) · mô tả tự do không path
- Read-only: \`src/main/vao.ts\` (đọc shape)

## ACCEPTANCE
- file ra đủ 3 lớp

## Boundary
- KHÔNG đụng story-verify
`
const PACK2 = `# Context pack SF-2 — Lớp xem

## Spec slice
1. Mở file qua association HĐH và decode schema v1.

## ACCEPTANCE
- double-click mở được
`
// orca stub: dispatch theo subcommand — run-list (discovery) → 1 run; task-list →
// SF states theo vocabulary orca THẬT (task-handlers.ts:9-16 — vocab in_progress
// giả từng làm generate test xanh ảo, SF-3)
const ORCA_STUB = `const a = process.argv.slice(2)
if (a[1] === 'run-list') console.log('{"result":{"runs":[{"id":"run_stub1","objective":"VX-1: đồ án thử — mindmap fixture","legacy":0,"updated_at":"2026-09-27T00:00:00Z"}]}}')
else console.log('{"result":{"tasks":[{"task_title":"SF-1 Lớp nền","status":"dispatched"},{"task_title":"SF-2 Lớp xem","status":"pending"}]}}')
`
// impact stub: 1 area computed
const IMPACT_STUB = `console.log('{"base":"main","changed":[],"affectedAreas":["src/terminal"],"impact":[]}')`

function tempStory(tag, { pack2 = PACK2, bracket = BRACKET } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `story-mindmap-${tag}-`))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  mkdirSync(join(dir, 'docs/superpowers/brackets'), { recursive: true })
  mkdirSync(join(dir, 'docs/superpowers/contexts/vx-1-do-an-thu'), { recursive: true })
  writeFileSync(join(dir, 'docs/superpowers/brackets/vx-1-do-an-thu.md'), bracket)
  writeFileSync(join(dir, 'docs/superpowers/contexts/vx-1-do-an-thu/sf-1.md'), PACK1)
  writeFileSync(join(dir, 'docs/superpowers/contexts/vx-1-do-an-thu/sf-2.md'), pack2)
  const stubs = join(dir, 'stubs')
  mkdirSync(stubs, { recursive: true })
  const orca = join(stubs, 'orca.mjs'), impact = join(stubs, 'impact.mjs')
  writeFileSync(orca, ORCA_STUB); writeFileSync(impact, IMPACT_STUB)
  chmodSync(orca, 0o755); chmodSync(impact, 0o755)
  return { dir, env: { STORY_ORCA_BIN: orca, STORY_IMPACT_BIN: impact } }
}

// ══ c1: golden 3 lớp — byte-match trừ generatedAt ══
{
  const { dir, env } = tempStory('golden')
  const md = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.md')
  const r = run(bin, ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md', '--mermaid-md', md], dir, env)
  check('c1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  const file = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii')
  check('c1', 'file .wakii tồn tại', existsSync(file), file)
  if (existsSync(file)) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  check('c1', 'magic + meta.story + generator', doc.wakiiMindmap === 1 && doc.meta.story.startsWith('VX-1') && doc.meta.generator === 'story-mindmap 1.0.0', JSON.stringify(doc.meta))
  check('c1', 'dest từ bracket', doc.meta.dest === 'story/vx-1-do-an-thu', doc.meta.dest)
  check('c1', 'generatedAt ISO', !Number.isNaN(Date.parse(doc.meta.generatedAt)), doc.meta.generatedAt)
  const kinds = {}
  for (const n of doc.nodes) kinds[n.kind] = (kinds[n.kind] || 0) + 1
  check('c1', 'đủ 3 lớp: epic/sf/task + step + file/area', kinds.epic === 1 && kinds.sf === 2 && kinds.task === 3 && kinds.step === 4 && kinds.file === 2 && kinds.area === 1, JSON.stringify(kinds))
  const sf1 = doc.nodes.find(n => n.id === 'sf-1')
  const sf2 = doc.nodes.find(n => n.id === 'sf-2')
  check('c1', 'sf-1 in-progress từ orchestration', sf1.state === 'in-progress' && sf1.tier === 0, JSON.stringify(sf1))
  check('c1', 'sf-2 pending + linear', sf2.state === 'pending' && sf2.linear === 'VX-1-2' && sf2.tier === 1, JSON.stringify(sf2))
  check('c1', 'sf-1 KHÔNG linear (bracket rỗng)', sf1.linear === undefined, JSON.stringify(sf1))
  check('c1', 'epic derive in-progress', doc.nodes[0].id === 'epic' && doc.nodes[0].state === 'in-progress', JSON.stringify(doc.nodes[0]))
  const step1 = doc.nodes.find(n => n.id === 's-1.1')
  check('c1', 'step title rút gọn + detail đầy đủ + nguồn GHI RÕ', step1.title === 'Schema `.wakii` v1' && step1.detail.includes('Spec slice mục 1') && step1.detail.includes('best-effort'), JSON.stringify(step1))
  const rels = {}
  for (const e of doc.edges) rels[e.rel] = (rels[e.rel] || 0) + 1
  check('c1', 'edges 5 rel: contains/depends-on/flows-to/impacts/writes', rels.contains === 5 && rels['depends-on'] === 1 && rels['flows-to'] === 2 && rels.impacts === 2 && rels.writes === 1, JSON.stringify(rels))
  check('c1', 'file curated không computed / area computed', doc.nodes.find(n => n.id === 'f-kit-bin-lam-schema').computed === undefined && doc.nodes.find(n => n.kind === 'area').computed === true, '')
  check('c1', 'evidence có bracket + pack + impact refs', doc.evidence.length >= 3 && doc.evidence.some(e => e.ref === 'story-impact --json'), JSON.stringify(doc.evidence))
  check('c1', 'decodeWarnings rỗng (nguồn lành)', Array.isArray(doc.decodeWarnings) && doc.decodeWarnings.length === 0, JSON.stringify(doc.decodeWarnings))
  // byte-match trừ generatedAt: tái sinh Ổ OUT KHÁC (chống tautology — so file với chính nó là vô nghĩa)
  const strip = d => { const c = { ...d, meta: { ...d.meta } }; delete c.meta.generatedAt; return JSON.stringify(c, null, 2) }
  const out2 = join(dir, 'docs/superpowers/mindmaps/regen.wakii')
  const r2g = run(bin, ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md', '--out', out2], dir, env)
  check('c1', 'tái sinh --out khác exit 0', r2g.code === 0, `code=${r2g.code}`)
  check('c1', 'byte-match khi tái sinh (trừ generatedAt)', existsSync(out2) && strip(JSON.parse(readFileSync(out2, 'utf8'))) === strip(doc), 'regen lệch bytes')
  // mermaid
  check('c1', 'mermaid fence + đủ node', existsSync(md) && readFileSync(md, 'utf8').includes('```mermaid') && readFileSync(md, 'utf8').includes('sf_1'), readFileSync(md, 'utf8').slice(0, 120))
  }
  rmSync(dir, { recursive: true, force: true })
}

// ══ c2: idempotent — nguồn không đổi ×2 → lần 2 không ghi ══
{
  const { dir, env } = tempStory('idem')
  const args = ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md']
  const f = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii')
  run(bin, args, dir, env)
  const m1 = statSync(f).mtimeMs
  const bytes1 = readFileSync(f, 'utf8')
  const r2 = run(bin, args, dir, env)
  check('c2', 'exit 0', r2.code === 0, `code=${r2.code}`)
  check('c2', 'stdout nói unchanged', r2.out.includes('unchanged'), r2.out)
  check('c2', 'mtime không đổi', statSync(f).mtimeMs === m1, 'file bị ghi lại')
  check('c2', 'byte giống hệt', readFileSync(f, 'utf8') === bytes1, '')
  rmSync(dir, { recursive: true, force: true })
}

// ══ c2b: payload unchanged vẫn render --mermaid-md khi caller yêu cầu (P1 review 27/09) ══
{
  const { dir, env } = tempStory('md-unchanged')
  const args = ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md']
  run(bin, args, dir, env)
  const md = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.md')
  const r = run(bin, [...args, '--mermaid-md', md], dir, env)
  check('c2b', 'exit 0 + unchanged', r.code === 0 && r.out.includes('unchanged'), r.out)
  check('c2b', 'md vẫn được render khi unchanged', existsSync(md) && readFileSync(md, 'utf8').includes('```mermaid'), 'md bị nuốt khi unchanged')
  rmSync(dir, { recursive: true, force: true })
}

// ══ c3: payload đổi → ghi lại + generatedAt mới ══
{
  const { dir, env } = tempStory('bump')
  const args = ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md']
  const f = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii')
  run(bin, args, dir, env)
  const g1 = JSON.parse(readFileSync(f, 'utf8')).meta.generatedAt
  const pack = join(dir, 'docs/superpowers/contexts/vx-1-do-an-thu/sf-1.md')
  // chèn item 4 NGAY TRONG Spec slice (append cuối file sẽ rơi vào Boundary)
  writeFileSync(pack, PACK1.replace('3. Ghi idempotent: payload không đổi → không ghi lại.', '3. Ghi idempotent: payload không đổi → không ghi lại.\n4. Bổ sung bước mới.'))
  const r = run(bin, args, dir, env)
  check('c3', 'exit 0 + ghi lại', r.code === 0 && !r.out.includes('unchanged'), r.out)
  const doc = JSON.parse(readFileSync(f, 'utf8'))
  check('c3', 'generatedAt bump', doc.meta.generatedAt !== g1, `${g1} → ${doc.meta.generatedAt}`)
  check('c3', 'step mới vào file', doc.nodes.some(n => n.id === 's-1.4'), JSON.stringify(doc.nodes.map(n => n.id)))
  rmSync(dir, { recursive: true, force: true })
}

// ══ c4: decoder verdicts qua --decode ══
{
  const dir = mkdtempSync(join(tmpdir(), 'story-mindmap-decode-'))
  const write = (name, obj) => { const p = join(dir, name); writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)); return p }
  const valid = {
    wakiiMindmap: 1,
    meta: { story: 'S', epic: 'S', dest: 'story/s', generatedAt: '2026-09-27T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'S', state: 'in-progress' },
      { id: 'sf-1', kind: 'sf', title: 'A', state: 'done', tier: 0 },
      { id: 's-1.1', kind: 'step', title: 'b1', parent: 'sf-1' },
      { id: 'f-x', kind: 'file', title: 'src/x.ts', path: 'src/x.ts' },
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'sf-1', to: 'f-x', rel: 'writes' },
    ],
    evidence: [],
    decodeWarnings: [],
  }
  const decode = p => run(bin, ['--decode', p], dir) // p: path TUYỆT ĐỐI từ write() — join lại sẽ nhân đôi

  let r = decode(write('v.json', valid))
  check('c4', 'valid → exit 0 valid', r.code === 0 && JSON.parse(r.out).valid === true, r.out)

  r = decode(write('bad-magic.json', { ...valid, wakiiMindmap: 2 }))
  check('c4', 'version lạ → INVALID', r.code === 2 && /INVALID|version/.test(r.out), r.out)
  r = decode(write('no-magic.json', { meta: valid.meta, nodes: valid.nodes, edges: valid.edges }))
  check('c4', 'thiếu magic → INVALID', r.code === 2, r.out)
  r = decode(write('no-story.json', { ...valid, meta: { ...valid.meta, story: undefined } }))
  check('c4', 'thiếu meta.story → INVALID', r.code === 2, r.out)
  r = decode(write('bad.json', '{không phải json'))
  check('c4', 'JSON vỡ → INVALID', r.code === 2, r.out)

  r = decode(write('dup.json', { ...valid, nodes: [...valid.nodes, { id: 'sf-1', kind: 'sf', title: 'trùng', state: 'done' }] }))
  check('c4', 'duplicate id → INVALID', r.code === 2, r.out)
  r = decode(write('dangle.json', { ...valid, edges: [...valid.edges, { from: 'sf-1', to: 'khong-ton-tai', rel: 'contains' }] }))
  check('c4', 'dangling edge → INVALID', r.code === 2, r.out)
  r = decode(write('danglep.json', { ...valid, nodes: [...valid.nodes, { id: 's-1.2', kind: 'step', title: 'b2', parent: 'ao-so-mi' }] }))
  check('c4', 'dangling parent → INVALID', r.code === 2, r.out)
  r = decode(write('self.json', { ...valid, edges: [...valid.edges, { from: 'sf-1', to: 'sf-1', rel: 'depends-on' }] }))
  check('c4', 'self-loop → INVALID', r.code === 2, r.out)
  r = decode(write('notitle.json', { ...valid, nodes: [...valid.nodes, { id: 'x', kind: 'step' }] }))
  check('c4', 'node thiếu title → INVALID', r.code === 2, r.out)

  r = decode(write('unknown.json', {
    ...valid,
    nodes: [...valid.nodes, { id: 'boss-1', kind: 'boss', title: 'lạ' }, { id: 'sf-2', kind: 'sf', title: 'lạ-state', state: 'shipping' }],
    edges: [...valid.edges, { from: 'sf-1', to: 'boss-1', rel: 'fans-out' }],
  }))
  const u = JSON.parse(r.out)
  check('c4', 'unknown enum → vẫn valid (drop + warning)', r.code === 0 && u.valid === true, r.out)
  check('c4', 'node lạ bị drop, giữ phần còn lại', (u.mindmap?.nodes?.length ?? -1) === valid.nodes.length, `nodes=${u.mindmap?.nodes?.length}`)
  check('c4', 'edge lạ rel bị drop', (u.mindmap?.edges?.length ?? -1) === valid.edges.length, `edges=${u.mindmap?.edges?.length}`)
  check('c4', 'decodeWarnings có mục', (u.decodeWarnings?.length ?? 0) >= 3, JSON.stringify(u.decodeWarnings))

  r = decode(write('conflict.json', {
    ...valid,
    nodes: [...valid.nodes, { id: 'sf-3', kind: 'sf', title: 'C', state: 'pending', parent: 'sf-1' }],
    edges: [...valid.edges, { from: 'epic', to: 'sf-3', rel: 'contains' }],
  }))
  check('c4', 'parent≠contains → KHÔNG invalidate (edge thắng)', r.code === 0 && JSON.parse(r.out).valid === true, r.out)

  // >5MB cap
  const big = write('big.json', JSON.stringify({ ...valid, nodes: valid.nodes.concat(Array.from({ length: 120000 }, (_, i) => ({ id: `pad-${i}`, kind: 'step', title: 'x'.repeat(40), parent: 'sf-1' }))) }))
  check('c4', '>5MB → INVALID too-large', statSync(big).size > 5 * 1024 * 1024 && decode('big.json').code === 2, `size=${statSync(big).size}`)
  rmSync(dir, { recursive: true, force: true })
}

// ══ c5: pack CÓ nhưng thiếu touch map / thiếu hẳn → vẫn ra file, không vỡ ══
{
  const dir2 = mkdtempSync(join(tmpdir(), 'story-mindmap-nopack-'))
  git(dir2, 'init', '-q'); git(dir2, 'config', 'user.email', 't@t'); git(dir2, 'config', 'user.name', 't')
  mkdirSync(join(dir2, 'docs/superpowers/brackets'), { recursive: true })
  mkdirSync(join(dir2, 'docs/superpowers/contexts/vx-1-do-an-thu'), { recursive: true })
  writeFileSync(join(dir2, 'docs/superpowers/brackets/vx-1-do-an-thu.md'), BRACKET)
  // sf-1: pack có Spec slice, KHÔNG có Touch map; sf-2: không có pack hẳn
  writeFileSync(join(dir2, 'docs/superpowers/contexts/vx-1-do-an-thu/sf-1.md'), '# Context pack SF-1\n\n## Spec slice\n1. Viết schema.\n')
  const stubs = join(dir2, 'stubs')
  mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, 'orca.mjs'), ORCA_STUB)
  writeFileSync(join(stubs, 'impact.mjs'), 'process.exit(1)') // impact chết → không area
  chmodSync(join(stubs, 'orca.mjs'), 0o755); chmodSync(join(stubs, 'impact.mjs'), 0o755)
  const env2 = { STORY_ORCA_BIN: join(stubs, 'orca.mjs'), STORY_IMPACT_BIN: join(stubs, 'impact.mjs') }
  const r = run(bin, ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md'], dir2, env2)
  check('c5', 'exit 0 (thiếu touch map/pack không vỡ)', r.code === 0, `code=${r.code} out=${r.out}`)
  const doc = JSON.parse(readFileSync(join(dir2, 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii'), 'utf8'))
  check('c5', 'chỉ tiến độ + logic (không file/area)', doc.nodes.every(n => ['epic', 'sf', 'task', 'step'].includes(n.kind)), JSON.stringify(doc.nodes.map(n => n.kind)))
  check('c5', 'decodeWarnings ghi nguồn thiếu', doc.decodeWarnings.some(w => w.includes('sf-2')), JSON.stringify(doc.decodeWarnings))
  rmSync(dir2, { recursive: true, force: true })
}

// ══ c6: story-impact chết / treo → 2 lớp + warning + exit 0 ══
{
  const { dir } = tempStory('impact-dead')
  const bad = join(dir, 'stubs', 'impact-bad.mjs')
  writeFileSync(bad, `console.error('boom'); process.exit(1)`)
  const slow = join(dir, 'stubs', 'impact-slow.mjs')
  writeFileSync(slow, 'setTimeout(() => {}, 30000)') // treo 30s — runImpact timeout 20s phải kill
  const args = ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md']
  const f = join(dir, 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii')
  let r = run(bin, args, dir, { STORY_ORCA_BIN: join(dir, 'stubs', 'orca.mjs'), STORY_IMPACT_BIN: bad })
  check('c6', 'impact chết → exit 0', r.code === 0, r.out)
  let doc = JSON.parse(readFileSync(f, 'utf8'))
  check('c6', 'vẫn đủ tiến độ + logic', doc.nodes.some(n => n.kind === 'sf') && doc.nodes.some(n => n.kind === 'step'), JSON.stringify(doc.nodes.map(n => n.kind)))
  check('c6', 'không area computed', !doc.nodes.some(n => n.kind === 'area'), '')
  check('c6', 'decodeWarnings ghi nguồn impact', doc.decodeWarnings.some(w => w.toLowerCase().includes('story-impact')), JSON.stringify(doc.decodeWarnings))
  r = run(bin, args, dir, { STORY_ORCA_BIN: join(dir, 'stubs', 'orca.mjs'), STORY_IMPACT_BIN: slow })
  check('c6', 'impact treo → timeout vẫn exit 0 nhanh', r.code === 0, r.out)
  rmSync(dir, { recursive: true, force: true })
}

// ══ c7: wrapper fail-open — missing-bin / throw / bracket-missing → exit 0 im lặng ══
{
  const dir = mkdtempSync(join(tmpdir(), 'story-mindmap-wrap-'))
  const w = (args, env = {}) => {
    try {
      return { code: 0, out: execFileSync('bash', [wrapper, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }) }
    } catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') } }
  }
  let r = w(['--reason', 'launch'], { STORY_MINDMAP_BIN: '/nonexistent/story-mindmap' })
  check('c7', 'missing-bin → exit 0 im lặng', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out}`)
  const thrower = join(dir, 'throwing-bin.sh')
  writeFileSync(thrower, '#!/bin/sh\necho "nổ" >&2\nexit 3\n')
  r = w(['--reason', 'sweep'], { STORY_MINDMAP_BIN: thrower })
  check('c7', 'bin throw → exit 0 im lặng', r.code === 0 && r.out.trim() === '', `code=${r.code} out=${r.out}`)
  r = w(['--reason', 'launch', '--bracket', join(dir, 'khong-ton-tai.md')], { STORY_MINDMAP_BIN: bin })
  check('c7', 'bracket chỉ định mà thiếu → exit 0', r.code === 0, `code=${r.code}`)
  // sweep mode quét brackets trong cwd — không có → no-op
  r = w(['--reason', 'sweep'])
  check('c7', 'sweep không thấy bracket → no-op', r.code === 0, `code=${r.code}`)
  rmSync(dir, { recursive: true, force: true })
}

// ══ c8: close trigger — --commit force-add .wakii (docs/ bị ignore) ══
{
  const { dir, env } = tempStory('close')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base')
  writeFileSync(join(dir, '.gitignore'), 'docs/\n')
  // P1 review: file lạ đang staged KHÔNG được kéo vào commit mindmap
  writeFileSync(join(dir, 'staged-lai.txt'), 'lạ\n')
  git(dir, 'add', 'staged-lai.txt')
  const r = execFileSync('bash', [wrapper, '--reason', 'close', '--commit'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ...env },
  })
  const f = 'docs/superpowers/mindmaps/vx-1-do-an-thu.wakii'
  check('c8', 'file được sinh', existsSync(join(dir, f)), r)
  check('c8', 'file được force-add + commit', git(dir, 'ls-files').includes(f), git(dir, 'log', '--oneline'))
  check('c8', 'commit có trong log', git(dir, 'log', '--oneline').toLowerCase().includes('mindmap'), git(dir, 'log', '--oneline'))
  const committed = git(dir, 'show', '--name-only', '--format=', 'HEAD')
  check('c8', 'commit CHỈ chứa .wakii (không quét staged lạ)', committed.trim() === f, committed)
  check('c8', 'file lạ vẫn còn staged (không bị đụng)', git(dir, 'diff', '--cached', '--name-only').includes('staged-lai.txt'), git(dir, 'diff', '--cached', '--name-only'))
  // chạy lần nữa — idempotent → không commit rác
  execFileSync('bash', [wrapper, '--reason', 'close', '--commit'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } })
  check('c8', 'lần 2 không commit thêm', git(dir, 'rev-list', '--count', 'HEAD').trim() === '2', git(dir, 'log', '--oneline'))
  rmSync(dir, { recursive: true, force: true })
}

// ══ c9: generate --bracket qua map vocabulary orca thật (P2-1 — fix readOrcaStates
// cover cả generate lẫn update-state; failed→blocked không drop node) ══
{
  const bracket6 = `# Story: VX-9 — vocab map fixture
Destination: story/vx-9-vocab

## SF-1 mot
Tier: 0
linear:
Tasks: t1

## SF-2 hai
Tier: 0
linear:
Tasks: t2

## SF-3 ba
Tier: 0
linear:
Tasks: t3

## SF-4 bon
Tier: 0
linear:
Tasks: t4

## SF-5 nam
Tier: 0
linear:
Tasks: t5

## SF-6 sau
Tier: 0
linear:
Tasks: t6
`
  const { dir } = tempStory('vocab', { bracket: bracket6 })
  const orca = join(dir, 'stubs', 'orca-vocab.mjs')
  writeFileSync(orca, `const a = process.argv.slice(2)
if (a[1] === 'run-list') console.log('{"result":{"runs":[{"id":"run_v","objective":"VX-9 vocab","legacy":0,"updated_at":"2026-10-10T00:00:00Z"}]}}')
else console.log('{"result":{"tasks":[' +
  ['SF-1 mot|pending', 'SF-2 hai|ready', 'SF-3 ba|dispatched', 'SF-4 bon|completed', 'SF-5 nam|failed', 'SF-6 sau|blocked']
    .map(s => { const i = s.lastIndexOf('|'); return JSON.stringify({ task_title: s.slice(0, i), status: s.slice(i + 1) }) }).join(',')
  + ']}}')
`)
  chmodSync(orca, 0o755)
  const r = run(bin, ['--bracket', 'docs/superpowers/brackets/vx-1-do-an-thu.md'], dir,
    { STORY_ORCA_BIN: orca, STORY_IMPACT_BIN: join(dir, 'stubs', 'impact.mjs') })
  check('c9', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  const doc = JSON.parse(readFileSync(join(dir, 'docs/superpowers/mindmaps/vx-9-vocab.wakii'), 'utf8'))
  const st = Object.fromEntries(doc.nodes.filter(n => n.kind === 'sf').map(n => [n.id, n.state]))
  check('c9', 'pending→pending', st['sf-1'] === 'pending', JSON.stringify(st))
  check('c9', 'ready→pending', st['sf-2'] === 'pending', JSON.stringify(st))
  check('c9', 'dispatched→in-progress', st['sf-3'] === 'in-progress', JSON.stringify(st))
  check('c9', 'completed→done (không pending — P0 đảo trạng thái)', st['sf-4'] === 'done', JSON.stringify(st))
  check('c9', 'failed→blocked (node không bị drop — P0-1)', st['sf-5'] === 'blocked', JSON.stringify(st))
  check('c9', 'blocked→blocked', st['sf-6'] === 'blocked', JSON.stringify(st))
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass + fail} asserts — ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
