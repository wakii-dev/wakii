// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditorBreadcrumbs } from './EditorBreadcrumbs'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
})

function renderBreadcrumbs(overrides: Partial<Parameters<typeof EditorBreadcrumbs>[0]> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const onReveal = overrides.onReveal ?? vi.fn()
  act(() => {
    root?.render(
      <EditorBreadcrumbs
        filePath="/repo/src/lib/deep/nested/file.ts"
        relativePath="src/lib/deep/nested/file.ts"
        worktreeId="wt-1"
        onReveal={onReveal}
        {...overrides}
      />
    )
  })
  return { container, onReveal }
}

describe('EditorBreadcrumbs', () => {
  it('renders a segment for every path part including the file name', () => {
    const { container } = renderBreadcrumbs()
    const nav = container.querySelector('[data-testid="editor-breadcrumbs"]')
    expect(nav).not.toBeNull()
    const segments = [...nav?.querySelectorAll('[data-testid="breadcrumb-segment"]') ?? []]
    expect(segments.map((s) => s.textContent)).toEqual([
      'src',
      'lib',
      'deep',
      'nested',
      'file.ts'
    ])
  })

  it('reveals the file in the explorer when a parent segment is clicked', () => {
    const { container, onReveal } = renderBreadcrumbs()
    const segments = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="breadcrumb-segment"]')
    ]
    act(() => segments[1]?.click())
    expect(onReveal).toHaveBeenCalledWith('wt-1', '/repo/src/lib/deep/nested/file.ts')
  })

  it('marks the file segment as the current page and does not reveal on click', () => {
    const { container, onReveal } = renderBreadcrumbs()
    const segments = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="breadcrumb-segment"]')
    ]
    const fileSegment = segments.at(-1)
    expect(fileSegment?.tagName).toBe('SPAN')
    expect(fileSegment?.getAttribute('aria-current')).toBe('page')

    act(() => fileSegment?.click())
    expect(onReveal).not.toHaveBeenCalled()
  })
})
