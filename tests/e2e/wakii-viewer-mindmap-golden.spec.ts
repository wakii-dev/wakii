import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  GOLDEN_LOGIC_EDGE_COUNT,
  GOLDEN_LOGIC_IMPACT_EDGE_COUNT,
  GOLDEN_LOGIC_IMPACT_NODE_COUNT,
  GOLDEN_LOGIC_NODE_COUNT,
  GOLDEN_PROGRESS_EDGE_COUNT,
  GOLDEN_PROGRESS_NODE_COUNT,
  wakiiGoldenErrorPayload,
  wakiiGoldenPayload
} from '../../src/renderer/src/viewer/wakii-viewer-golden-fixture'

/**
 * SF-3 golden render (Rule 0): launches the real app, seeds the decoded
 * `.wakii` payload through the store (the same entry the IPC bridge uses),
 * then walks DOM + visual + flow tiers: both modes, impact layer, wedge,
 * panel, script-title escaping, error card, theme switch, camera.
 */
test.describe('wakii viewer mindmap golden', () => {
  const evidenceDir = path.join(
    'docs',
    'superpowers',
    'evidence',
    'sf-3-viewer-mindmap',
    'screenshots'
  )

  async function seedPayload(page: Page, payload: unknown): Promise<void> {
    await page.evaluate((value) => {
      const store = (
        window as unknown as {
          __store?: { getState: () => { openWakiiViewerFile: (p: unknown) => void } }
        }
      ).__store
      if (!store) {
        throw new Error('window.__store unavailable — is the e2e build exposing the store?')
      }
      store.getState().openWakiiViewerFile(value)
    }, payload)
  }

  /**
   * The store action opens the tab; making the floating workspace visible is the
   * bridge's enable-then-reveal — replicated here because the spec seeds directly.
   */
  async function revealFloatingWorkspace(page: Page): Promise<void> {
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __store?: {
            getState: () => { settings?: { floatingTerminalEnabled?: boolean } }
            setState: (patch: unknown) => void
          }
        }
      ).__store
      if (!store) {
        throw new Error('window.__store unavailable')
      }
      const { settings } = store.getState()
      if (settings?.floatingTerminalEnabled !== true) {
        store.setState({ settings: { ...settings, floatingTerminalEnabled: true } })
      }
      window.dispatchEvent(new CustomEvent('orca-toggle-floating-terminal'))
    })
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-floating-terminal-panel][aria-hidden="false"]')),
      undefined,
      { timeout: 15_000 }
    )
  }

  async function nodeIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-node-id]')].map(
        (el) => el.getAttribute('data-node-id') ?? ''
      )
    )
  }

  async function edgeCount(page: Page): Promise<number> {
    return page.evaluate(() => document.querySelectorAll('.wakii-edge').length)
  }

  test('renders the golden mindmap end to end (DOM + flow + visual)', async ({ orcaPage }) => {
    await orcaPage.waitForFunction(
      () => Boolean((window as unknown as { __store?: unknown }).__store),
      undefined,
      {
        timeout: 60_000
      }
    )
    await revealFloatingWorkspace(orcaPage)

    // ── error payload first: the card must be the whole surface, no half render ──
    await seedPayload(orcaPage, wakiiGoldenErrorPayload())
    const errbox = orcaPage.getByTestId('wakii-errbox')
    await expect(errbox).toBeVisible()
    await expect(errbox).toContainText('error.code = schema')
    await expect(errbox).toContainText('broken.wakii')
    expect(await nodeIds(orcaPage)).toEqual([])

    // ── seed the golden payload → viewer tab becomes active ──
    await seedPayload(orcaPage, wakiiGoldenPayload())
    const canvas = orcaPage.getByTestId('wakii-canvas')
    await expect(canvas).toBeVisible()

    // DOM tier 1 — golden progress counts + tier radii (direction C constants).
    expect(await nodeIds(orcaPage)).toHaveLength(GOLDEN_PROGRESS_NODE_COUNT)
    expect(await edgeCount(orcaPage)).toBe(GOLDEN_PROGRESS_EDGE_COUNT)
    const radii = await orcaPage.evaluate(() => {
      const center = (id: string): { x: number; y: number } => {
        const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement
        return {
          x: Number.parseFloat(el.style.left) + Number.parseFloat(el.style.width) / 2,
          y: Number.parseFloat(el.style.top) + Number.parseFloat(el.style.minHeight) / 2
        }
      }
      const epic = center('epic')
      const dist = (id: string): number => Math.hypot(center(id).x - epic.x, center(id).y - epic.y)
      return { sf1: dist('sf-1'), sf2: dist('sf-2'), sf4: dist('sf-4') }
    })
    expect(radii.sf1).toBeCloseTo(200, 0)
    expect(radii.sf2).toBeCloseTo(385, 0)
    expect(radii.sf4).toBeCloseTo(500, 0)

    // DOM — the <script> fixture title stays text (XSS escape).
    const scriptTitle = await orcaPage
      .getByTestId('wakii-canvas')
      .evaluate((el) =>
        (el.querySelector('[data-node-id="t-3.3"]')?.textContent ?? '').includes(
          '<script>alert(1)</script>'
        )
      )
    expect(scriptTitle).toBe(true)
    expect(
      await orcaPage
        .getByTestId('wakii-canvas')
        .evaluate((el) => el.querySelectorAll('script').length)
    ).toBe(0)

    // FLOW — click SF → panel with state, linear, evidence, collapsible arrays.
    await orcaPage.locator('[data-node-id="sf-1"]').click()
    const panel = orcaPage.getByTestId('wakii-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('SF · tier 0')
    await expect(panel).toContainText('VU-14-1')
    await expect(panel).toContainText('Suite kit xanh 25 asserts + fingerprint rehash')
    await expect(panel).toContainText('ACCEPTANCE (2)')
    await expect(panel).not.toContainText('Single-writer') // >3 items start collapsed
    await panel.getByRole('button', { name: /NOTES/ }).click()
    await expect(panel).toContainText('Single-writer')

    // VISUAL — progress mode (dark forced so both palettes are exercised).
    await orcaPage.evaluate(() => document.documentElement.classList.add('dark'))
    await orcaPage.screenshot({
      path: path.join(evidenceDir, 'progress-dark.png'),
      fullPage: false
    })

    // FLOW — background click closes the panel; mode toggle; impact layer; wedge.
    await canvas.click({ position: { x: 10, y: 300 } })
    await expect(panel).toBeHidden()
    await orcaPage.getByTestId('wakii-mode-logic').click()
    expect(await nodeIds(orcaPage)).toHaveLength(GOLDEN_LOGIC_NODE_COUNT)
    expect(await edgeCount(orcaPage)).toBe(GOLDEN_LOGIC_EDGE_COUNT)
    await orcaPage.getByTestId('wakii-impact-toggle').click()
    expect(await nodeIds(orcaPage)).toHaveLength(GOLDEN_LOGIC_IMPACT_NODE_COUNT)
    expect(await edgeCount(orcaPage)).toBe(GOLDEN_LOGIC_IMPACT_EDGE_COUNT)
    const computedDashed = await orcaPage.evaluate(() =>
      Boolean(document.querySelector('[data-node-id="f-bridge"].wakii-computed'))
    )
    expect(computedDashed).toBe(true)

    // FLOW — hovering an SF in logic mode raises the wedge spotlight.
    await orcaPage.locator('[data-node-id="sf-3"]').hover()
    await expect(orcaPage.getByTestId('wakii-wedge')).toHaveClass(/wakii-wedge-show/)

    // VISUAL — logic + impact (dark).
    await orcaPage.screenshot({
      path: path.join(evidenceDir, 'logic-impact-dark.png'),
      fullPage: false
    })

    // Camera — wheel zoom moves the imperative transform.
    const before = await canvas.evaluate(
      (el) => el.querySelector<HTMLElement>('.wakii-viewport')!.style.transform
    )
    await canvas.hover({ position: { x: 400, y: 300 } })
    await orcaPage.mouse.wheel(0, -240)
    const after = await canvas.evaluate(
      (el) => el.querySelector<HTMLElement>('.wakii-viewport')!.style.transform
    )
    expect(after).not.toBe(before)

    // VISUAL — theme switch flips token class only; same graph, light palette.
    await orcaPage.evaluate(() => document.documentElement.classList.remove('dark'))
    await expect(orcaPage.getByTestId('wakii-canvas')).toBeVisible()
    await orcaPage.screenshot({
      path: path.join(evidenceDir, 'progress-light.png'),
      fullPage: false
    })
    await orcaPage.evaluate(() => document.documentElement.classList.add('dark'))
  })
})
