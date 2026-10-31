#!/usr/bin/env node
// Guard-test panel.html canvas mode (GH-84 SF-1 review P0/P1):
//  - P0: confirm() chết im lặng trong sandbox iframe (allow-scripts, không
//    allow-modals — CDP-proven SBX:RESULT:false) ⇒ cấm mọi call-site.
//  - P1: render mode-aware — mọi đường render ngoài renderBracket/setBracketMode/
//    attachNodeDrag (tier-only paths) phải đi qua renderGraph; renderGraph phải
//    sync curBracket TRƯỚC rẽ nhánh mode (toggle về Tier không được thấy bracket cũ).
// Chạy: node tests/panel-canvas-guard-tests.mjs
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

// G1 — không còn call confirm() (bỏ line-comments trước khi quét)
t('G1: panel.html main script 0 call confirm()', () => {
  const noComments = main.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  const hits = [...noComments.matchAll(/(^|[^.\w])confirm\(/g)]
  assert(hits.length === 0, 'còn ' + hits.length + ' call confirm(): ' + hits.slice(0, 3).map(m => m.input.slice(Math.max(0, m.index - 20), m.index + 30)).join(' | '))
})

// G2 — inPanelConfirm tồn tại + 3 call-sites (edge draft-tier? tier-snap, node-delete, dùng chung)
t('G2: inPanelConfirm định nghĩa + wire vào tier-snap + node-delete', () => {
  extractFn('inPanelConfirm')
  const calls = [...main.matchAll(/inPanelConfirm\(/g)].length
  // 1 định nghĩa + 2 call-site (attachNodeDrag tier-snap, showInspector delete)
  assert(calls >= 3, 'inPanelConfirm xuất hiện ' + calls + ' lần (cần >=3: def + 2 call)')
  assert(/inPanelConfirm\(b\.id \+ ' → tier '/.test(main), 'tier-snap chưa wire inPanelConfirm')
  assert(/inPanelConfirm\('Xoá ' \+ item\.id/.test(main), 'node-delete chưa wire inPanelConfirm')
})

// G3 — edgeRemoveApply: legacy .md path (bracketApplyMd) + canonical .wakii
// path (wakiiApply doc-mutation) — không confirm
t('G3: edgeRemoveApply — bỏ dep (legacy md + canonical wakii)', () => {
  const fn = extractFn('edgeRemoveApply')
  assert(!/confirm\(/.test(fn), 'edgeRemoveApply chứa confirm')
  const document = { getElementById: () => ({ textContent: '', style: {} }) }
  // legacy: bracketApplyMd splice → markdown "Depends on: —"
  {
    const sfBlocks = extractFn('sfBlocks')
    const setSegLine = extractFn('setSegLine')
    const bracketApply = extractFn('bracketApply')
    const bracketApplyMd = extractFn('bracketApplyMd')
    let saved = null
    const MD = '# Story: GH-84 Test\n\n## SF-1 Core\nTier: 0\nDepends on: —\nTasks: a\n\n## SF-2 UI\nTier: 1\nDepends on: SF-1\nTasks: c\n'
    const run = new Function('document', 'graph', 'saveBracketMd',
      sfBlocks + '\n' + setSegLine + '\n' + bracketApply + '\n' + bracketApplyMd + '\n' + fn + '\nreturn edgeRemoveApply'
    )(document,
      {
        sourceKind: 'bracket', planMarkdown: MD,
        branches: [{ id: 'SF-1', title: 'Core', tier: 0, deps: [], tasks: [] }, { id: 'SF-2', title: 'UI', tier: 1, deps: ['SF-1'], tasks: ['c'] }]
      },
      md => { saved = md })
    run('SF-1', 'SF-2')
    assert(saved && /Depends on: —/.test(saved), 'markdown sau remove thiếu "Depends on: —": ' + String(saved).match(/Depends on: [^\n]*/)?.[0])
  }
  // canonical: graph.doc edges — dep SF-1 bị bỏ khỏi SF-2 (stub closure dùng
  // graph của test scope — không thấy param của Function body)
  {
    const toBranchId = extractFn('toBranchId')
    const toNodeId = extractFn('toNodeId')
    const docSfNode = extractFn('docSfNode')
    const wakiiApply = extractFn('wakiiApply')
    const DOC = { wakiiMindmap: 1, meta: { story: 'S', generatedAt: 'g0', generator: 'x' },
      nodes: [
        { id: 'epic', kind: 'epic', title: 'S', state: 'in-progress' },
        { id: 'sf-1', kind: 'sf', title: 'Core', state: 'done', tier: 0 },
        { id: 'sf-2', kind: 'sf', title: 'UI', state: 'pending', tier: 1 }
      ],
      edges: [
        { from: 'epic', to: 'sf-1', rel: 'contains' },
        { from: 'epic', to: 'sf-2', rel: 'contains' },
        { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
      ] }
    const graphRef = { sourceKind: 'wakii', doc: DOC, children: [], docFile: 't.wakii' }
    let saveCalled = false
    const run = new Function('document', 'graph', 'wakiiSave',
      toBranchId + '\n' + toNodeId + '\n' + docSfNode + '\n' + wakiiApply + '\nreturn wakiiApply'
    )(document, graphRef, () => { saveCalled = true })
    run({ id: 'SF-2', title: 'UI', tier: 1, deps: '', tasks: '' })
    assert(saveCalled, 'wakiiSave không được gọi')
    const depEdges = DOC.edges.filter(e => e.rel === 'depends-on')
    assert(depEdges.length === 0, 'wakii remove vẫn còn depends-on: ' + JSON.stringify(depEdges))
    assert(DOC.nodes.length === 3 && DOC.nodes.every(n => n.kind !== 'task'), 'task reconcile sai')
  }
})

// G4 — edgeConnectApply không chứa confirm
t('G4: edgeConnectApply không chứa confirm', () => {
  assert(!/confirm\(/.test(extractFn('edgeConnectApply')), 'edgeConnectApply chứa confirm')
})

// G5 — renderGraph sync curBracket trước rẽ nhánh mode
t('G5: renderGraph sync curBracket trước khi rẽ mode (canvas path không mất bracket)', () => {
  const body = extractFn('renderGraph')
  const syncIdx = body.indexOf('curBracket.branches = branches')
  const createIdx = body.indexOf('curBracket = {')
  const branchIdx = body.indexOf("bracketMode === 'canvas'")
  assert(syncIdx >= 0, 'renderGraph không cập nhật curBracket.branches')
  assert(createIdx >= 0, 'renderGraph không tạo curBracket khi null (load đầu ở canvas mode)')
  assert(branchIdx >= 0, 'renderGraph thiếu mode branch')
  assert(syncIdx < branchIdx && createIdx < branchIdx, 'sync curBracket phải TRƯỚC mode branch')
})

// G6 — các hàm chạy cả 2 mode KHÔNG renderBracket trực tiếp (mode-aware qua renderGraph)
t('G6: openNodeEditor + inPanelConfirm + saveBracketMd không gọi renderBracket trực tiếp', () => {
  for (const name of ['openNodeEditor', 'inPanelConfirm', 'saveBracketMd']) {
    const body = extractFn(name)
    assert(!/renderBracket\(/.test(body), name + ' gọi renderBracket trực tiếp (chết canvas mode) — phải qua renderGraph')
  }
})

// G7 — node-editor cancel đi renderGraph
t('G7: openNodeEditor cancel renderGraph mode-aware', () => {
  assert(/renderGraph\(/.test(extractFn('openNodeEditor')), 'cancel node editor không mode-aware')
})

console.log(results.join('\n'))
console.log(fail ? 'GUARD-FAIL ' + fail : 'GUARD-PASS 7/7')
process.exit(fail ? 1 : 0)
