// CDP evidence for item 4: search results UX (expand/collapse-all, keyboard nav, history).
// Usage: node shot4.mjs
import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9492')
try {
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('localhost:5173'))
  if (!page) {
    throw new Error('NO_PAGE')
  }

  // 1. Switch to Contents view.
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('button')]
    const contents = tabs.find((b) => (b.textContent?.trim() ?? '') === 'Contents')
    contents?.click()
  })
  await page.waitForTimeout(600)

  // 2. Type a query into the search input.
  const input = page.locator('input[aria-label="Search files"]')
  await input.fill('function')
  await page.waitForTimeout(2500)

  const resultInfo = await page.evaluate(() => {
    const summary = document.querySelector('[data-testid="search-expand-all"]')
    const matchRows = document.querySelectorAll('[data-search-row-type="match"]')
    const fileRows = document.querySelectorAll('[data-search-row-type="file"]')
    return {
      hasExpandAll: Boolean(summary),
      hasCollapseAll: Boolean(document.querySelector('[data-testid="search-collapse-all"]')),
      matchRows: matchRows.length,
      fileRows: fileRows.length
    }
  })
  console.log('RESULTS', JSON.stringify(resultInfo))
  await page.screenshot({ path: 'item4-results.png' })
  console.log('SHOT item4-results.png')

  // 3. Collapse all.
  await page.evaluate(() => {
    document.querySelector('[data-testid="search-collapse-all"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
  })
  await page.waitForTimeout(500)
  const collapsedInfo = await page.evaluate(() => ({
    matchRows: document.querySelectorAll('[data-search-row-type="match"]').length,
    fileRows: document.querySelectorAll('[data-search-row-type="file"]').length
  }))
  console.log('COLLAPSED', JSON.stringify(collapsedInfo))
  await page.screenshot({ path: 'item4-collapsed.png' })
  console.log('SHOT item4-collapsed.png')

  // 4. Expand all again.
  await page.evaluate(() => {
    document.querySelector('[data-testid="search-expand-all"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
  })
  await page.waitForTimeout(500)
  const expandedInfo = await page.evaluate(() => ({
    matchRows: document.querySelectorAll('[data-search-row-type="match"]').length
  }))
  console.log('EXPANDED', JSON.stringify(expandedInfo))

  // 5. Keyboard nav: focus first match row, ArrowDown to the next match row.
  const keyNav = await page.evaluate(() => {
    const first = document.querySelector('[data-search-row-type="match"] button')
    first?.focus()
    return document.activeElement?.getAttribute('data-search-row-index') ?? 'none'
  })
  console.log('FOCUS_FIRST_ROW_INDEX', keyNav)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  const keyNavAfter = await page.evaluate(() => {
    const el = document.activeElement
    return {
      row: el?.closest('[data-search-row-type]')?.getAttribute('data-search-row-index') ?? 'none',
      isMatch: el?.closest('[data-search-row-type="match"]') !== null
    }
  })
  console.log('ARROW_DOWN', JSON.stringify(keyNavAfter))

  // 6. Escape clears row focus.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const afterEscape = await page.evaluate(() => ({
    activeIsBody: document.activeElement === document.body
  }))
  console.log('ESCAPE', JSON.stringify(afterEscape))

  // 7. Record query into history (Enter) then clear and focus to show dropdown.
  await input.focus()
  await page.keyboard.press('Enter')
  await input.blur()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const clear = [...document.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '') === 'Clear search'
    )
    clear?.click()
  })
  await page.waitForTimeout(400)
  await input.focus()
  await page.waitForTimeout(400)
  const historyInfo = await page.evaluate(() => ({
    dropdown: Boolean(document.querySelector('[data-testid="search-history-dropdown"]')),
    items: document.querySelectorAll('[data-testid="search-history-item"]').length
  }))
  console.log('HISTORY', JSON.stringify(historyInfo))
  await page.screenshot({ path: 'item4-history.png' })
  console.log('SHOT item4-history.png')

  // 8. Click first history item -> query refilled.
  await page.evaluate(() => {
    document.querySelector('[data-testid="search-history-item"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
  })
  await page.waitForTimeout(600)
  const refill = await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Search files"]')
    return { value: el?.value ?? '', matchRows: document.querySelectorAll('[data-search-row-type="match"]').length }
  })
  console.log('REFILL', JSON.stringify(refill))
} finally {
  await browser.close()
}
