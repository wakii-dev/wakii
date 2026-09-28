/**
 * VU-14 SF-5 Rule 0 evidence — NOT part of the standing e2e suite.
 * Run: pnpm run ensure:electron-runtime && SKIP_BUILD=1 npx playwright test
 *      --config tests/playwright.config.ts tests/e2e/wakii-sf5-evidence.spec.ts
 * Screenshots land in <worktree>/.evidence-sf5/ (gitignored evidence dir).
 *
 * Flow: push a decoded .wakii payload over the same IPC channel the OS-open
 * path uses (`ui:openWakiiFile`) — golden mindmap WITH decodeWarnings — then
 * assert the viewer tab renders the full graph + warnings badge/popover and
 * screenshot both states from the hidden renderer (background-launch policy).
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import {
  GOLDEN_PROGRESS_EDGE_COUNT,
  GOLDEN_PROGRESS_NODE_COUNT,
  WAKII_GOLDEN_MINDMAP
} from '../../src/renderer/src/viewer/wakii-viewer-golden-fixture'

const EVIDENCE_DIR = path.resolve(__dirname, '../../.evidence-sf5')

test.use({ seedTestRepo: false })

test('SF-5 Rule 0: .wakii viewer renders golden graph + decodeWarnings', async ({
  electronApp,
  orcaPage
}) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true })

  // Main-side push on the OS-open channel — identical to the double-click path.
  await electronApp.evaluate(
    ({ BrowserWindow }, payload: unknown) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (!win) throw new Error('no renderer window')
      win.webContents.send('ui:openWakiiFile', payload)
    },
    {
      path: 'docs/superpowers/mindmaps/VU-14-mindmap-viewer.wakii',
      mindmap: JSON.parse(JSON.stringify(WAKII_GOLDEN_MINDMAP))
    }
  )

  const canvas = orcaPage.locator('[data-testid="wakii-canvas"]')
  await expect(canvas).toBeVisible({ timeout: 30_000 })

  // Valid remainder renders: full progress-mode graph (16 nodes / 19 edges).
  await expect(orcaPage.locator('[data-node-id="epic"]')).toHaveCount(1)
  const nodeCount = await orcaPage.locator('[data-node-id]').count()
  const edgeCount = await orcaPage.locator('.wakii-edge').count()
  expect(nodeCount).toBe(GOLDEN_PROGRESS_NODE_COUNT)
  expect(edgeCount).toBe(GOLDEN_PROGRESS_EDGE_COUNT)

  // decodeWarnings: badge with count (2) — hidden renderer, background policy.
  const badge = orcaPage.locator('[data-testid="wakii-warn-badge"]')
  await expect(badge).toContainText('(2)')
  await orcaPage.screenshot({ path: path.join(EVIDENCE_DIR, 'sf5-wakii-viewer-golden.png') })

  // Popover opens: both warning lines visible in the DOM surface.
  await badge.click()
  const warnbox = orcaPage.locator('[data-testid="wakii-warnbox"]')
  await expect(warnbox).toContainText('drop-unknown-field')
  await expect(warnbox).toContainText('Bỏ edge "e-90"')
  await orcaPage.screenshot({ path: path.join(EVIDENCE_DIR, 'sf5-wakii-warnings-popover.png') })
})
