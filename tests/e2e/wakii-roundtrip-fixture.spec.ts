import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'

/**
 * SF-4 convergence round-trip (Rule 0): a fixture story bracket + context pack is
 * turned into a real `.wakii` file by the kit bin `story-mindmap`, the file is handed
 * to the running app through the real OS-open path (open-file event → capture →
 * fs read + decode in main → ui:openWakiiFile push → preload → renderer bridge →
 * editor slice), and the viewer must render both view modes from that payload.
 * Nothing on the round-trip is mocked; only the OS shell handoff itself is simulated
 * by emitting the exact event the shell delivers.
 */
test.describe('wakii round-trip fixture', () => {
  const evidenceDir = path.join(
    'docs',
    'superpowers',
    'evidence',
    'sf-4-convergence-wakii',
    'screenshots'
  )
  const STORY_MINDMAP_BIN = path.resolve(
    __dirname,
    '../../resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-mindmap'
  )

  type Fixture = { wakiiPath: string; brokenPath: string; fileNodeIds: string[] }

  /**
   * Reads the file-kind node ids back from the generated document so the impact-layer
   * assertions stay true to what the kit bin actually produced (no slug guessing).
   */
  function fileNodeIdsOf(wakiiPath: string): string[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(wakiiPath, 'utf8'))
    } catch {
      return []
    }
    if (typeof parsed !== 'object' || parsed === null || !('nodes' in parsed)) {
      return []
    }
    const nodes = parsed.nodes
    if (!Array.isArray(nodes)) {
      return []
    }
    const ids: string[] = []
    for (const node of nodes) {
      if (
        typeof node === 'object' &&
        node !== null &&
        'id' in node &&
        'kind' in node &&
        typeof node.id === 'string' &&
        node.kind === 'file'
      ) {
        ids.push(node.id)
      }
    }
    return ids
  }

  /**
   * Builds the fixture repo layout story-mindmap expects (bracket 3 levels under the
   * repo root, context pack per SF) and generates the mindmap with the kit bin.
   * STORY_ORCA_BIN points at a missing binary so orchestration/story-impact stay in
   * their fail-open path — the fixture must not depend on the developer's orca state.
   */
  function generateFixtureWakii(): Fixture {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'wakii-roundtrip-'))
    const bracketDir = path.join(repo, 'docs', 'superpowers', 'brackets')
    const packDir = path.join(repo, 'docs', 'superpowers', 'contexts', 'rte2-roundtrip-fixture')
    const mindmapDir = path.join(repo, 'docs', 'superpowers', 'mindmaps')
    for (const dir of [bracketDir, packDir, mindmapDir]) {
      mkdirSync(dir, { recursive: true })
    }
    const bracketPath = path.join(bracketDir, 'rte2-roundtrip-fixture.md')
    writeFileSync(
      bracketPath,
      [
        '# Story: RTE2 — roundtrip fixture story',
        '',
        'Destination: story/rte2-roundtrip-fixture',
        '',
        '## SF-1 Fixture schema',
        'Tier: 0',
        'linear: RTE2-1',
        'Depends on: —',
        'Tasks: sinh-decoder/xay-fixture',
        '',
        '## SF-2 Fixture viewer',
        'Tier: 1',
        'linear: RTE2-2',
        'Depends on: SF-1',
        'Tasks: route-bridge'
      ].join('\n')
    )
    const packBody = [
      '## Spec slice',
      '1. Decode schema v1 from the fixture bracket',
      '2. Wire the payload envelope through IPC',
      '3. Render the graph from the decoded payload',
      '',
      '## Touch map',
      '- Sở hữu: `src/renderer/src/viewer/wakii-viewer.tsx`',
      '- Read-only: `src/shared/wakii-mindmap-types.ts`'
    ].join('\n')
    writeFileSync(path.join(packDir, 'sf-1.md'), packBody)
    writeFileSync(path.join(packDir, 'sf-2.md'), packBody)

    const wakiiPath = path.join(mindmapDir, 'rte2-roundtrip-fixture.wakii')
    execFileSync(
      process.execPath,
      [STORY_MINDMAP_BIN, '--bracket', bracketPath, '--out', wakiiPath],
      {
        env: { ...process.env, STORY_ORCA_BIN: 'wakii-roundtrip-no-such-orca' },
        timeout: 30_000
      }
    )
    const fileNodeIds = fileNodeIdsOf(wakiiPath)
    expect(fileNodeIds).toHaveLength(2)

    const brokenPath = path.join(mindmapDir, 'broken.wakii')
    writeFileSync(brokenPath, '{ "wakiiMindmap": 1, "meta": ')

    return { wakiiPath, brokenPath, fileNodeIds }
  }

  /** The shell handoff itself: emit the exact event macOS "Open With" delivers. */
  function osOpenWakiiFile(electronApp: ElectronApplication, filePath: string): Promise<void> {
    return electronApp.evaluate(({ app }, p) => {
      app.emit('open-file', { preventDefault: () => {} }, p)
    }, filePath)
  }

  async function seededPaths(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store unavailable — is the e2e build exposing the store?')
      }
      return Object.keys(store.getState().wakiiViewerFiles)
    })
  }

  async function seededWakiiPath(page: Page, wakiiPath: string): Promise<void> {
    await page.waitForFunction(
      (p: string) => {
        const store = window.__store
        if (!store) {
          return false
        }
        return Object.keys(store.getState().wakiiViewerFiles).includes(p)
      },
      wakiiPath,
      { timeout: 30_000 }
    )
  }

  function seededNodeCount(page: Page, wakiiPath: string): Promise<number> {
    return page.evaluate((p: string) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store unavailable')
      }
      const entry = store.getState().wakiiViewerFiles[p]
      // Error payloads carry no mindmap half; the dedupe probe only makes sense for opens.
      return entry && 'mindmap' in entry ? entry.mindmap.nodes.length : -1
    }, wakiiPath)
  }

  test('round-trips a kit-generated .wakii through the real open path into the viewer', async ({
    electronApp,
    orcaPage
  }) => {
    const { wakiiPath, brokenPath, fileNodeIds } = generateFixtureWakii()
    await orcaPage.waitForFunction(() => Boolean(window.__store), undefined, {
      timeout: 60_000
    })

    // ── the OS hands the app the generated file ──
    await osOpenWakiiFile(electronApp, wakiiPath)
    await seededWakiiPath(orcaPage, wakiiPath)
    expect(await seededPaths(orcaPage)).toEqual([wakiiPath])

    // ── FLOW — the bridge revealed the floating workspace and the tab is live ──
    await orcaPage.waitForFunction(
      () => Boolean(document.querySelector('[data-floating-terminal-panel][aria-hidden="false"]')),
      undefined,
      { timeout: 30_000 }
    )
    const canvas = orcaPage.getByTestId('wakii-canvas')
    await expect(canvas).toBeVisible()

    // ── DOM — progress mode: epic/SF/task layer from the generated file ──
    for (const id of ['epic', 'sf-1', 'sf-2', 't-1.1', 't-2.1']) {
      await expect(canvas.locator(`[data-node-id="${id}"]`)).toBeVisible()
    }
    // Step nodes belong to the logic view, not the progress view.
    await expect(canvas.locator('[data-node-id="s-1.1"]')).toHaveCount(0)
    await expect(canvas.locator('[data-node-id="sf-1"]')).toContainText('Fixture schema')
    await expect(canvas.locator('[data-node-id="sf-1"]')).toContainText('RTE2-1')

    // ── FLOW — click SF → side panel with state, linear, evidence ──
    await canvas.locator('[data-node-id="sf-1"]').click()
    const panel = orcaPage.getByTestId('wakii-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('SF · tier 0')
    await expect(panel).toContainText('RTE2-1')
    await expect(panel).toContainText('steps từ Spec slice')
    await canvas.click({ position: { x: 10, y: 300 } })
    await expect(panel).toBeHidden()

    // ── VISUAL — progress mode screenshot ──
    await orcaPage.evaluate(() => document.documentElement.classList.add('dark'))
    await orcaPage.screenshot({ path: path.join(evidenceDir, 'roundtrip-progress-dark.png') })

    // ── FLOW — logic mode shows the Spec-slice steps chained by flows-to ──
    await orcaPage.getByTestId('wakii-mode-logic').click()
    for (const id of ['s-1.1', 's-1.2', 's-1.3', 's-2.1', 's-2.2']) {
      await expect(canvas.locator(`[data-node-id="${id}"]`)).toBeVisible()
    }
    // ── FLOW — impact layer adds the touch-map files ──
    await orcaPage.getByTestId('wakii-impact-toggle').click()
    for (const id of fileNodeIds) {
      await expect(canvas.locator(`[data-node-id="${id}"]`)).toBeVisible()
    }

    await orcaPage.screenshot({ path: path.join(evidenceDir, 'roundtrip-logic-impact-dark.png') })

    // ── FLOW — back to progress resets the impact layer ──
    await orcaPage.getByTestId('wakii-mode-progress').click()
    await expect(canvas.locator(`[data-node-id="${fileNodeIds[0]}"]`)).toHaveCount(0)

    // ── dedupe: re-handing the identical file must not double-open or refresh ──
    const nodeCountBefore = await seededNodeCount(orcaPage, wakiiPath)
    await osOpenWakiiFile(electronApp, wakiiPath)
    await orcaPage.waitForTimeout(3_000)
    expect(await seededPaths(orcaPage)).toEqual([wakiiPath])
    const nodeCountAfter = await seededNodeCount(orcaPage, wakiiPath)
    expect(nodeCountAfter).toBe(nodeCountBefore)

    // ── FLOW — a corrupt file surfaces the viewer error card, not a half render ──
    await osOpenWakiiFile(electronApp, brokenPath)
    await seededWakiiPath(orcaPage, brokenPath)
    const errbox = orcaPage.getByTestId('wakii-errbox')
    await expect(errbox).toBeVisible()
    await expect(errbox).toContainText('error.code = schema')
    await expect(errbox).toContainText('broken.wakii')
    await orcaPage.screenshot({ path: path.join(evidenceDir, 'roundtrip-error-card.png') })
  })
})
