#!/usr/bin/env node
// Negative-test harness cho installKit (FI-382) — mock orca (capture
// notifications.show/log) + temp root. KHÔNG BAO GIỜ ghi HOME thật: mọi case
// truyền `root` + `kitRoot` trong tmpdir(); cuối run so marker ~/.claude
// trước/sau — lệch = FAIL cứng.
// Chạy: node tests/kit-manifest-negative-tests.mjs
// KIT_MAIN=<path main.mjs> — override target (demo đỏ trên code cũ).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const mainPath = resolve(testsDir, process.env.KIT_MAIN || '../main.mjs')
const realKitDir = resolve(testsDir, '../kit')
const { installKit } = await import(mainPath)

// ---- mock orca: capture notifications.show + log -------------------------
function mockOrca({ toastFails = false } = {}) {
  const calls = { notifications: [], logs: [] }
  return {
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
console.log('HARNESS GREEN (6 negative cases + positive control + HOME guard)')
