import { beforeEach, describe, expect, it } from 'vitest'
import { createEditorStore } from '../editor-slice-test-harness'
import type { SearchReplaceOp } from '@/components/right-sidebar/search-replace-op'

const WT = 'wt-1'

function makeOp(files: number): SearchReplaceOp {
  return {
    kind: 'replace-all',
    at: Date.now(),
    files: Array.from({ length: files }, (_, i) => ({
      filePath: `/repo/file-${i}.md`,
      relativePath: `file-${i}.md`,
      oldContent: `old ${i}`,
      newContent: `new ${i}`
    }))
  }
}

describe('file search replace state slice', () => {
  let store: ReturnType<typeof createEditorStore>

  beforeEach(() => {
    store = createEditorStore()
  })

  it('defaults replace fields per worktree', () => {
    const state = store.getState().fileSearchStateByWorktree[WT]
    expect(state).toBeUndefined()
    store.getState().updateFileSearchState(WT, {})
    const created = store.getState().fileSearchStateByWorktree[WT]
    expect(created).toMatchObject({
      replaceQuery: '',
      replaceVisible: false,
      replaceAllInProgress: false,
      cancelRequested: false,
      lastReplaceOp: null
    })
  })

  it('updates replace query and visibility through the generic updater', () => {
    store.getState().updateFileSearchState(WT, { replaceQuery: 'foo', replaceVisible: true })
    expect(store.getState().fileSearchStateByWorktree[WT]).toMatchObject({
      replaceQuery: 'foo',
      replaceVisible: true
    })
  })

  it('begin starts a run and clears any stale cancel request', () => {
    store.getState().updateFileSearchState(WT, { cancelRequested: true })
    store.getState().beginFileReplaceAll(WT)
    expect(store.getState().fileSearchStateByWorktree[WT]).toMatchObject({
      replaceAllInProgress: true,
      cancelRequested: false
    })
  })

  it('requestCancel flags the in-flight run', () => {
    store.getState().beginFileReplaceAll(WT)
    store.getState().requestCancelFileReplaceAll(WT)
    expect(store.getState().fileSearchStateByWorktree[WT]?.cancelRequested).toBe(true)
  })

  it('finish records only the latest op and stops the run', () => {
    store.getState().beginFileReplaceAll(WT)
    store.getState().finishFileReplaceAll(WT, makeOp(2))
    const first = store.getState().fileSearchStateByWorktree[WT]?.lastReplaceOp
    expect(first?.files).toHaveLength(2)
    expect(store.getState().fileSearchStateByWorktree[WT]?.replaceAllInProgress).toBe(false)

    store.getState().beginFileReplaceAll(WT)
    store.getState().finishFileReplaceAll(WT, makeOp(1))
    expect(store.getState().fileSearchStateByWorktree[WT]?.lastReplaceOp?.files).toHaveLength(1)
  })

  it('finish with no written files clears the op (nothing to undo)', () => {
    store.getState().finishFileReplaceAll(WT, null)
    expect(store.getState().fileSearchStateByWorktree[WT]?.lastReplaceOp).toBeNull()
  })

  it('clearLastFileReplaceOp makes undo a no-op the second time', () => {
    store.getState().finishFileReplaceAll(WT, makeOp(1))
    store.getState().clearLastFileReplaceOp(WT)
    expect(store.getState().fileSearchStateByWorktree[WT]?.lastReplaceOp).toBeNull()
    store.getState().clearLastFileReplaceOp(WT)
    expect(store.getState().fileSearchStateByWorktree[WT]?.lastReplaceOp).toBeNull()
  })

  it('clearFileSearch resets query text but keeps the undo op', () => {
    store.getState().updateFileSearchState(WT, { replaceQuery: 'foo', replaceVisible: true })
    store.getState().finishFileReplaceAll(WT, makeOp(1))
    store.getState().clearFileSearch(WT)
    const state = store.getState().fileSearchStateByWorktree[WT]
    expect(state).toMatchObject({
      replaceQuery: '',
      replaceVisible: true,
      lastReplaceOp: { kind: 'replace-all' }
    })
  })
})
