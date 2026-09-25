import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9353')
const page = browser.contexts().flatMap((c) => c.pages())[0]

const errors = []
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(msg.type().toUpperCase() + ': ' + msg.text().slice(0, 300))
  }
})

// dismiss any crash dialog
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const close = btns.find((b) => /close|dismiss|later|ok|report/i.test(b.innerText ?? ''))
  close?.click()
  document.querySelector('[data-slot="dialog-content"] [data-slot="dialog-close"]')?.click()
})
await page.keyboard.press('Escape')
await page.waitForTimeout(800)

await page.reload()
await page.waitForTimeout(6000)

const state = await page.evaluate(() => ({
  monaco: Boolean(document.querySelector('.monaco-editor')),
  dialog: Boolean(document.querySelector('[data-slot="dialog-content"]')),
  activeTabType: window.__store?.getState()?.activeTabType ?? null,
  screen: document.body.innerText.slice(0, 120)
}))
console.log('STATE:', JSON.stringify(state))
console.log('ERRORS CAPTURED:', errors.length)
for (const e of errors.slice(0, 12)) console.log(' -', e.slice(0, 250))
await browser.close()
