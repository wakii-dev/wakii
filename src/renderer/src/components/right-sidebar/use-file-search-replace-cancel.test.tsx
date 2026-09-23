// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileSearchReplaceCancelGuard } from './use-file-search-replace-cancel'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  requestCancelFileReplaceAll: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ requestCancelFileReplaceAll: mocks.requestCancelFileReplaceAll }),
    { getState: mocks.getState }
  )
}))

function stateWith(worktreeId: string, inProgress: boolean) {
  return {
    fileSearchStateByWorktree: {
      [worktreeId]: { replaceAllInProgress: inProgress }
    }
  }
}

describe('useFileSearchReplaceCancelGuard', () => {
  beforeEach(() => {
    mocks.requestCancelFileReplaceAll.mockClear()
  })

  it('requests cancel on unmount while a run is in flight', () => {
    mocks.getState.mockReturnValue(stateWith('wt-1', true))
    const { unmount } = renderHook(() =>
      useFileSearchReplaceCancelGuard({ activeWorktreeId: 'wt-1', explorerView: 'search' })
    )
    unmount()
    expect(mocks.requestCancelFileReplaceAll).toHaveBeenCalledWith('wt-1')
  })

  it('does not cancel on unmount when nothing is running', () => {
    mocks.getState.mockReturnValue(stateWith('wt-1', false))
    const { unmount } = renderHook(() =>
      useFileSearchReplaceCancelGuard({ activeWorktreeId: 'wt-1', explorerView: 'search' })
    )
    unmount()
    expect(mocks.requestCancelFileReplaceAll).not.toHaveBeenCalled()
  })

  it('requests cancel for the worktree being left on worktree switch', () => {
    mocks.getState.mockReturnValue(stateWith('wt-1', true))
    const { rerender } = renderHook(
      ({ activeWorktreeId }: { activeWorktreeId: string | null }) =>
        useFileSearchReplaceCancelGuard({ activeWorktreeId, explorerView: 'search' }),
      { initialProps: { activeWorktreeId: 'wt-1' } }
    )
    rerender({ activeWorktreeId: 'wt-2' })
    expect(mocks.requestCancelFileReplaceAll).toHaveBeenCalledTimes(1)
    expect(mocks.requestCancelFileReplaceAll).toHaveBeenCalledWith('wt-1')
  })

  it('requests cancel when the explorer view leaves search mid-run', () => {
    mocks.getState.mockReturnValue(stateWith('wt-1', true))
    const { rerender } = renderHook(
      (props: { explorerView: 'files' | 'search' }) =>
        useFileSearchReplaceCancelGuard({ activeWorktreeId: 'wt-1', explorerView: props.explorerView }),
      { initialProps: { explorerView: 'search' } }
    )
    rerender({ explorerView: 'files' })
    expect(mocks.requestCancelFileReplaceAll).toHaveBeenCalledWith('wt-1')
  })

  it('ignores view switches when no run is in flight', () => {
    mocks.getState.mockReturnValue(stateWith('wt-1', false))
    const { rerender } = renderHook(
      (props: { explorerView: 'files' | 'search' }) =>
        useFileSearchReplaceCancelGuard({ activeWorktreeId: 'wt-1', explorerView: props.explorerView }),
      { initialProps: { explorerView: 'search' } }
    )
    rerender({ explorerView: 'files' })
    expect(mocks.requestCancelFileReplaceAll).not.toHaveBeenCalled()
  })
})
