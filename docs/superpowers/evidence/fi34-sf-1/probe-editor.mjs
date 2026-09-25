import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9353')
const page = browser.contexts().flatMap((c) => c.pages())[0]

await page.waitForTimeout(4000)
const state = await page.evaluate(() => {
  const s = window.__store.getState()
  const fc = s.fileContents?.['C:/Users/hoivk/Documents/ict-rsa-web/nx.json']
  const editorArea = document.querySelector('.flex-1.min-h-0.relative, [class*=editor-surface]')
  return {
    activeTabType: s.activeTabType,
    fileContentPresent: Boolean(fc),
    fileContentLen: fc?.content?.length ?? 0,
    loadError: fc?.loadError ?? null,
    monacoInDom: Boolean(document.querySelector('.monaco-editor')),
    editorAreaText: editorArea?.innerText?.slice(0, 200) ?? null,
    viewLines: Boolean(document.querySelector('.view-lines'))
  }
})
console.log(JSON.stringify(state, null, 2))
await browser.close()
