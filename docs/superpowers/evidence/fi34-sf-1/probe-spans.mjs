import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9353')
const page = browser.contexts().flatMap((c) => c.pages())[0]

const dump = async (label) => {
  const s = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.orca-git-blame-annotation'))
    return spans.map((sp) => {
      const lineEl = sp.closest('.view-line')
      const lineIndex = lineEl
        ? Array.from(lineEl.parentElement.children).indexOf(lineEl)
        : -1
      return { lineIndex: lineIndex + 1, text: sp.textContent }
    })
  })
  console.log(label, JSON.stringify(s))
}

await page.click('.monaco-editor .view-lines')
await page.waitForTimeout(400)
await dump('after-click  ')
for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp')
await page.waitForTimeout(800)
await dump('after-top    ')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(600)
await dump('after-down   ')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(600)
await dump('after-down2  ')
await browser.close()
