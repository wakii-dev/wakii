#!/usr/bin/env node
// Negative-test harness cho installKit (FI-382) + guard advisory #22 — mock
// orca (capture notifications.show/log) + temp root. KHÔNG BAO GIỜ ghi HOME
// thật: mọi case truyền `root` + `kitRoot` trong tmpdir(); cuối run so marker
// ~/.claude trước/sau — lệch = FAIL cứng.
// Chạy: node tests/kit-manifest-negative-tests.mjs
// KIT_MAIN=<path main.mjs> — override target (demo đỏ trên code cũ).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const mainPath = resolve(testsDir, process.env.KIT_MAIN || '../main.mjs')
const realKitDir = resolve(testsDir, '../kit')
const { installKit, runKit, assertCapability, kitBinCatalog, setKitGuardLogger, resetKitRepeatGuard } = await import(mainPath)

// ---- mock orca: capture notifications.show + log -------------------------
function mockOrca({ toastFails = false } = {}) {
  const calls = { notifications: [], logs: [] }
  const orca = {
    calls,
    host: {
      call: async (action, payload) => {
        if (action === 'notifications.show') {
          if (toastFails) throw new Error('toast unavailable')
          calls.notifications.push(payload)
        }
        return { ok: true }
      }
    },
    log: (...a) => { calls.logs.push(a.join(' ')) }
  }
  setKitGuardLogger((line) => orca.log(line)) // guard log (#22) → cùng kênh capture
  return orca
}

// ---- kit fixture ----------------------------------------------------------
// Kit HỢP LỆ tối thiểu: 1 skill + 1 agent + 1 bin, provides khớp đĩa 2 chiều.
function buildValidKit(kitRoot, { version = '2.2.0' } = {}) {
  mkdirSync(join(kitRoot, 'skills', 'alpha'), { recursive: true })
  writeFileSync(join(kitRoot, 'skills', 'alpha', 'SKILL.md'), '# alpha (new)')
  mkdirSync(join(kitRoot, 'agents'), { recursive: true })
  writeFileSync(join(kitRoot, 'agents', 'beta.md'), 'beta body')
  mkdirSync(join(kitRoot, 'bin'), { recursive: true })
  writeFileSync(join(kitRoot, 'bin', 'gamma'), '#!/bin/sh\n')
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify({
    version,
    provides: [
      { name: 'alpha', type: 'skill', inputs: ['idea'], outputs: 'plan', owner: 'wakii' },
      { name: 'beta', type: 'agent', inputs: ['diff'], outputs: 'verdict', owner: 'wakii' },
      { name: 'gamma', type: 'bin', description: 'gamma cli' }
    ]
  }, null, 2))
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `kit-harness-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp root ngoài tmpdir — dừng')
  return dir
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ---- runner ---------------------------------------------------------------
let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}
async function runCase(caseId, fn) {
  console.log(`\n== ${caseId} ==`)
  resetKitRepeatGuard() // repeat-guard state trong module — mỗi case chạy độc lập
  try { await fn() } catch (err) {
    fail++
    failures.push(`${caseId} CRASHED: ${err.message}`)
    console.log(`  [FAIL] ${caseId} crashed: ${err.message}`)
  }
}

const homeMarker = join(process.env.HOME || '', '.claude', '.story-team-kit-version')
const homeMarkerBefore = existsSync(homeMarker) ? readFileSync(homeMarker, 'utf8') : null

// [a] thiếu field → notify + không copy + marker không đổi
await runCase('[a] missing-field', async () => {
  const kitRoot = tempDir('a-kit')
  const root = tempDir('a-root')
  buildValidKit(kitRoot)
  const m = JSON.parse(readFileSync(join(kitRoot, 'kit.json'), 'utf8'))
  delete m.provides.find(e => e.name === 'alpha').outputs // thiếu field bắt buộc (skill)
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify(m, null, 2))
  writeFileSync(join(root, '.story-team-kit-version'), '2.1.1') // marker cũ phải giữ nguyên
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[a]', 'return false (blocked)', r === false, `got ${r}`)
  check('[a]', 'notify đúng 1 lần', orca.calls.notifications.length === 1, `got ${orca.calls.notifications.length}`)
  check('[a]', 'notify nói thiếu outputs', (orca.calls.notifications[0]?.body || '').includes('outputs'))
  check('[a]', 'KHÔNG copy (root/skills không tồn tại)', !existsSync(join(root, 'skills')))
  check('[a]', 'marker không đổi (2.1.1)', readFileSync(join(root, '.story-team-kit-version'), 'utf8').trim() === '2.1.1')
})

// [b] entry ảo (provides không có trên đĩa) → block
await runCase('[b] ghost-entry', async () => {
  const kitRoot = tempDir('b-kit')
  const root = tempDir('b-root')
  buildValidKit(kitRoot)
  const m = JSON.parse(readFileSync(join(kitRoot, 'kit.json'), 'utf8'))
  m.provides.push({ name: 'ghost', type: 'bin', description: 'không tồn tại trên đĩa' })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify(m, null, 2))
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[b]', 'return false (blocked)', r === false, `got ${r}`)
  check('[b]', 'notify đúng 1 lần', orca.calls.notifications.length === 1, `got ${orca.calls.notifications.length}`)
  check('[b]', 'notify nhắc entry ghost', (orca.calls.notifications[0]?.body || '').includes('ghost'))
  check('[b]', 'KHÔNG copy', !existsSync(join(root, 'skills')) && !existsSync(join(root, 'bin')))
  check('[b]', 'KHÔNG ghi marker', !existsSync(join(root, '.story-team-kit-version')))
})

// [c] hai chiều đĩa↔provides trên bản copy kit THẬT: xóa file thật → block; file lạc → block
await runCase('[c] disk-drift', async () => {
  const kitRoot = tempDir('c-kit')
  const root = tempDir('c-root')
  cpSync(realKitDir, kitRoot, { recursive: true }) // kit thật → temp copy (chỉ đọc nguồn)
  const firstAgent = readdirSync(join(kitRoot, 'agents')).find(f => f.endsWith('.md'))
  rmSync(join(kitRoot, 'agents', firstAgent)) // xóa file thật
  writeFileSync(join(kitRoot, 'bin', 'zz-orphan.sh'), '#!/bin/sh\n') // file lạc không entry
  const orphanName = 'zz-orphan.sh'
  const deletedName = firstAgent.replace(/\.md$/, '')
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[c]', 'return false (blocked)', r === false, `got ${r}`)
  check('[c]', 'notify đúng 1 lần', orca.calls.notifications.length === 1, `got ${orca.calls.notifications.length}`)
  const body = orca.calls.notifications[0]?.body || ''
  check('[c]', 'bắt file bị xóa (provides→đĩa)', body.includes(deletedName), body.slice(0, 120))
  check('[c]', 'bắt file lạc (đĩa→provides)', body.includes(orphanName), body.slice(0, 160))
  check('[c]', 'KHÔNG copy', !existsSync(join(root, 'skills')))
})

// [d] marker cũ (2.1.1) + kit mới (2.2.0) hợp lệ → re-validate + copy chạy
await runCase('[d] version-revalidate', async () => {
  const kitRoot = tempDir('d-kit')
  const root = tempDir('d-root')
  buildValidKit(kitRoot, { version: '2.2.0' })
  // mô phỏng install cũ: marker 2.1.1 + nội dung cũ trên root
  mkdirSync(join(root, 'skills', 'alpha'), { recursive: true })
  writeFileSync(join(root, 'skills', 'alpha', 'SKILL.md'), '# alpha (OLD)')
  writeFileSync(join(root, '.story-team-kit-version'), '2.1.1')
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[d]', 'return true (copy chạy)', r === true, `got ${r}`)
  check('[d]', 'KHÔNG notify', orca.calls.notifications.length === 0, `got ${orca.calls.notifications.length}`)
  check('[d]', 'copy GHI ĐÈ nội dung cũ', readFileSync(join(root, 'skills', 'alpha', 'SKILL.md'), 'utf8') === '# alpha (new)')
  check('[d]', 'marker lên 2.2.0', readFileSync(join(root, '.story-team-kit-version'), 'utf8').trim() === '2.2.0')
})

// [e] malformed kit.json → notify + block (không còn chết lặng lẽ)
await runCase('[e] malformed-json', async () => {
  const kitRoot = tempDir('e-kit')
  const root = tempDir('e-root')
  buildValidKit(kitRoot)
  writeFileSync(join(kitRoot, 'kit.json'), '{oops not json')
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[e]', 'return false (blocked)', r === false, `got ${r}`)
  check('[e]', 'notify đúng 1 lần', orca.calls.notifications.length === 1, `got ${orca.calls.notifications.length}`)
  check('[e]', 'notify nói malformed', (orca.calls.notifications[0]?.body || '').includes('malformed'))
  check('[e]', 'KHÔNG copy', !existsSync(join(root, 'skills')))
  check('[e]', 'KHÔNG ghi marker', !existsSync(join(root, '.story-team-kit-version')))
})

// [f] thiếu kit.json → silent no-op (giữ nguyên, plugin chạy riêng vẫn OK)
await runCase('[f] missing-kitjson', async () => {
  const kitRoot = tempDir('f-kit')
  const root = tempDir('f-root')
  mkdirSync(join(kitRoot, 'skills'), { recursive: true }) // có đĩa nhưng KHÔNG kit.json
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[f]', 'return true (no-op)', r === true, `got ${r}`)
  check('[f]', 'silent: 0 notify, 0 log', orca.calls.notifications.length === 0 && orca.calls.logs.length === 0)
  check('[f]', 'KHÔNG copy', !existsSync(join(root, 'skills')))
  check('[f]', 'KHÔNG ghi marker', !existsSync(join(root, '.story-team-kit-version')))
})

// [g] notification fail → orca.log fallback (spec: fire-and-forget .catch)
await runCase('[g] toast-fallback', async () => {
  const kitRoot = tempDir('g-kit')
  const root = tempDir('g-root')
  buildValidKit(kitRoot)
  writeFileSync(join(kitRoot, 'kit.json'), '{oops not json') // malformed → fail path
  const orca = mockOrca({ toastFails: true })
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[g]', 'return false (blocked)', r === false, `got ${r}`)
  check('[g]', 'KHÔNG notify (toast chết)', orca.calls.notifications.length === 0, `got ${orca.calls.notifications.length}`)
  check('[g]', 'fallback log đúng 1 dòng', orca.calls.logs.length === 1, `got ${orca.calls.logs.length}`)
  check('[g]', 'log nói blocked + malformed', (orca.calls.logs[0] || '').includes('blocked') && (orca.calls.logs[0] || '').includes('malformed'))
  check('[g]', 'KHÔNG copy', !existsSync(join(root, 'skills')))
})

// [h] duplicate-id WITHIN provides[] → fail liệt kê entry trùng (Qwen-Agent
// register_tool: id catalog phải unique — file có thật nên chỉ guard này bắt được)
await runCase('[h] duplicate-id', async () => {
  const kitRoot = tempDir('h-kit')
  const root = tempDir('h-root')
  buildValidKit(kitRoot)
  const m = JSON.parse(readFileSync(join(kitRoot, 'kit.json'), 'utf8'))
  m.provides.push({ name: 'gamma', type: 'bin', description: 'gamma cli — bản trùng' })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify(m, null, 2))
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[h]', 'return false (blocked)', r === false, `got ${r}`)
  check('[h]', 'notify đúng 1 lần', orca.calls.notifications.length === 1, `got ${orca.calls.notifications.length}`)
  const body = orca.calls.notifications[0]?.body || ''
  check('[h]', 'notify liệt kê entry trùng gamma', body.includes('gamma') && body.includes('trùng'), body.slice(0, 160))
  check('[h]', 'KHÔNG copy', !existsSync(join(root, 'skills')) && !existsSync(join(root, 'bin')))
  check('[h]', 'KHÔNG ghi marker', !existsSync(join(root, '.story-team-kit-version')))
})

// [i] dispatch capability không tồn tại → chặn TRƯỚC spawn với lỗi đích danh
// (neovim lsp._unsupported_method: method %q is not supported)
await runCase('[i] capability-block', async () => {
  const kitRoot = tempDir('i-kit')
  mkdirSync(kitRoot, { recursive: true })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify({
    version: '2.2.0',
    provides: [{ name: 'gamma', type: 'bin', description: 'gamma cli' }]
  }, null, 2))
  const ghost = await runKit('story-ghost', [], { kitRoot })
  check('[i]', 'return ok:false (chặn trước spawn)', ghost.ok === false, JSON.stringify(ghost).slice(0, 120))
  check('[i]', 'blocked=capability', ghost.blocked === 'capability', JSON.stringify(ghost).slice(0, 120))
  check('[i]', 'lỗi đích danh story-ghost + provides', (ghost.error || '').includes('story-ghost') && (ghost.error || '').includes('provides'), (ghost.error || '').slice(0, 140))
  check('[i]', 'KHÔNG phải spawn/ENOENT error', !(ghost.error || '').includes('ENOENT') && !(ghost.error || '').includes('spawn'))
  check('[i]', 'capability có thật → ok', assertCapability('gamma', kitBinCatalog(kitRoot)).ok === true)
  check('[i]', 'không có kit.json → catalog null (pass-through)', kitBinCatalog(join(kitRoot, 'khong-co')) === null)
})

// [#22] reject-reason log: MỖI lần runKit blocked + MỖI lỗi pre-flight để lại
// 1 dòng log CÓ NHÃN nguồn, reason ≤200 ký tự — block-all giữ nguyên.
await runCase('[j] reject-reason-log', async () => {
  const kitRoot = tempDir('j-kit')
  mkdirSync(kitRoot, { recursive: true })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify({
    version: '2.2.0',
    provides: [{ name: 'gamma', type: 'bin', description: 'gamma cli' }]
  }, null, 2))
  const orca = mockOrca()
  const r1 = await runKit('story-ghost', [], { kitRoot })
  const r2 = await runKit('story-ghost', [], { kitRoot })
  check('[j]', 'block giữ nguyên (ok:false + blocked=capability)', r1.ok === false && r1.blocked === 'capability' && r2.blocked === 'capability')
  const capPrefix = "[guard:capability-check] blocked 'story-ghost' — "
  const capLines = orca.calls.logs.filter(l => l.startsWith('[guard:capability-check]'))
  check('[j]', 'log reject-reason MỖI lần chặn (2/2)', capLines.length === 2, `got ${capLines.length}`)
  check('[j]', 'log nêu bin bị chặn + lý do provides', capLines.every(l => l.startsWith(capPrefix) && l.includes('provides')), (capLines[0] || '').slice(0, 140))
  check('[j]', 'reason bị cắt ≤ 200 ký tự', capLines.every(l => l.slice(capPrefix.length).length <= 200))
  // pre-flight fail → 1 dòng [guard:kit-manifest], cutoff chặn summary dài
  const badKit = tempDir('j-kit2')
  const root = tempDir('j-root')
  buildValidKit(badKit)
  const m = JSON.parse(readFileSync(join(badKit, 'kit.json'), 'utf8'))
  const alpha = m.provides.find(e => e.name === 'alpha')
  delete alpha.outputs
  const beta = m.provides.find(e => e.name === 'beta')
  delete beta.inputs
  delete beta.owner
  m.provides.push({ name: 'ghost', type: 'bin', description: 'ảo' })
  m.provides.push({ name: 'gamma', type: 'bin', description: 'trùng gamma' })
  writeFileSync(join(badKit, 'kit.json'), JSON.stringify(m, null, 2))
  const orca2 = mockOrca()
  const r3 = await installKit(orca2, { root, kitRoot: badKit })
  await sleep(20)
  check('[j]', 'installKit vẫn block-all', r3 === false && !existsSync(join(root, 'skills')))
  const manPrefix = '[guard:kit-manifest] install blocked — '
  const manLines = orca2.calls.logs.filter(l => l.startsWith('[guard:kit-manifest]'))
  check('[j]', 'pre-flight fail để lại log nhãn [guard:kit-manifest]', manLines.length === 1, `got ${manLines.length}`)
  check('[j]', 'summary > 200 bị cắt (không phình log)', manLines.length === 1 && manLines[0].length > manPrefix.length && manLines[0].slice(manPrefix.length).length <= 200, `len=${(manLines[0] || '').length}`)
})

// [#22] repeat-guard advisory: gọi trùng (bin + args) chạm ngưỡng 3 → nhắc ĐÚNG
// 1 lần + advisory field; gọi khác → counter reset. Không veto.
await runCase('[k] repeat-guard', async () => {
  const kitRoot = tempDir('k-kit')
  mkdirSync(kitRoot, { recursive: true })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify({
    version: '2.2.0',
    provides: [{ name: 'k-probe', type: 'bin', description: 'repeat probe' }]
  }, null, 2))
  const orca = mockOrca()
  const call = () => runKit('k-probe', ['x'], { kitRoot })
  const r1 = await call(), r2 = await call(), r3 = await call()
  check('[k]', 'lần 1-2 không advisory', !r1.advisory && !r2.advisory)
  check('[k]', 'lần 3 có advisory repeat=3', r3.advisory?.guard === 'repeat-tool-reminder' && r3.advisory.repeat === 3, JSON.stringify(r3.advisory))
  check('[k]', 'không veto: kết quả call vẫn trả (advisory chỉ cộng thêm)', r3.ok === r1.ok && r3.error === r1.error)
  const repeats = orca.calls.logs.filter(l => l.includes('[guard:repeat-tool-reminder]'))
  check('[k]', 'warning ĐÚNG 1 lần tại ngưỡng 3', repeats.length === 1 && repeats[0].includes('lần 3'), repeats.join(' | ').slice(0, 140))
  await runKit('k-probe', ['y-khac'], { kitRoot }) // gọi khác → counter reset
  const r4 = await call(), r5 = await call()
  check('[k]', 'reset: chuỗi mới chỉ 2 lần → không advisory', !r4.advisory && !r5.advisory)
  const r6 = await call()
  check('[k]', 'chuỗi mới chạm lại ngưỡng 3 → advisory lại', r6.advisory?.repeat === 3)
  check('[k]', 'tổng 2 reminder cho 2 chuỗi độc lập', orca.calls.logs.filter(l => l.includes('[guard:repeat-tool-reminder]')).length === 2)
})

// [#22] advisory KHÔNG block: lặp 9 lần — call vẫn trả kết quả mỗi lần, kết quả
// giống hệt baseline, reminder chỉ tại 3/5/8 (không noise thêm).
await runCase('[l] advisory-not-block', async () => {
  const kitRoot = tempDir('l-kit')
  mkdirSync(kitRoot, { recursive: true })
  writeFileSync(join(kitRoot, 'kit.json'), JSON.stringify({
    version: '2.2.0',
    provides: [{ name: 'l-probe', type: 'bin', description: 'advisory probe' }]
  }, null, 2))
  const orca = mockOrca()
  const call = () => runKit('l-probe', ['y'], { kitRoot })
  const results = []
  for (let i = 1; i <= 9; i++) results.push(await call())
  const baseline = results[0]
  check('[l]', 'mỗi call đều trả kết quả (không veto)', results.every(r => r && typeof r.ok === 'boolean' && typeof r.error === 'string'))
  check('[l]', 'ok/error giống hệt baseline ở mọi lần', results.every(r => r.ok === baseline.ok && r.error === baseline.error))
  check('[l]', 'advisory chỉ tại 3/5/8', results.map(r => r.advisory?.repeat ?? 0).join(',') === '0,0,3,0,5,0,0,8,0', results.map(r => r.advisory?.repeat ?? 0).join(','))
  check('[l]', 'lần 9 không mang advisory (tần suất thấp)', results[8].advisory === undefined)
  const repeats = orca.calls.logs.filter(l => l.includes('[guard:repeat-tool-reminder]'))
  check('[l]', 'đúng 3 dòng reminder (3/5/8), không spam', repeats.length === 3, `got ${repeats.length}`)
})

// [+ control dương] kit hợp lệ → copy + marker + 0 notify
await runCase('[+] valid-control', async () => {
  const kitRoot = tempDir('p-kit')
  const root = tempDir('p-root')
  buildValidKit(kitRoot)
  const orca = mockOrca()
  const r = await installKit(orca, { root, kitRoot })
  await sleep(20)
  check('[+]', 'return true', r === true, `got ${r}`)
  check('[+]', 'copy đủ 3 loại', existsSync(join(root, 'skills', 'alpha', 'SKILL.md')) && existsSync(join(root, 'agents', 'beta.md')) && existsSync(join(root, 'bin', 'gamma')))
  check('[+]', 'marker 2.2.0', readFileSync(join(root, '.story-team-kit-version'), 'utf8').trim() === '2.2.0')
  check('[+]', 'KHÔNG notify', orca.calls.notifications.length === 0)
})

// ---- HOME guard (exit criterion cứng) --------------------------------------
const homeMarkerAfter = existsSync(homeMarker) ? readFileSync(homeMarker, 'utf8') : null
console.log('\n== HOME guard ==')
check('guard', 'marker ~/.claude không đổi', homeMarkerBefore === homeMarkerAfter,
  `before=${JSON.stringify(homeMarkerBefore)} after=${JSON.stringify(homeMarkerAfter)}`)

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL — target: ${mainPath} ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (12 cases [a]-[l] + positive control + HOME guard)')
