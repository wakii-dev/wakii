import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9353')
const page = browser.contexts().flatMap((c) => c.pages())[0]

const state = await page.evaluate(() => {
  const s = window.__store.getState()
  return {
    activeWorktreeId: s.activeWorktreeId,
    activeTabType: s.activeTabType,
    activeTabId: s.activeTabId,
    openFiles: (s.openFiles ?? []).map((f) => ({
      path: f.relativePath,
      id: f.id,
      isDirty: f.isDirty,
      mode: f.mode
    })),
    bodyClasses: document.body.className.slice(0, 100),
    monacoInDom: Boolean(document.querySelector('.monaco-editor')),
    editorContainers: Array.from(document.querySelectorAll('[class*=editor]')).length,
    rootHtml: document.getElementById('root')?.innerHTML.length ?? 0
  }
})
console.log(JSON.stringify(state, null, 2))
await browser.close()
