import { chromium } from 'playwright-core'

const CDP = process.argv[2] ?? 'http://127.0.0.1:9353'

const browser = await chromium.connectOverCDP(CDP)
const contexts = browser.contexts()
const pages = contexts.flatMap((ctx) => ctx.pages())
console.log('pages:', pages.length)
for (const page of pages) {
  console.log('url:', page.url().slice(0, 80))
}

const page = pages[0]
if (!page) {
  console.error('NO PAGE')
  process.exit(1)
}

const info = await page.evaluate(() => {
  const store = window.__store
  if (!store) return { error: 'no __store' }
  const s = store.getState()
  const worktrees = Object.values(s.worktreesByRepo ?? {})
    .flat()
    .map((w) => ({ id: w.id, path: w.path, branch: w.branch }))
  return {
    activeWorktreeId: s.activeWorktreeId,
    worktreeCount: worktrees.length,
    firstWorktrees: worktrees.slice(0, 8),
    editorInlineBlameEnabled: s.settings?.editorInlineBlameEnabled,
    editorAutoSave: s.settings?.editorAutoSave,
    openFiles: (s.openFiles ?? []).map((f) => f.relativePath).slice(0, 8)
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
