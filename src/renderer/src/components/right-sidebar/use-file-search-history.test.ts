// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileSearchHistory } from './use-file-search-history'

function renderHistoryHook() {
  return renderHook(() =>
    useFileSearchHistory({
      activeWorktreeId: 'wt-1',
      getCurrentQuery: vi.fn(() => 'render'),
      onSelectQuery: vi.fn(),
      focusInput: vi.fn()
    })
  )
}

describe('useFileSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not open the dropdown on focus — only ArrowDown/opt-in does', () => {
    const { result } = renderHistoryHook()
    act(() => {
      result.current.handleHistoryFocus()
    })
    expect(result.current.historyOpen).toBe(false)
  })

  it('opens and closes the dropdown only via the explicit controls', () => {
    const { result } = renderHistoryHook()
    act(() => {
      result.current.openHistory()
    })
    expect(result.current.historyOpen).toBe(true)
    act(() => {
      result.current.closeHistory()
    })
    expect(result.current.historyOpen).toBe(false)
  })

  it('closes the dropdown on blur', () => {
    vi.useFakeTimers()
    const { result } = renderHistoryHook()
    act(() => {
      result.current.openHistory()
    })
    expect(result.current.historyOpen).toBe(true)
    act(() => {
      result.current.handleHistoryBlur()
      vi.advanceTimersByTime(200)
    })
    expect(result.current.historyOpen).toBe(false)
    vi.useRealTimers()
  })
})
