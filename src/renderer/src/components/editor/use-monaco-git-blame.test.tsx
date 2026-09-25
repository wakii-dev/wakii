// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBlameResult } from '../../../../shared/git-blame-types'
import { GIT_BLAME_STRINGS_EN } from './git-blame-strings'
import { clearGitBlameCacheForWorktree, useMonacoGitBlame } from './use-monaco-git-blame'

const monacoMocks = vi.hoisted(() => ({
  registerHoverProvider: vi.fn(
    (
      _language: unknown,
      _provider: { provideHover: (model: unknown, position: unknown) => unknown }
    ) => ({ dispose: vi.fn() })
  )
}))

vi.mock('monaco-editor', () => ({
  languages: {
    registerHoverProvider: monacoMocks.registerHoverProvider
  }
}))

const blameClient = vi.hoisted(() => ({
  getRuntimeGitBlame: vi.fn(),
  isGitBlameSupportedForHost: vi.fn(() => true),
  GitBlameHostUnsupportedError: class GitBlameHostUnsupportedError extends Error {
    constructor() {
      super('Inline blame is unavailable on this host')
      this.name = 'GitBlameHostUnsupportedError'
    }
  }
}))
vi.mock('@/runtime/runtime-git-blame-client', () => blameClient)

const storeMock = vi.hoisted<{ gitStatusHeadByWorktree: Record<string, string> }>(() => ({
  gitStatusHeadByWorktree: {}
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeMock) => unknown) => selector(storeMock)
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const BLAME_RESULT: GitBlameResult = {
  filePath: 'src/app.ts',
  lines: [
    {
      lineNumber: 3,
      hash: 'a'.repeat(40),
      abbreviatedHash: 'abc1234',
      author: 'Jane Dev',
      authorTime: 1_700_000_000_000,
      summary: 'Add blame reader',
      committed: true
    },
    {
      lineNumber: 4,
      hash: '0'.repeat(40),
      abbreviatedHash: '0000000',
      author: 'Not Committed Yet',
      authorTime: 1_700_000_000_000,
      summary: 'src/app.ts',
      committed: false
    }
  ]
}

function createFakeModel() {
  return { getLineMaxColumn: vi.fn(() => 40) }
}

// Deterministic scrolled-visible geometry: line N renders 20px tall at top
// (N-1)*20 — overlay position math pins against these numbers.
const FAKE_LINE_HEIGHT_PX = 20

function createFakeEditor(model = createFakeModel()) {
  const cursorListeners: ((event: { position: { lineNumber: number; column: number } }) => void)[] = []
  const scrollListeners: (() => void)[] = []
  const layoutListeners: (() => void)[] = []
  const disposers: ReturnType<typeof vi.fn>[] = []
  const domNode = document.createElement('div')
  const scrolledVisible = vi.fn((position: { lineNumber: number }) => ({
    top: (position.lineNumber - 1) * FAKE_LINE_HEIGHT_PX,
    left: 0,
    height: FAKE_LINE_HEIGHT_PX
  }))
  const editor = {
    onDidChangeCursorPosition: vi.fn((listener) => {
      cursorListeners.push(listener)
      const dispose = vi.fn()
      disposers.push(dispose)
      return { dispose }
    }),
    onDidScrollChange: vi.fn((listener) => {
      scrollListeners.push(listener)
      const dispose = vi.fn()
      disposers.push(dispose)
      return { dispose }
    }),
    onDidLayoutChange: vi.fn((listener) => {
      layoutListeners.push(listener)
      const dispose = vi.fn()
      disposers.push(dispose)
      return { dispose }
    }),
    getDomNode: vi.fn(() => domNode),
    getScrolledVisiblePosition: scrolledVisible,
    getModel: vi.fn(() => model),
    getPosition: vi.fn(() => ({ lineNumber: 3, column: 1 })),
    fireCursor(lineNumber: number): void {
      for (const listener of cursorListeners) {
        listener({ position: { lineNumber, column: 1 } })
      }
    },
    fireScroll(): void {
      for (const listener of scrollListeners) {
        listener()
      }
    },
    fireLayout(): void {
      for (const listener of layoutListeners) {
        listener()
      }
    }
  }
  return {
    editor,
    model,
    domNode,
    scrolledVisible,
    cursorListeners,
    scrollListeners,
    layoutListeners,
    disposers
  }
}

type HookArgs = Parameters<typeof useMonacoGitBlame>[0]

function baseArgs(
  fake: ReturnType<typeof createFakeEditor>,
  overrides: Partial<HookArgs> = {}
): HookArgs {
  return {
    enabled: true,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake editor stubs only the API the hook touches; no full Monaco instance in unit tests.
    mountedEditor: fake.editor as never,
    worktreeId: 'wt-1',
    worktreePath: '/repo',
    relativePath: 'src/app.ts',
    connectionId: null,
    content: 'line1\nline2\nline3',
    isDirty: false,
    ...overrides
  }
}

function overlayFor(fake: ReturnType<typeof createFakeEditor>): HTMLDivElement | null {
  return fake.domNode.querySelector<HTMLDivElement>('.orca-git-blame-overlay')
}

function overlayText(fake: ReturnType<typeof createFakeEditor>): string {
  return overlayFor(fake)?.textContent ?? ''
}

function overlayHidden(fake: ReturnType<typeof createFakeEditor>): boolean {
  const overlay = overlayFor(fake)
  return !overlay || overlay.style.display === 'none'
}

function overlayTop(fake: ReturnType<typeof createFakeEditor>): string {
  return overlayFor(fake)?.style.top ?? ''
}

beforeEach(() => {
  blameClient.getRuntimeGitBlame.mockReset()
  blameClient.getRuntimeGitBlame.mockResolvedValue(BLAME_RESULT)
  blameClient.isGitBlameSupportedForHost.mockReset()
  blameClient.isGitBlameSupportedForHost.mockReturnValue(true)
  monacoMocks.registerHoverProvider.mockClear()
  storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-1' }
  // The hook's blame cache is module-level by design — reset between tests.
  clearGitBlameCacheForWorktree('wt-1')
})

describe('useMonacoGitBlame', () => {
  it('fetches blame once on mount and paints the cursor line overlay', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })

    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1' }),
      'src/app.ts'
    )
    await waitFor(() => expect(overlayText(fake)).toContain('Jane Dev'))
    // Regression pin (user directive): the overlay is a single right-anchored
    // div on the editor DOM — never an injected span inside token spans, whose
    // absolute positioning resolved against the wrong containing block.
    const overlay = overlayFor(fake)
    expect(overlay?.parentElement).toBe(fake.domNode)
    expect(overlay?.classList.contains('orca-git-blame-overlay')).toBe(true)
    // Line 3 of the fake geometry: top (3-1)*20, vertically centered offset
    // (20-16)/2 -> 42px.
    expect(overlayTop(fake)).toBe('42px')
    unmount()
  })

  it('follows the cursor imperatively — overlay repaints with zero additional git calls', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    fake.editor.fireCursor(4)
    fake.editor.fireCursor(4)
    fake.editor.fireCursor(4)

    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)
    expect(overlayText(fake)).toContain(GIT_BLAME_STRINGS_EN.you)
    expect(overlayTop(fake)).toBe('62px')
    unmount()
  })

  it('repositions the overlay when the editor scrolls or relayouts', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(overlayText(fake)).toContain('Jane Dev'))
    const paintsBefore = fake.scrolledVisible.mock.calls.length

    fake.editor.fireScroll()
    fake.editor.fireLayout()

    expect(fake.scrolledVisible.mock.calls.length).toBeGreaterThan(paintsBefore)
    // The cursor line is still line 3 — the overlay stays pinned to it.
    expect(overlayTop(fake)).toBe('42px')
    unmount()
  })

  it('paints You on a never-blamed inserted line while the buffer is dirty', async () => {
    const fake = createFakeEditor()
    const { unmount, rerender } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    rerender(baseArgs(fake, { isDirty: true }))
    fake.editor.fireCursor(99)

    expect(overlayText(fake)).toContain(GIT_BLAME_STRINGS_EN.you)
    unmount()
  })

  it('stays silent on a never-blamed line when the buffer is clean', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    fake.editor.fireCursor(99)

    expect(overlayHidden(fake)).toBe(true)
    unmount()
  })

  it('refetches when the worktree HEAD sha changes and serves a reverted sha from cache', async () => {
    const fake = createFakeEditor()
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-2' }
    rerender(baseArgs(fake))
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(2))

    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-1' }
    rerender(baseArgs(fake))
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('refetches when the buffer is saved (dirty to clean with new content), not on keystrokes', async () => {
    const fake = createFakeEditor()
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    rerender(baseArgs(fake, { isDirty: true, content: 'line1\nedited\nline3' }))
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)

    rerender(baseArgs(fake, { isDirty: false, content: 'line1\nedited\nline3' }))
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(2))
    unmount()
  })

  it('marks the annotation stale while the buffer has unsaved changes', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake, { isDirty: true })
    })
    await waitFor(() => expect(overlayText(fake)).toContain(GIT_BLAME_STRINGS_EN.stale))
    unmount()
  })

  it('skips oversized files with zero git calls and answers hovers with the skip reason', async () => {
    const fake = createFakeEditor()
    const oversized = 'x\n'.repeat(200_001)
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake, { content: oversized })
    })
    await act(async () => {})

    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    expect(monacoMocks.registerHoverProvider).toHaveBeenCalled()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.fn() call args are untyped at the mock boundary; the hook registers exactly this provider shape.
    const provider = monacoMocks.registerHoverProvider.mock.calls[0][1] as {
      provideHover: (model: unknown, position: unknown) => { contents: { value: string }[] } | null
    }
    const hover = provider.provideHover(fake.model, { lineNumber: 1, column: 1 })
    expect(hover).not.toBeNull()
    const text = JSON.stringify(hover?.contents ?? [])
    expect(text).toMatch(/many lines/)
    unmount()
  })

  it('stays silent on an empty repository (no HEAD) without calling git', async () => {
    const fake = createFakeEditor()
    storeMock.gitStatusHeadByWorktree = { 'wt-1': '' }
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await act(async () => {})

    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    unmount()
  })

  it('does nothing outside a git worktree', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake, { worktreePath: null, worktreeId: null })
    })
    await act(async () => {})

    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    unmount()
  })

  it('disables the feature on an unsupported host and never asks again', async () => {
    const fake = createFakeEditor()
    blameClient.isGitBlameSupportedForHost.mockReturnValue(false)
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()

    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-2' }
    rerender(baseArgs(fake))
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    unmount()
  })

  it('stays alive after an ordinary git failure — the next HEAD change retries the fetch', async () => {
    const fake = createFakeEditor()
    blameClient.getRuntimeGitBlame.mockRejectedValue(new Error('fatal: not a git repository'))
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)
    expect(overlayText(fake)).toBe('')

    blameClient.getRuntimeGitBlame.mockResolvedValue(BLAME_RESULT)
    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-2' }
    rerender(baseArgs(fake))
    await waitFor(() => expect(overlayText(fake)).toContain('Jane Dev'))
    unmount()
  })

  it('registers a hover provider that only answers for its own editor model', async () => {
    const fake = createFakeEditor()
    const otherModel = createFakeModel()
    const { unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(monacoMocks.registerHoverProvider).toHaveBeenCalled())

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.fn() call args are untyped at the mock boundary; the hook registers exactly this provider shape.
    const provider = monacoMocks.registerHoverProvider.mock.calls[0][1] as {
      provideHover: (model: unknown, position: unknown) => { contents: { value: string }[] } | null
    }
    expect(provider.provideHover(otherModel, { lineNumber: 3, column: 1 })).toBeNull()

    const hover = provider.provideHover(fake.model, { lineNumber: 3, column: 1 })
    expect(hover).not.toBeNull()
    const text = JSON.stringify(hover?.contents ?? [])
    expect(text).toContain('abc1234')
    expect(text).toContain('Jane Dev')
    unmount()
  })

  it('removes the overlay and disposes listeners when disabled or unmounted', async () => {
    const fake = createFakeEditor()
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoGitBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))
    expect(overlayFor(fake)).not.toBeNull()

    rerender(baseArgs(fake, { enabled: false }))
    expect(fake.disposers.length).toBeGreaterThan(0)
    for (const dispose of fake.disposers) {
      expect(dispose).toHaveBeenCalled()
    }
    expect(overlayFor(fake)).toBeNull()

    unmount()
  })
})
