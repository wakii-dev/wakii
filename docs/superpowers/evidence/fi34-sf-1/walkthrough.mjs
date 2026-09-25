import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const CDP = process.argv[2] ?? 'http://127.0.0.1:9353'
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SHOT = (name) => `${OUT}${name}`
mkdirSync(OUT, { recursive: true })

const browser = await chromium.connectOverCDP(CDP)
const page = browser.contexts().flatMap((c) => c.pages())[0]
if (!page) throw new Error('no renderer page')

// Leave onboarding/settings overlays if present
for (const label of ['Back to app', 'Done']) {
  const btn = page.getByText(label, { exact: true }).first()
  try {
    if (await btn.isVisible({ timeout: 1500 })) {
      await btn.click()
      await page.waitForTimeout(1500)
    }
  } catch {}
}

const results = []
const note = (sc, ok, detail) => {
  results.push({ sc, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${sc}: ${detail}`)
}

// --- Open the editor on an already-committed file (nx.json) ---
await page.evaluate(() => {
  const s = window.__store.getState()
  const wt = Object.values(s.worktreesByRepo).flat().find((w) => w.id === s.activeWorktreeId)
  s.openFile({
    filePath: `${wt.path}/nx.json`,
    relativePath: 'nx.json',
    worktreeId: wt.id,
    language: 'json',
    mode: 'edit'
  })
})
await page.waitForSelector('.monaco-editor', { timeout: 45000 })
await page.waitForTimeout(1500)

// Ensure clean tab before interactions (previous runs may leave drafts)
for (let i = 0; i < 30; i++) {
  const dirty = await page.evaluate(
    () => window.__store.getState().openFiles?.some((f) => f.isDirty) ?? false
  )
  if (!dirty) break
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(120)
}

const blameCount = () =>
  page.evaluate(() => document.querySelectorAll('.orca-git-blame-annotation').length)
const hoverText = () =>
  page.evaluate(() => document.querySelector('.monaco-hover')?.innerText?.slice(0, 400) ?? '')

// --- SC1: annotation shows on the cursor line ---
await page.click('.monaco-editor .view-lines')
await page.keyboard.press('Control+Home')
await page.waitForTimeout(2500)
const sc1Count = await blameCount()
await page.screenshot({ path: SHOT('sc1-annotation-line1.png') })
note('SC1', sc1Count > 0, `inline blame decoration visible on cursor line (count=${sc1Count})`)

// cursor move repaints (still 1 annotation, different line) — no fetch on move is unit-covered
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(400)
const sc1b = await blameCount()
note('SC1b', sc1b > 0, `annotation follows cursor to next line (count=${sc1b})`)

// --- SC2: hover shows blame detail as plain text ---
const box = await page.locator('.monaco-editor .view-lines').boundingBox()
if (box) {
  // move onto a real text line's middle, wiggle to trigger the hover mouse handler
  await page.mouse.move(box.x + 120, box.y + 20, { steps: 4 })
  await page.waitForTimeout(700)
  await page.mouse.move(box.x + 122, box.y + 22, { steps: 2 })
}
try {
  await page.waitForSelector('.monaco-hover', { timeout: 12000 })
} catch {}
await page.waitForTimeout(1500)
const hov = await hoverText()
await page.screenshot({ path: SHOT('sc2-hover.png') })
const hasMeta = /Commit|Author|Date/i.test(hov)
const noEmail = !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(hov)
const noHtmlTag = !/<(a|img|script|iframe)\b/i.test(hov)
note('SC2', Boolean(hov) && hasMeta && noEmail && noHtmlTag,
  `hover text present=${Boolean(hov)}, labels=${hasMeta}, no-email=${noEmail}, no-html=${noHtmlTag}; text=${JSON.stringify(hov.slice(0, 120))}`)

// --- SC5: "You" for a newly inserted (unsaved) tail line — keyboard draft only ---
await page.click('.monaco-editor .view-lines')
await page.keyboard.press('Control+End')
await page.waitForTimeout(400)
await page.keyboard.press('Enter')
// React flushes isDirty well inside this window; the Enter cursor event itself
// fired before the flush, so re-fire cursor moves on/around the inserted line.
await page.waitForTimeout(900)
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(300)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(600)
const sc5Count = await blameCount()
const sc5Text = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.orca-git-blame-annotation')).map((el) => el.textContent)
)
await page.screenshot({ path: SHOT('sc5-you-inserted.png') })
const youVisible = sc5Text.some((t) => /You/i.test(t ?? ''))
note('SC5', sc5Count > 0 && youVisible, `You/inserted annotation (count=${sc5Count}, text=${JSON.stringify(sc5Text.slice(0, 3))})`)

// undo the draft fully
for (let i = 0; i < 30; i++) {
  const dirty = await page.evaluate(
    () => window.__store.getState().openFiles?.some((f) => f.isDirty) ?? false
  )
  if (!dirty) break
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(120)
}
const cleanAgain = await page.evaluate(
  () => window.__store.getState().openFiles?.some((f) => f.isDirty) ?? false
)
note('SC5b', !cleanAgain, `draft fully undone, tab clean=${!cleanAgain}`)

// --- SC3: settings toggle removes annotations instantly, restore after ---
await page.evaluate(() => window.__store.getState().updateSettings({ editorInlineBlameEnabled: false }))
await page.waitForTimeout(500)
const offCount = await blameCount()
await page.screenshot({ path: SHOT('sc3-toggle-off.png') })
note('SC3', offCount === 0, `toggle OFF removes decorations instantly (count=${offCount})`)

await page.evaluate(() => window.__store.getState().updateSettings({ editorInlineBlameEnabled: true }))
await page.waitForTimeout(2500)
// cursor move repaints at the (committed) cursor line once the feature is back on
await page.click('.monaco-editor .view-lines')
await page.keyboard.press('Control+Home')
await page.waitForTimeout(1200)
const backCount = await blameCount()
await page.screenshot({ path: SHOT('sc3-toggle-on-restored.png') })
note('SC3b', backCount > 0, `toggle ON restores decorations (count=${backCount})`)

writeFileSync(`${OUT}walkthrough-results.json`, JSON.stringify(results, null, 2))
console.log('DONE', JSON.stringify(results))
await browser.close()
