// CDP evidence for item 3: expand src > components so depth-2 rows exist, screenshot.
// Usage: node shot3.mjs <output-name.png>
import { chromium } from 'playwright-core'

const out = process.argv[2]
if (!out) {
  console.error('usage: node shot3.mjs <output.png>')
  process.exit(1)
}
const browser = await chromium.connectOverCDP('http://127.0.0.1:9492')
try {
  const contexts = browser.contexts()
  let page = null
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes('localhost:5173')) {
        page = p
        break
      }
    }
    if (page) {
      break
    }
  }
  if (!page) {
    console.error('NO_PAGE')
    process.exit(2)
  }
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-file-explorer-row]')]
    const texts = rows.map((r) => r.textContent?.trim() ?? '')
    return { count: rows.length, sample: texts.slice(0, 25) }
  })
  console.log('ROWS', JSON.stringify(info))

  // Ensure explorer files view visible and expand src > components if not already.
  const clicked = await page.evaluate(() => {
    const clickRow = (prefix) => {
      const rows = [...document.querySelectorAll('[data-file-explorer-row]')]
      const row = rows.find((r) => (r.textContent?.trim() ?? '').startsWith(prefix))
      if (!row) {
        return `missing:${prefix}`
      }
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return `clicked:${prefix}`
    }
    return [clickRow('src'), clickRow('components')].join(' | ')
  })
  console.log('CLICKS', clicked)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: out })
  console.log('SHOT', out)
} finally {
  await browser.close()
}
