// CDP screenshot helper for evidence capture (not committed).
// Usage: node shot.mjs <output-name.png> [selector-scroll-into-view]
import { chromium } from 'playwright-core'

const out = process.argv[2]
if (!out) {
  console.error('usage: node shot.mjs <output.png>')
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
  await page.waitForTimeout(600)
  await page.screenshot({ path: out })
  console.log('SHOT', out)
} finally {
  await browser.close()
}
