// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local'
}))

const { CombinedDiffFileTreeRow } = await import('./combined-diff-file-tree-row')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()))
  document.body.replaceChildren()
})

function renderFileRow(entryPath: string): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const entry: GitStatusEntry = { path: entryPath, status: 'modified', area: 'unstaged' }
  act(() => {
    root.render(
      <CombinedDiffFileTreeRow
        node={{
          type: 'file',
          key: `file::unstaged::${entryPath}`,
          path: entryPath,
          name: entryPath.split('/').pop() ?? entryPath,
          entry,
          area: 'unstaged',
          depth: 0
        }}
        mode="uncommitted"
        worktreePath="/repo/worktree"
        sourceWorkspaceId="wt-1"
        activeSectionKey={null}
        sectionIndexByKey={new Map([['unstaged:src/App.tsx', 0]])}
        isCollapsed={false}
        onToggleDirectory={() => {}}
        onNavigate={() => {}}
      />
    )
  })
  return container
}

function findBadgeSpan(container: HTMLDivElement): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('span')).find((span) =>
    span.getAttribute('style')?.includes('color:')
  )
}

describe('combined diff file row icon color precedence (C4)', () => {
  // Why: the icon must carry the file-type color while the git status color stays on the
  // badge — an inline status color on the icon would override the file-type class (C4).
  it('colors a known extension via the icon class and keeps status color on the badge', () => {
    const container = renderFileRow('src/App.tsx')

    const icon = container.querySelector('.text-file-icon-code-ts-js')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('style') ?? '').not.toContain('color')

    const badge = findBadgeSpan(container)
    expect(badge?.getAttribute('style')).toContain('var(--git-decoration-modified)')
    expect(badge?.textContent).toBe('M')
    expect(badge?.className).not.toContain('text-file-icon-code-ts-js')
  })

  it('keeps unknown extensions muted while the badge still carries the status color', () => {
    const container = renderFileRow('notes.customtype')

    expect(container.querySelector('[class*="text-file-icon-"]')).toBeNull()
    expect(container.querySelector('.text-muted-foreground')).not.toBeNull()
    expect(findBadgeSpan(container)?.getAttribute('style')).toContain(
      'var(--git-decoration-modified)'
    )
  })
})
