/**
 * Rule 0 CLI-equivalent for SF-2 (main-process/packaging slice — no web port to drive).
 *
 * Proxy per the run checklist: launch the REAL built app via Playwright _electron with a
 * `.wakii` path on cold-start argv, then drive the real ipcMain surfaces:
 *   - consume-pending pulled twice (second call must be empty — consume semantics)
 *   - app.emit('open-file') through the REAL handler while running (push path)
 *   - same path + same content re-open → skipped by the main-side hash dedupe
 *   - same path + changed content → re-pushed (refresh)
 *   - broken JSON → per-file schema error → toast (visible in screenshot)
 *
 * Background policy: ORCA_BACKGROUND_LAUNCH=1 keeps the window off-screen; screenshots come
 * from CDP capture of the hidden renderer. No show()/focus/activation anywhere.
 */
import { _electron } from 'playwright'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = process.cwd()
const EVIDENCE = join(REPO, 'docs/superpowers/evidence/sf-2-app-open-wakii')

const work = mkdtempSync(join(tmpdir(), 'wakii-rule0-'))
const userData = join(work, 'userdata')
mkdirSync(userData, { recursive: true })
const validPath = join(work, 'vu-14.wakii')
const brokenPath = join(work, 'broken.wakii')

const validDoc = {
  wakiiMindmap: 1,
  meta: {
    story: 'VU-14 — mindmap.wakii',
    epic: 'VU-14',
    dest: 'story/vu-14-mindmap-wakii',
    generatedAt: '2026-09-27T13:00:00.000Z',
    generator: 'story-mindmap 1.0.0 (rule0)'
  },
  nodes: [
    { id: 'epic', kind: 'epic', title: 'VU-14 — mindmap.wakii', state: 'in-progress' },
    { id: 'sf-1', kind: 'sf', title: 'SF-1 Schema + sinh file .wakii', state: 'done', tier: 0 },
    { id: 'sf-2', kind: 'sf', title: 'SF-2 App mở file .wakii', state: 'in-progress', tier: 1 }
  ],
  edges: [
    { from: 'epic', to: 'sf-1', rel: 'contains' },
    { from: 'epic', to: 'sf-2', rel: 'contains' },
    { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
  ]
}
writeFileSync(validPath, JSON.stringify(validDoc))
writeFileSync(brokenPath, '{"wakiiMindmap": 1, ')

const receivedFor = (path) =>
  consoleMarkers.filter((m) => m.includes('received mindmap') && m.includes(path))
const consoleMarkers = []
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`[rule0] ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` · ${detail}` : ''}`)
  if (!ok) {
    failures.push(name)
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (probe, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe()) {
      return true
    }
    await sleep(500)
  }
  failures.push(label)
  return false
}

const emitOpenFile = (path) =>
  app.evaluate(({ app }, p) => {
    app.emit('open-file', { preventDefault() {} }, p)
  }, path)

console.log(`[rule0] launching real app: cwd=${REPO} argv=[. ${validPath}]`)
const app = await _electron.launch({
  args: ['.', validPath],
  cwd: REPO,
  env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_DEV_USER_DATA_PATH: userData }
})

try {
  const window = await app.firstWindow()
  window.on('console', (message) => consoleMarkers.push(message.text()))

  // 1) Cold-start argv receipt: the renderer bridge drains what main captured pre-ready.
  const coldStartReceived = await waitFor(
    () => receivedFor(validPath).length >= 1,
    90_000,
    'cold-start receipt'
  )
  check(
    'cold-start argv .wakii → renderer receipt marker',
    coldStartReceived,
    receivedFor(validPath)[0] ?? 'no marker'
  )

  // 2) Consume semantics on the live handler: the bridge already drained, so a second
  //    pull must come back empty.
  let secondPull = null
  const drained = await waitFor(
    async () => {
      secondPull = await window.evaluate(() => window.api.ui.consumePendingWakiiFileOpens())
      return Array.isArray(secondPull) && secondPull.length === 0
    },
    30_000,
    'second consume empty'
  )
  check('consume-pending lần 2 → rỗng (consume semantics)', drained, JSON.stringify(secondPull))

  await window.screenshot({ path: join(EVIDENCE, 'rule0-cold-start.png') })

  // 3) Push path through the REAL open-file handler: broken JSON → per-file schema error toast.
  await emitOpenFile(brokenPath)
  let toastVisible = true
  try {
    await window.waitForSelector('[data-sonner-toast]', { timeout: 20_000 })
  } catch {
    toastVisible = false
  }
  const schemaErrorLogged = consoleMarkers.some((m) => m.includes('[wakii-open] failed'))
  check('file hỏng → error payload → toast bề mặt', toastVisible && schemaErrorLogged)
  await window.screenshot({ path: join(EVIDENCE, 'rule0-error-toast.png') })

  // 4) Dedupe: re-open the same path with identical content → no second receipt.
  await emitOpenFile(validPath)
  await sleep(4_000)
  check(
    'mở lại cùng path + cùng content-hash → KHÔNG đẩy lại (dedupe)',
    receivedFor(validPath).length === 1,
    `receipts=${receivedFor(validPath).length}`
  )

  // 5) Refresh: same path, changed content → re-pushed.
  validDoc.meta.generator = 'story-mindmap 2.0.0 (rule0-changed)'
  writeFileSync(validPath, JSON.stringify(validDoc))
  await emitOpenFile(validPath)
  const refreshed = await waitFor(() => receivedFor(validPath).length === 2, 20_000, 'refresh push')
  check('cùng path + hash khác → đẩy lại (refresh)', refreshed)

  // Markers observed in the live renderer console — the receipt evidence trail.
  console.log('[rule0] console markers:')
  for (const marker of consoleMarkers.filter((m) => m.includes('wakii'))) {
    console.log('  ·', marker)
  }
  console.log(
    `[rule0] RESULT: ${failures.length === 0 ? 'ALL PASS' : `FAILED: ${failures.join(' | ')}`}`
  )
  process.exitCode = failures.length === 0 ? 0 : 1
} catch (error) {
  console.log(`[rule0] RESULT: CRASH — ${error.message}`)
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
  rmSync(work, { recursive: true, force: true })
}
