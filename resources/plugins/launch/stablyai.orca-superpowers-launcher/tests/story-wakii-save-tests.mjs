#!/usr/bin/env node
// saveWakiiStory + parseWakiiMeta (worker — panel wakii-save op):
//  - save ok atomic write; idempotent second save → 'unchanged'
//  - wakii-validate FAIL → không ghi (fail-closed)
//  - state-race merge (disk tiến trước panel → state máy wins)
//  - stale-doc (disk có sf lạ → reject, không đoán merge)
//  - path-escape (.. / \) + >250KB reject
// Hermetic: deps injection (roots + runKit stub), tmp dirs — không gọi orca CLI.
// Chạy: node tests/story-wakii-save-tests.mjs
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveWakiiStory, parseWakiiMeta } from '../main.mjs'

let fail = 0
const results = []
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => results.push('PASS ' + name),
    (e) => { fail++; results.push('FAIL ' + name + ' — ' + e.message) })
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed') }

const orca = { log: () => {} }
const validatorOk = () => Promise.resolve({ ok: true, stdout: '{"verdict":"OK"}' })

function mkRoot() {
  const root = mkdtempSync(join(tmpdir(), 'wakii-save-'))
  mkdirSync(join(root, 'docs', 'superpowers', 'mindmaps'), { recursive: true })
  return root
}
function mkDoc(gen, states) {
  return {
    wakiiMindmap: 1,
    meta: { story: 'VI-1 — test', generatedAt: gen, generator: 'orca-panel', epic: 'VI-1' },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'VI-1', state: 'in-progress' },
      { id: 'sf-1', kind: 'sf', title: 'Core', state: states?.['sf-1'] ?? 'pending', tier: 0 },
      { id: 'sf-2', kind: 'sf', title: 'UI', state: states?.['sf-2'] ?? 'pending', tier: 1 }
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'epic', to: 'sf-2', rel: 'contains' },
      { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
    ]
  }
}
const ser = (d) => JSON.stringify(d, null, 2) + '\n'

// S1 — save ok: atomic write vào file sẵn có (incoming có edit thật, không
// chỉ generatedAt — chỉ khác generatedAt là đúng semantics 'unchanged')
await t('S1: save ok — ghi đĩa đúng nội dung', async () => {
  const root = mkRoot()
  const target = join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii')
  writeFileSync(target, ser(mkDoc('G0')))
  const incomingDoc = mkDoc('G1')
  incomingDoc.nodes.find(n => n.id === 'sf-2').title = 'UI mới'
  const incoming = ser(incomingDoc)
  const r = await saveWakiiStory(orca, 'vi-1.wakii', incoming, 'G0', [], { roots: [root], runKit: validatorOk })
  assert(r.ok, 'save fail: ' + r.error)
  assert(readFileSync(target, 'utf8') === incoming, 'đĩa khác incoming')
  assert(!existsSync(join(root, 'docs', 'superpowers', 'mindmaps', '.vi-1.wakii.tmp-' + process.pid)), 'tmp sót lại')
})

// S2 — idempotent: payload giống disk (bỏ generatedAt) → unchanged, không write
await t('S2: idempotent — save trùng → unchanged', async () => {
  const root = mkRoot()
  const target = join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii')
  const doc = mkDoc('G1')
  writeFileSync(target, ser(doc))
  const before = readFileSync(target, 'utf8')
  const r = await saveWakiiStory(orca, 'vi-1.wakii', ser(doc), 'G1', [], { roots: [root], runKit: validatorOk })
  assert(r.ok, 'fail: ' + r.error)
  assert((r.stdout || '').startsWith('unchanged'), 'không báo unchanged: ' + r.stdout)
  assert(readFileSync(target, 'utf8') === before, 'disk bị ghi lại dù unchanged')
})

// S3 — validate FAIL → không ghi (fail-closed)
await t('S3: validate FAIL — file nguyên vẹn', async () => {
  const root = mkRoot()
  const target = join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii')
  const before = ser(mkDoc('G0'))
  writeFileSync(target, before)
  const r = await saveWakiiStory(orca, 'vi-1.wakii', ser(mkDoc('G1')), 'G0', [],
    { roots: [root], runKit: () => Promise.resolve({ ok: false, error: 'FAIL x\n{"fails":["linear format"]}' }) })
  assert(!r.ok, 'phải fail')
  assert(/wakii-validate FAIL/.test(r.error) && /linear format/.test(r.error), 'error thiếu fails[]: ' + r.error)
  assert(readFileSync(target, 'utf8') === before, 'file bị đè dù FAIL')
})

// S4 — state-race merge: disk tiến trước panel → state máy của disk wins,
// human edit của panel vẫn vào (incoming phải có edit thật để không 'unchanged')
await t('S4: state-race — merge state từ disk', async () => {
  const root = mkRoot()
  const target = join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii')
  // disk: orchestration đã update sf-1 → done, generatedAt G2 (≠ panel base G0)
  writeFileSync(target, ser(mkDoc('G2', { 'sf-1': 'done' })))
  const incoming = mkDoc('G1', { 'sf-1': 'pending' })
  incoming.nodes.find(n => n.id === 'sf-2').title = 'UI mới'
  const r = await saveWakiiStory(orca, 'vi-1.wakii', ser(incoming), 'G0', [], { roots: [root], runKit: validatorOk })
  assert(r.ok, 'fail: ' + r.error)
  const disk = JSON.parse(readFileSync(target, 'utf8'))
  const sf1 = disk.nodes.find(n => n.id === 'sf-1')
  assert(sf1.state === 'done', 'state không merge từ disk: ' + sf1.state)
  assert(disk.nodes.find(n => n.id === 'sf-2').title === 'UI mới', 'human edit của panel bị mất')
  assert(disk.meta.generatedAt === 'G1', 'generatedAt phải theo incoming: ' + disk.meta.generatedAt)
})

// S5 — stale-doc: disk có sf lạ (regenerate dưới chân panel) → reject
await t('S5: stale-doc — sf lạ trên disk → reject không ghi', async () => {
  const root = mkRoot()
  const target = join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii')
  const diskDoc = mkDoc('G2')
  diskDoc.nodes.push({ id: 'sf-3', kind: 'sf', title: 'Mới trên disk', state: 'pending', tier: 2 })
  writeFileSync(target, ser(diskDoc))
  const r = await saveWakiiStory(orca, 'vi-1.wakii', ser(mkDoc('G1')), 'G0', [], { roots: [root], runKit: validatorOk })
  assert(!r.ok && r.error === 'stale-doc', 'phải stale-doc: ' + JSON.stringify(r))
  assert(JSON.stringify(r.staleSfs) === '["sf-3"]', 'staleSfs sai: ' + JSON.stringify(r.staleSfs))
  // sf-3 nằm trong deletedIds → không còn stale
  const r2 = await saveWakiiStory(orca, 'vi-1.wakii', ser(mkDoc('G1')), 'G0', ['sf-3'], { roots: [root], runKit: validatorOk })
  assert(r2.ok, 'deletedIds không được tính stale: ' + r2.error)
})

// S6 — path-escape + guard matrix
await t('S6: guards — .. / \\/ ký tự + size cap', async () => {
  const root = mkRoot()
  for (const bad of ['../evil.wakii', 'a/b.wakii', 'a\\b.wakii', 'doc.md', '']) {
    const r = await saveWakiiStory(orca, bad, ser(mkDoc('G1')), null, [], { roots: [root], runKit: validatorOk })
    assert(!r.ok, 'phải reject: ' + JSON.stringify(bad))
  }
  const big = 'x'.repeat(210 * 1024)
  const r = await saveWakiiStory(orca, 'vi-1.wakii', big, null, [], { roots: [root], runKit: validatorOk })
  assert(!r.ok && /200KB/.test(r.error), 'size cap không chặn: ' + r.error)
  const r2 = await saveWakiiStory(orca, 'vi-1.wakii', 'not json', null, [], { roots: [root], runKit: validatorOk })
  assert(!r2.ok && /JSON/.test(r2.error), 'JSON parse không chặn')
})

// S7 — file mới: không có sẵn → ghi vào root đầu (mkdir)
await t('S7: file mới — ghi root[0] + mkdir', async () => {
  const root = mkRoot()
  rmSync(join(root, 'docs', 'superpowers', 'mindmaps'), { recursive: true, force: true })
  const incoming = ser(mkDoc('G1'))
  const r = await saveWakiiStory(orca, 'vi-1.wakii', incoming, null, [], { roots: [root], runKit: validatorOk })
  assert(r.ok, 'fail: ' + r.error)
  assert(readFileSync(join(root, 'docs', 'superpowers', 'mindmaps', 'vi-1.wakii'), 'utf8') === incoming, 'file mới sai nội dung')
})

// S8 — parseWakiiMeta matrix
await t('S8: parseWakiiMeta — valid/invalid', async () => {
  const meta = parseWakiiMeta(ser(mkDoc('G1')), 'vi-1.wakii')
  assert(meta && meta.linear === 'VI-1' && meta.file === 'vi-1.wakii' && meta.source === 'wakii', 'meta sai: ' + JSON.stringify(meta))
  assert(meta.sfCount === 2, 'sfCount sai')
  assert(parseWakiiMeta('not json', 'f') === null, 'json hỏng phải null')
  assert(parseWakiiMeta('{"broken":1}', 'f') === null, 'thiếu magic phải null')
  const noEpic = mkDoc('G1'); noEpic.meta.epic = 'không-hợp-lệ'
  assert(parseWakiiMeta(ser(noEpic), 'f') === null, 'epic sai format phải null')
})

console.log(results.join('\n'))
console.log(fail ? 'WAKII-SAVE-FAIL ' + fail : 'WAKII-SAVE-PASS 8/8')
process.exit(fail ? 1 : 0)
