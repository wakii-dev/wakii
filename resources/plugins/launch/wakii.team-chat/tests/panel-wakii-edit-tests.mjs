#!/usr/bin/env node
// Panel .wakii edit path (VU-14 follow-up: panel đọc/ghi canonical mindmaps/*.wakii):
//  - parseWakiiDoc projection (deps/tier/tasks/linear, id lowercase→branch uppercase)
//  - validWakiiDoc light check
//  - wakiiApply: edit giữ state/linear/human fields; add → state pending + contains epic
//  - wakiiDeleteNode: xoá sf + task children + MỌI edge chạm (không ghost depends-on)
//  - wakiiSave: bump generatedAt + generator 'orca-panel' + payload baseGeneratedAt/deletedIds
//  - nextSfIdDoc: max+1
// Chạy: node tests/panel-wakii-edit-tests.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const PANEL = resolve(testsDir, '../panel.html')
const html = readFileSync(PANEL, 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
const main = scripts[scripts.length - 1]

let fail = 0
const results = []
function t(name, fn) {
  try { fn(); results.push('PASS ' + name) }
  catch (e) { fail++; results.push('FAIL ' + name + ' — ' + e.message) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed') }

function extractFn(name) {
  const sig = 'function ' + name + '('
  const i = main.indexOf(sig)
  if (i < 0) throw new Error('not found: ' + name)
  let depth = 0
  const j = main.indexOf('{', i)
  for (let k = j; k < main.length; k++) {
    if (main[k] === '{') depth++
    else if (main[k] === '}') { depth--; if (depth === 0) return main.slice(i, k + 1) }
  }
  throw new Error('unbalanced: ' + name)
}

const HELPERS = [
  extractFn('toBranchId'), extractFn('toNodeId'), extractFn('parseWakiiDoc'),
  extractFn('validWakiiDoc'), extractFn('docSfNode'), extractFn('nextSfIdDoc'),
  extractFn('wakiiApply'), extractFn('wakiiDeleteNode'), extractFn('wakiiSave'),
  extractFn('dfsCheck')
].join('\n')
const OPS_HELPERS = extractFn('pollOpsResult') + '\n' + extractFn('opsSend')

// status element GHI ĐƯỢC — cycle guard/epic-missing viết message vào đây
const document = { getElementById: () => ({ textContent: '', style: {} }) }

function mkDoc() {
  return {
    wakiiMindmap: 1,
    meta: { story: 'VI-1 — test', generatedAt: '2026-01-01T00:00:00Z', generator: 'story-mindmap 1.0.0', epic: 'VI-1' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'VI-1', state: 'in-progress' },
      { id: 'sf-1', kind: 'sf', title: 'Core', state: 'done', tier: 0, linear: 'VI-10', notes: 'giữ lại' },
      { id: 'sf-2', kind: 'sf', title: 'UI', state: 'pending', tier: 1 },
      { id: 't-1-1', kind: 'task', title: 'task cũ', parent: 'sf-1', state: 'pending' }
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'epic', to: 'sf-2', rel: 'contains' },
      { from: 'sf-1', to: 't-1-1', rel: 'contains' },
      { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
    ]
  }
}

// W1 — parseWakiiDoc projection
t('W1: parseWakiiDoc — deps/tier/tasks/linear + id normalize', () => {
  const doc = mkDoc()
  const branches = new Function('document', HELPERS + '\nreturn parseWakiiDoc')(document)(doc, [
    { identifier: 'VI-10', stateName: 'Done', stateType: 'completed', stateColor: '#0f0', title: 'Core' }
  ])
  assert(branches.length === 2, 'số branch: ' + branches.length)
  const b1 = branches.find(b => b.id === 'SF-1')
  const b2 = branches.find(b => b.id === 'SF-2')
  assert(b1 && b1.title === 'Core' && b1.tier === 0 && b1.state?.type === 'completed', 'SF-1 projection: ' + JSON.stringify(b1))
  assert(b1.linear === 'VI-10' && b1.linearId === 'VI-10', 'SF-1 linear')
  assert(b1.tasks.length === 1 && b1.tasks[0] === 'task cũ', 'SF-1 tasks qua contains/parent: ' + JSON.stringify(b1.tasks))
  assert(b2.deps.length === 1 && b2.deps[0] === 'SF-1', 'SF-2 deps uppercase: ' + JSON.stringify(b2.deps))
  assert(b2.state === null && b2.linear === null, 'SF-2 chưa attach state')
})

// W2 — validWakiiDoc matrix
t('W2: validWakiiDoc — thiếu meta/nodes/epic node → false', () => {
  const valid = new Function('document', HELPERS + '\nreturn validWakiiDoc')(document)
  assert(valid(mkDoc()) === true, 'doc hợp lệ bị từ chối')
  assert(valid(null) === false, 'null phải false')
  assert(valid({ ...mkDoc(), wakiiMindmap: 2 }) === false, 'sai magic phải false')
  const noEpic = mkDoc(); noEpic.nodes = noEpic.nodes.filter(n => n.kind !== 'epic')
  assert(valid(noEpic) === false, 'thiếu epic node phải false')
  const noMeta = mkDoc(); delete noMeta.meta.story
  assert(valid(noMeta) === false, 'thiếu meta.story phải false')
})

// W3 — wakiiApply edit: giữ state/linear/human fields, đổi title/tier/deps
// NOTE: wakiiSave inject qua assignment (function declaration trong HELPERS
// ghi đè param cùng tên — sloppy-mode hoisting)
t('W3: wakiiApply edit — state/linear/notes giữ nguyên', () => {
  const doc = mkDoc()
  let saved = null
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii' }
  const apply = new Function('document', 'graph', 'curBracket', '__save', HELPERS + '\nwakiiSave = __save; return wakiiApply')(
    document, graph, null, () => { saved = true })
  apply({ id: 'SF-1', title: 'Core mới', tier: 2, deps: '', tasks: 'task cũ' })
  const n = doc.nodes.find(x => x.id === 'sf-1')
  assert(n.title === 'Core mới' && n.tier === 2, 'title/tier không cập nhật')
  assert(n.state === 'done' && n.linear === 'VI-10' && n.notes === 'giữ lại', 'human fields bị đè: ' + JSON.stringify(n))
  assert(!doc.edges.some(e => e.rel === 'depends-on' && e.from === 'sf-1'), 'không được có depends-on mới')
  assert(saved, 'wakiiSave không được gọi')
})

// W4 — wakiiApply add: node mới state pending + contains từ epic + task reconcile
t('W4: wakiiApply add — pending + contains epic + tasks t-3-k', () => {
  const doc = mkDoc()
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii' }
  const apply = new Function('document', 'graph', 'curBracket', '__save', HELPERS + '\nwakiiSave = __save; return wakiiApply')(
    document, graph, null, () => {})
  apply({ id: 'SF-3', title: 'Mới', tier: 1, deps: 'SF-1', tasks: 'việc một / việc hai' })
  const n = doc.nodes.find(x => x.id === 'sf-3')
  assert(n && n.state === 'pending' && n.tier === 1, 'node mới sai: ' + JSON.stringify(n))
  assert(doc.edges.some(e => e.rel === 'contains' && e.from === 'epic' && e.to === 'sf-3'), 'thiếu contains epic→sf-3')
  assert(doc.edges.some(e => e.rel === 'depends-on' && e.from === 'sf-3' && e.to === 'sf-1'), 'thiếu depends-on sf-3→sf-1')
  const tasks = doc.nodes.filter(x => x.kind === 'task' && x.parent === 'sf-3')
  assert(tasks.length === 2 && tasks[0].id === 't-3-1' && tasks[1].title === 'việc hai', 'tasks mới sai: ' + JSON.stringify(tasks))
  assert(doc.edges.some(e => e.rel === 'contains' && e.from === 'sf-3' && e.to === 't-3-1'), 'thiếu contains sf-3→task')
})

// W5 — wakiiDeleteNode: xoá sf + tasks + mọi edge (dọn depends-on của SF khác)
t('W5: wakiiDeleteNode — không ghost edges', () => {
  const doc = mkDoc()
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii' }
  const del = new Function('document', 'graph', 'curBracket', '__save', HELPERS + '\nwakiiSave = __save; return wakiiDeleteNode')(
    document, graph, null, (deletedIds) => {
      assert(deletedIds.includes('sf-1') && deletedIds.includes('t-1-1'), 'deletedIds thiếu: ' + JSON.stringify(deletedIds))
    })
  del('SF-1')
  assert(!doc.nodes.some(n => n.id === 'sf-1' || n.id === 't-1-1'), 'node/task chưa xoá')
  assert(!doc.edges.some(e => e.from === 'sf-1' || e.to === 'sf-1' || e.to === 't-1-1'), 'còn ghost edge: ' + JSON.stringify(doc.edges))
  assert(doc.nodes.some(n => n.id === 'sf-2'), 'SF-2 phải còn nguyên')
})

// W6 — wakiiSave: bump generatedAt + generator orca-panel + payload đầy đủ
t('W6: wakiiSave — generatedAt/generator/payload', () => {
  const doc = mkDoc()
  let captured = null
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii', baseGeneratedAt: doc.meta.generatedAt }
  const save = new Function('document', 'graph', 'curBracket', '__send', HELPERS + '\nopsSend = __send; return wakiiSave')(
    document, graph, null, (value, timeoutMs) => { captured = { value, timeoutMs }; return Promise.resolve({ ok: true, output: 'saved' }) })
  save(['sf-9'])
  assert(captured, 'opsSend không được gọi')
  const v = captured.value
  assert(v.action === 'wakii-save' && v.file === 'x.wakii', 'payload action/file sai')
  assert(v.baseGeneratedAt === '2026-01-01T00:00:00Z', 'baseGeneratedAt phải pre-bump: ' + v.baseGeneratedAt)
  assert(JSON.stringify(v.deletedIds) === '["sf-9"]', 'deletedIds sai')
  assert(doc.meta.generator === 'orca-panel' && doc.meta.generatedAt !== '2026-01-01T00:00:00Z', 'meta không bump')
  const parsed = JSON.parse(v.content)
  assert(parsed.wakiiMindmap === 1 && parsed.nodes.length === doc.nodes.length, 'content không round-trip')
})

// W7 — nextSfIdDoc: max+1
t('W7: nextSfIdDoc — sf-2 max → SF-3', () => {
  const next = new Function('document', HELPERS + '\nreturn nextSfIdDoc')(document)(mkDoc())
  assert(next === 'SF-3', 'next: ' + next)
})

// W8 — bracketApply/bracketDeleteNode route theo sourceKind (legacy path còn nguyên)
t('W8: routing wrapper — wakii → wakiiApply, bracket → bracketApplyMd', () => {
  assert(/sourceKind === 'wakii'\) return wakiiApply/.test(main), 'bracketApply không route wakii')
  assert(/sourceKind === 'wakii'\) return wakiiDeleteNode/.test(main), 'bracketDeleteNode không route wakii')
  assert(/function bracketApplyMd\(/.test(main), 'mất legacy bracketApplyMd')
  assert(/function bracketDeleteNodeMd\(/.test(main), 'mất legacy bracketDeleteNodeMd')
})

// W9 — cycle guard trong wakiiApply: deps tạo vòng bị chặn TRƯỚC khi save
t('W9: wakiiApply cycle — SF-1 dep SF-2 (sf-2 đang dep sf-1) → chặn, không save', () => {
  const doc = mkDoc() // sf-2 depends-on sf-1 có sẵn
  let saved = false
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii' }
  const apply = new Function('document', 'graph', 'curBracket', '__save', HELPERS + '\nwakiiSave = __save; return wakiiApply')(
    document, graph, null, () => { saved = true })
  apply({ id: 'SF-1', title: 'Core', tier: 0, deps: 'SF-2', tasks: '' })
  assert(!saved, 'save không được chặn khi tạo cycle')
  assert(!doc.edges.some(e => e.rel === 'depends-on' && e.from === 'sf-1'), 'edges bị thay dù cycle')
})

// W10 — contains edge trỏ epic node THẬT (id ≠ 'epic')
t('W10: wakiiApply add — epic id tùy chỉnh được dùng cho contains', () => {
  const doc = mkDoc()
  doc.nodes[0].id = 'root-vi-1'
  doc.edges = doc.edges.map(e => e.from === 'epic' ? { ...e, from: 'root-vi-1' } : e)
  const graph = { sourceKind: 'wakii', doc, children: [], docFile: 'x.wakii' }
  const apply = new Function('document', 'graph', 'curBracket', '__save', HELPERS + '\nwakiiSave = __save; return wakiiApply')(
    document, graph, null, () => {})
  apply({ id: 'SF-3', title: 'Mới', tier: 1, deps: '', tasks: '' })
  assert(doc.edges.some(e => e.rel === 'contains' && e.from === 'root-vi-1' && e.to === 'sf-3'), 'contains không trỏ epic thật: ' + JSON.stringify(doc.edges.filter(e => e.to === 'sf-3')))
  assert(!doc.edges.some(e => e.from === 'epic' && e.to === 'sf-3'), 'vẫn hardcode from epic')
})

// W11 — opsSend serialization: request sau PHẢI chờ result của request trước
// (single-slot story.ops.request — ghi sớm = đè mất request đang chờ worker)
t('W11: opsSend — hàng đợi trong panel, không đè slot', async () => {
  const writes = []
  let resultValue = null
  const callShim = (action, params) => {
    if (action === 'storage.set') {
      writes.push(params.value)
      const v = params.value
      // giả lập worker: 20ms sau request → result
      setTimeout(() => { resultValue = { action: v.action, at: new Date().toISOString(), ok: true, output: 'done' } }, 20)
      return Promise.resolve({ ok: true })
    }
    return Promise.resolve({ ok: true, value: resultValue }) // story.ops.result
  }
  const send = new Function('__call', OPS_HELPERS + '\nvar call = __call; return opsSend')(callShim)
  const FAST = { intervalMs: 10, firstDelayMs: 10 } // test nhanh; panel dùng mặc định 2500/1500
  // gửi A rồi B NGAY LẬP TỨC — B chỉ được ghi sau khi result của A tới
  const pA = send({ action: 'act-a' }, 2000, FAST)
  const pB = send({ action: 'act-b' }, 2000, FAST)
  await new Promise(r => setTimeout(r, 5))
  assert(writes.length === 1, 'B bị ghi đè lên A (writes=' + writes.length + ')')
  assert(writes[0].action === 'act-a', 'request đầu sai: ' + writes[0].action)
  await pA
  await pB
  assert(writes.length === 2, 'B không được ghi sau A (writes=' + writes.length + ')')
  assert(writes[1].action === 'act-b', 'request sau sai: ' + writes[1].action)
})

console.log(results.join('\n'))
console.log(fail ? 'WAKII-EDIT-FAIL ' + fail : 'WAKII-EDIT-PASS 11/11')
process.exit(fail ? 1 : 0)
