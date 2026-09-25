import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9353')
const page = browser.contexts().flatMap((c) => c.pages())[0]

const snap = async (label) => {
  const s = await page.evaluate(() => ({
    ann: document.querySelectorAll('.orca-git-blame-annotation').length,
    dirty: window.__store.getState().openFiles?.some((f) => f.isDirty) ?? null,
    cursorLine: (() => {
      const cur = document.querySelector('.current-line')
      // cheap: count preceding siblings is unreliable; report presence only
      return Boolean(cur)
    })()
  }))
  console.log(label, JSON.stringify(s))
}

await page.click('.monaco-editor .view-lines')
await snap('after-click       ')
for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp')
await page.waitForTimeout(800)
await snap('after-top         ')
await page.keyboard.press('Control+End')
await page.waitForTimeout(600)
await snap('after-ctrl-end    ')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await snap('after-enter+300   ')
await page.waitForTimeout(1500)
await snap('after-enter+1800  ')
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(600)
await snap('after-arrowleft   ')
// undo everything
for (let i = 0; i < 10; i++) {
  const dirty = await page.evaluate(
    () => window.__store.getState().openFiles?.some((f) => f.isDirty) ?? false
  )
  if (!dirty) break
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(120)
}
await page.waitForTimeout(800)
await snap('after-undo        ')
await browser.close()
