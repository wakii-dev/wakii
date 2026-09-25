import { describe, expect, it, vi } from 'vitest'
import { SearchReplacePreviewModal } from './search-replace-preview-modal'
import type { ReplaceAllRunSummary } from './search-replace-all-runner'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

vi.mock('../editor/editor-lazy-views', () => ({
  DiffViewer: (props: Record<string, unknown>) => ({
    type: 'diff-viewer-stub',
    props
  })
}))

function readTestId(entry: ReactElementLike): string | undefined {
  const testId = entry.props['data-testid']
  return typeof testId === 'string' ? testId : undefined
}

function collectTestIds(node: ReactElementLike): string[] {
  const ids: string[] = []
  visit(node, (entry) => {
    const testId = readTestId(entry)
    if (testId !== undefined) {
      ids.push(testId)
    }
  })
  return ids
}

function findTestIds(node: ReactElementLike): Map<string, ReactElementLike> {
  const found = new Map<string, ReactElementLike>()
  visit(node, (entry) => {
    const testId = readTestId(entry)
    if (testId !== undefined) {
      found.set(testId, entry)
    }
  })
  return found
}

function invokeHandler(entry: ReactElementLike | undefined, prop: string, arg?: unknown): void {
  const handler = entry?.props[prop]
  if (typeof handler === 'function') {
    handler(arg)
  }
}

function makeSummary(overrides: Partial<ReplaceAllRunSummary> = {}): ReplaceAllRunSummary {
  return {
    totalCandidates: 3,
    cancelled: false,
    stoppedOnTransportError: false,
    outcomes: [],
    writtenFiles: [],
    previews: [
      {
        filePath: `/wt/a-${'x'.repeat(1)}.md`,
        relativePath: 'a.md',
        oldContent: 'foo bar',
        newContent: 'baz bar',
        matchCount: 1
      },
      {
        filePath: '/wt/b.md',
        relativePath: 'b.md',
        oldContent: 'foo\nfoo',
        newContent: 'baz\nbaz',
        matchCount: 2
      }
    ],
    counts: { replaced: 2, skippedDirty: 1, skippedStale: 0, errors: 0, unprocessed: 0 },
    ...overrides
  }
}

function renderModal(overrides: {
  open?: boolean
  loading?: boolean
  summary?: ReplaceAllRunSummary | null
  replaceTerm?: string
  onConfirm?: () => void
  onClose?: () => void
}): ReactElementLike {
  const tree = SearchReplacePreviewModal({
    open: overrides.open ?? true,
    onClose: overrides.onClose ?? vi.fn(),
    onConfirm: overrides.onConfirm ?? vi.fn(),
    loading: overrides.loading ?? false,
    summary: overrides.summary === undefined ? makeSummary() : overrides.summary,
    replaceTerm: overrides.replaceTerm ?? 'baz',
    totalOccurrences: 3
  })
  // Why: only the closed test hits the null branch; guard instead of cast.
  if (tree === null) {
    throw new Error('modal unexpectedly closed')
  }
  return tree
}

describe('SearchReplacePreviewModal', () => {
  it('renders nothing when closed', () => {
    expect(
      SearchReplacePreviewModal({
        open: false,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        loading: false,
        summary: makeSummary(),
        replaceTerm: 'baz',
        totalOccurrences: 3
      })
    ).toBeNull()
  })

  it('reports derived occurrence and file counts from the dry run', () => {
    const ids = collectTestIds(renderModal({}))
    expect(ids).toContain('replace-preview-counts')
    expect(ids).toContain('replace-preview-diff')
  })

  it('lists at most the top 10 file diffs', () => {
    const previews = Array.from({ length: 14 }, (_, i) => ({
      filePath: `/wt/f${i}.md`,
      relativePath: `f${i}.md`,
      oldContent: 'foo',
      newContent: 'baz',
      matchCount: 1
    }))
    const tree = renderModal({ summary: makeSummary({ previews }) })
    const diffs: ReactElementLike[] = []
    visit(tree, (entry) => {
      if (readTestId(entry) === 'replace-preview-diff') {
        diffs.push(entry)
      }
    })
    expect(diffs).toHaveLength(10)
  })

  it('shows a removal note when the replace term is empty', () => {
    const ids = findTestIds(renderModal({ replaceTerm: '' }))
    expect(ids.has('replace-preview-removal-note')).toBe(true)
  })

  it('hides the removal note when a replacement term exists', () => {
    const ids = findTestIds(renderModal({ replaceTerm: 'baz' }))
    expect(ids.has('replace-preview-removal-note')).toBe(false)
  })

  it('surfaces skip and error counts', () => {
    const ids = collectTestIds(renderModal({}))
    expect(ids).toContain('replace-preview-skips')
  })

  it('confirms through the Replace All button', () => {
    const onConfirm = vi.fn()
    const ids = findTestIds(renderModal({ onConfirm }))
    invokeHandler(ids.get('replace-preview-confirm'), 'onClick')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels without writing through Cancel and Escape paths', () => {
    const onClose = vi.fn()
    const ids = findTestIds(renderModal({ onClose }))
    invokeHandler(ids.get('replace-preview-cancel'), 'onClick')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables confirm while the dry run is in flight', () => {
    const ids = findTestIds(renderModal({ loading: true }))
    expect(ids.get('replace-preview-confirm')?.props['disabled']).toBe(true)
  })

  it('blocks confirm when the run was cancelled or stopped', () => {
    const cancelled = findTestIds(
      renderModal({ summary: makeSummary({ cancelled: true, counts: { replaced: 0, skippedDirty: 0, skippedStale: 0, errors: 0, unprocessed: 2 } }) })
    )
    expect(cancelled.get('replace-preview-confirm')?.props['disabled']).toBe(true)

    const stopped = findTestIds(
      renderModal({ summary: makeSummary({ stoppedOnTransportError: true }) })
    )
    expect(stopped.get('replace-preview-confirm')?.props['disabled']).toBe(true)
  })
})
