// @vitest-environment happy-dom
import { fireEvent, render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GOLDEN_LOGIC_EDGE_COUNT,
  GOLDEN_LOGIC_IMPACT_EDGE_COUNT,
  GOLDEN_LOGIC_IMPACT_NODE_COUNT,
  GOLDEN_LOGIC_NODE_COUNT,
  GOLDEN_PROGRESS_EDGE_COUNT,
  GOLDEN_PROGRESS_NODE_COUNT,
  WAKII_GOLDEN_MINDMAP,
  wakiiGoldenErrorPayload,
  wakiiGoldenPayload
} from './wakii-viewer-golden-fixture'
import WakiiViewer from './wakii-viewer'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

afterEach(cleanup)

function nodes(): Element[] {
  return [...document.querySelectorAll('[data-node-id]')]
}

function edges(selector = '.wakii-edge'): Element[] {
  return [...document.querySelectorAll(selector)]
}

function nodeById(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
  if (!el) {
    throw new Error(`node ${id} not rendered`)
  }
  return el
}

function clickNode(id: string): void {
  fireEvent.click(nodeById(id))
}

function query<S extends string>(selector: S): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) {
    throw new Error(`missing element: ${selector}`)
  }
  return el
}

function rectCenter(el: HTMLElement): { x: number; y: number } {
  const left = Number.parseFloat(el.style.left)
  const top = Number.parseFloat(el.style.top)
  const width = Number.parseFloat(el.style.width)
  const height = Number.parseFloat(el.style.minHeight)
  return { x: left + width / 2, y: top + height / 2 }
}

describe('golden render — progress mode (t-1)', () => {
  it('renders 16 nodes / 19 edges with SFs on their tier radii', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    expect(nodes()).toHaveLength(GOLDEN_PROGRESS_NODE_COUNT)
    expect(edges()).toHaveLength(GOLDEN_PROGRESS_EDGE_COUNT)
    // epic is the orbit center; sf-1 (tier 0) sits 200px away, sf-4 (tier 2) 500px.
    const epic = rectCenter(nodeById('epic'))
    expect(
      Math.hypot(rectCenter(nodeById('sf-1')).x - epic.x, rectCenter(nodeById('sf-1')).y - epic.y)
    ).toBeCloseTo(200, 6)
    expect(
      Math.hypot(rectCenter(nodeById('sf-2')).x - epic.x, rectCenter(nodeById('sf-2')).y - epic.y)
    ).toBeCloseTo(385, 6)
    expect(
      Math.hypot(rectCenter(nodeById('sf-4')).x - epic.x, rectCenter(nodeById('sf-4')).y - epic.y)
    ).toBeCloseTo(500, 6)
    // state dot colors come from tokens only (t-8).
    const doneDot = nodeById('sf-1').querySelector<HTMLElement>('.wakii-dot')
    expect(doneDot?.style.background).toBe('var(--status-success)')
    const blockedDot = nodeById('t-2.3').querySelector<HTMLElement>('.wakii-dot')
    expect(blockedDot?.style.background).toBe('var(--destructive)')
  })

  it('shows SF progress bar + meta from child tasks', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    expect(nodeById('sf-1').textContent).toContain('3/3')
    expect(nodeById('sf-1').querySelector<HTMLElement>('.wakii-nbar i')?.style.width).toBe('100%')
    expect(nodeById('sf-2').textContent).toContain('1/3')
  })

  it('hides steps/areas/files in progress mode', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    expect(document.querySelector('[data-node-id="s-1.1"]')).toBeNull()
    expect(document.querySelector('[data-node-id="area-kit"]')).toBeNull()
    expect(document.querySelector('[data-node-id="f-viewer"]')).toBeNull()
  })
})

describe('golden render — logic + impact (t-2)', () => {
  function switchToLogicAndImpact(): void {
    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    fireEvent.click(query('[data-testid="wakii-impact-toggle"]'))
  }

  it('logic mode shows steps + flows-to, impact adds area/file with computed styling', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    expect(nodes()).toHaveLength(GOLDEN_LOGIC_NODE_COUNT)
    expect(edges()).toHaveLength(GOLDEN_LOGIC_EDGE_COUNT)
    expect(edges('.wakii-e-flows-to')).toHaveLength(6)
    // depends-on stays visible but faint in logic mode (contains: only epic→sf survive filtering).
    expect(edges('.wakii-e-depends-on.wakii-faint')).toHaveLength(4)

    switchToLogicAndImpact()
    expect(nodes()).toHaveLength(GOLDEN_LOGIC_IMPACT_NODE_COUNT)
    expect(edges()).toHaveLength(GOLDEN_LOGIC_IMPACT_EDGE_COUNT)
    // computed ≠ curated (t-2).
    const computed = edges('.wakii-e-writes').length
    expect(computed).toBe(7)
    const computedFiles = nodes().filter((n) => n.className.includes('wakii-computed'))
    expect(computedFiles).toHaveLength(3)
    const curatedFiles = nodes().filter(
      (n) =>
        (n.getAttribute('data-node-id') ?? '').startsWith('f-') &&
        !n.className.includes('wakii-computed')
    )
    expect(curatedFiles).toHaveLength(4)
  })

  it('returning to progress resets the impact layer', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    switchToLogicAndImpact()
    fireEvent.click(query('[data-testid="wakii-mode-progress"]'))
    expect(nodes()).toHaveLength(GOLDEN_PROGRESS_NODE_COUNT)
    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    expect(nodes()).toHaveLength(GOLDEN_LOGIC_NODE_COUNT)
  })
})

describe('panel per kind (t-3)', () => {
  it('sf panel: kind chip, state chip, linear, evidence, collapsible knowledge arrays', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    clickNode('sf-1')
    const panel = query('[data-testid="wakii-panel"]')
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('SF · tier 0')
    expect(panel.textContent).toContain('Schema .wakii + bin story-mindmap')
    expect(panel.textContent).toContain('VU-14-1')
    expect(panel.textContent).toContain('Suite kit xanh 25 asserts + fingerprint rehash')
    // ≤3 items open by default, >3 collapsed.
    expect(panel.textContent).toContain('ACCEPTANCE (2)')
    expect(panel.textContent).toContain('unit schema valid/invalid/dangling')
    expect(panel.textContent).not.toContain('Single-writer')
    const notesHeader = [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('NOTES')
    )
    expect(notesHeader).toBeDefined()
    fireEvent.click(notesHeader!)
    expect(panel.textContent).toContain('Single-writer')
    // node gets the selection ring class.
    expect(nodeById('sf-1').className).toContain('wakii-sel')
  })

  it('epic panel carries meta.summary + target branch row', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    clickNode('epic')
    const panel = query('[data-testid="wakii-panel"]')
    expect(panel.textContent).toContain(WAKII_GOLDEN_MINDMAP.meta.summary ?? '')
    expect(panel.textContent).toContain('story/vu-14-mindmap-viewer')
    expect(panel.textContent).toContain('VU-14')
  })

  it('file panel: path, computed/curated source, SFs touching', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    fireEvent.click(query('[data-testid="wakii-impact-toggle"]'))
    clickNode('f-bridge')
    let panel = query('[data-testid="wakii-panel"]')
    expect(panel.textContent).toContain('src/main/os-wakii-file-open-bridge.ts')
    expect(panel.textContent).toContain('story-impact (computed)')
    expect(panel.textContent).toContain('VU-14-2')
    clickNode('f-viewer')
    panel = query('[data-testid="wakii-panel"]')
    expect(panel.textContent).toContain('Touch map (curated)')
  })

  it('step panel shows the mechanism detail', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    clickNode('s-3.1')
    const panel = query('[data-testid="wakii-panel"]')
    expect(panel.textContent).toContain('Renderer không đọc fs, không JSON.parse lại.')
  })

  it('clicking the canvas background closes the panel', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    clickNode('sf-1')
    expect(document.querySelector('[data-testid="wakii-panel"]')).not.toBeNull()
    fireEvent.click(query('[data-testid="wakii-canvas"]'))
    expect(document.querySelector('[data-testid="wakii-panel"]')).toBeNull()
    expect(nodeById('sf-1').className).not.toContain('wakii-sel')
  })
})

describe('hover — neighbors + wedge (t-4)', () => {
  it('dims non-neighbors, highlights touching edges; wedge only for SF hover in logic mode', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    fireEvent.mouseEnter(nodeById('sf-1'))
    expect(nodeById('sf-4').className).toContain('wakii-dim')
    expect(nodeById('t-1.1').className).not.toContain('wakii-dim')
    expect(nodeById('sf-1').className).not.toContain('wakii-dim')
    // progress mode: no wedge even on SF hover.
    const wedge = document.querySelector<SVGPathElement>('[data-testid="wakii-wedge"]')!
    expect(wedge.getAttribute('class')).not.toContain('wakii-wedge-show')
    fireEvent.mouseLeave(nodeById('sf-1'))
    expect(nodeById('sf-4').className).not.toContain('wakii-dim')

    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    fireEvent.mouseEnter(nodeById('sf-3'))
    expect(wedge.getAttribute('class')).toContain('wakii-wedge-show')
    expect(wedge.getAttribute('d')).toContain('A 60 60')
    fireEvent.mouseEnter(nodeById('s-3.1'))
    // step hover clears the wedge (only SFs sit on the ring).
    expect(wedge.getAttribute('class')).not.toContain('wakii-wedge-show')
    fireEvent.mouseLeave(nodeById('s-3.1'))
    expect(wedge.getAttribute('class')).not.toContain('wakii-wedge-show')
  })
})

describe('script title escapes as text (t-5)', () => {
  it('t-3.3 renders <script> as plain text — no script elements, no innerHTML', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    const node = nodeById('t-3.3')
    expect(node.textContent).toContain('<script>alert(1)</script>')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(document.querySelector('.wakii-nodelayer')?.innerHTML).not.toContain('<script>')
  })
})

describe('error + warnings payloads (t-6)', () => {
  it('error payload renders the error card and nothing else', () => {
    render(<WakiiViewer payload={wakiiGoldenErrorPayload()} />)
    const errbox = query('[data-testid="wakii-errbox"]')
    expect(errbox).not.toBeNull()
    expect(errbox.textContent).toContain('error.code = schema')
    expect(errbox.textContent).toContain('wakiiMindmap')
    expect(errbox.textContent).toContain('broken.wakii')
    expect(nodes()).toHaveLength(0)
    expect(document.querySelector('[data-testid="wakii-mode-progress"]')).toBeNull()
  })

  it('decodeWarnings render the valid remainder + badge with count + popover', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    expect(nodes()).toHaveLength(GOLDEN_PROGRESS_NODE_COUNT)
    const badge = query('[data-testid="wakii-warn-badge"]')
    expect(badge.textContent).toContain('(2)')
    const warnbox = query('[data-testid="wakii-warnbox"]')
    expect(warnbox.className).not.toContain('wakii-warnbox-show')
    fireEvent.click(badge)
    expect(warnbox.className).toContain('wakii-warnbox-show')
    expect(warnbox.textContent).toContain('drop-unknown-field')
    expect(warnbox.textContent).toContain('Bỏ edge "e-90"')
  })
})

describe('mode toggle + kind chips (t-7)', () => {
  it('chips disable per mode; filter hides kinds; impact button only in logic', () => {
    render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    const chip = (kind: string): HTMLButtonElement =>
      document.querySelector<HTMLButtonElement>(`.wakii-chip[data-kind="${kind}"]`)!
    expect(chip('step').disabled).toBe(true)
    expect(chip('epic').disabled).toBe(false)
    expect(chip('task').disabled).toBe(false)
    const impact = query('[data-testid="wakii-impact-toggle"]')
    expect(impact.style.display).toBe('none')

    fireEvent.click(query('[data-testid="wakii-mode-logic"]'))
    expect(chip('step').disabled).toBe(false)
    expect(chip('task').disabled).toBe(true)
    expect(impact.style.display).not.toBe('none')

    fireEvent.click(chip('epic'))
    expect(document.querySelector('[data-node-id="epic"]')).toBeNull()
    expect(document.querySelector('[data-node-id="sf-1"]')).not.toBeNull()
    // hiding epic (still in logic mode) drops its 4 contains edges too.
    expect(edges()).toHaveLength(GOLDEN_LOGIC_EDGE_COUNT - 4)
  })
})

describe('camera — wheel zoom + pan + fit (t-8)', () => {
  function setup(): { canvas: HTMLElement; viewport: HTMLElement } {
    const { container } = render(<WakiiViewer payload={wakiiGoldenPayload()} />)
    const canvas = container.querySelector<HTMLElement>('[data-testid="wakii-canvas"]')!
    const viewport = canvas.querySelector<HTMLElement>('.wakii-viewport')!
    return { canvas, viewport }
  }

  it('wheel zooms around the cursor through the imperative transform', () => {
    const { canvas, viewport } = setup()
    expect(viewport.style.transform).toBe('')
    fireEvent.wheel(canvas, { deltaY: -240, clientX: 300, clientY: 200 })
    expect(viewport.style.transform).not.toBe('')
    const afterZoomIn = viewport.style.transform
    fireEvent.wheel(canvas, { deltaY: 480, clientX: 300, clientY: 200 })
    expect(viewport.style.transform).not.toBe(afterZoomIn)
  })

  it('dragging the background pans; fit re-centers', () => {
    const { canvas, viewport } = setup()
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    expect(canvas.className).toContain('wakii-panning')
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(viewport.style.transform).toContain('translate(80px, -40px)')
    expect(canvas.className).not.toContain('wakii-panning')
    const fit = query('[data-testid="wakii-fit"]')
    fireEvent.click(fit)
    // zero-size rect in happy-dom → fit is a no-op but must not throw; transform persists.
    expect(viewport.style.transform).toContain('translate(80px, -40px)')
  })
})
