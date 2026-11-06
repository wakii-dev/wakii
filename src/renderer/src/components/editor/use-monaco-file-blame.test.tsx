// @vitest-environment happy-dom
// Acceptance contract — GitLens-parity SF-2 (mindmap: file-blame toggle).
// Intentionally RED until use-monaco-file-blame lands: whole-file blame gutter,
// toggle state remembered via a persisted setting, and NO background poll —
// the HEAD+revision blame cache (FI-35) stays the only refetch trigger.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBlameResult } from '../../../../shared/git-blame-types'
import { buildDefaultSettings } from '../../../../shared/default-global-settings'
import type { NotificationSettings } from '../../../../shared/notification-settings-types'
import type { VoiceSettings } from '../../../../shared/speech-types'
import { clearFileBlameCacheForWorktree, useMonacoFileBlame } from './use-monaco-file-blame'

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
  useAppStore: Object.assign(
    (selector: (state: typeof storeMock) => unknown) => selector(storeMock),
    { getState: () => storeMock }
  )
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const BLAME_RESULT: GitBlameResult = {
  filePath: 'src/app.ts',
  lines: [
    {
      lineNumber: 1,
      hash: 'a'.repeat(40),
      abbreviatedHash: 'abc1234',
      author: 'Jane Dev',
      authorTime: 1_700_000_000_000,
      summary: 'First line committed',
      committed: true
    },
    {
      lineNumber: 2,
      hash: 'b'.repeat(40),
      abbreviatedHash: 'def5678',
      author: 'John Doe',
      authorTime: 1_700_030_000_000,
      summary: 'Second line committed',
      committed: true
    }
  ]
}

function createFakeEditor() {
  const domNode = document.createElement('div')
  return {
    domNode,
    getDomNode: vi.fn(() => domNode),
    getModel: vi.fn(() => ({ getLineMaxColumn: vi.fn(() => 40) }))
  }
}

type HookArgs = Parameters<typeof useMonacoFileBlame>[0]

function baseArgs(
  fake: ReturnType<typeof createFakeEditor>,
  overrides: Partial<HookArgs> = {}
): HookArgs {
  return {
    enabled: true,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake editor stubs only the API the hook touches; no full Monaco instance in unit tests.
    mountedEditor: fake as never,
    worktreeId: 'wt-1',
    worktreePath: '/repo',
    relativePath: 'src/app.ts',
    content: 'line1\nline2',
    isDirty: false,
    ...overrides
  }
}

function gutterFor(fake: { domNode: HTMLElement }): HTMLDivElement | null {
  return fake.domNode.querySelector<HTMLDivElement>('.orca-file-blame-gutter')
}

function gutterRows(fake: { domNode: HTMLElement }): HTMLElement[] {
  return Array.from(fake.domNode.querySelectorAll<HTMLElement>('.orca-file-blame-row'))
}

beforeEach(() => {
  blameClient.getRuntimeGitBlame.mockReset()
  blameClient.getRuntimeGitBlame.mockResolvedValue(BLAME_RESULT)
  blameClient.isGitBlameSupportedForHost.mockReset()
  blameClient.isGitBlameSupportedForHost.mockReturnValue(true)
  storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-1' }
  clearFileBlameCacheForWorktree('wt-1')
})

describe('useMonacoFileBlame (SF-2)', () => {
  it('fetches whole-file blame once and paints a gutter row per blamed line', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(fake)
    })

    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1' }),
      'src/app.ts'
    )
    await waitFor(() => expect(gutterRows(fake)).toHaveLength(2))
    // One row per blamed line, pinned to that line's geometry (line N at top (N-1)*20).
    const rows = gutterRows(fake)
    expect(rows[0]?.style.top).toBe('0px')
    expect(rows[1]?.style.top).toBe('20px')
    expect(rows[0]?.textContent).toContain('Jane Dev')
    expect(rows[1]?.textContent).toContain('John Doe')
    unmount()
  })

  it('toggle off removes the gutter and no further git calls happen while disabled', async () => {
    const fake = createFakeEditor()
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))
    expect(gutterFor(fake)).not.toBeNull()

    rerender(baseArgs(fake, { enabled: false }))
    expect(gutterFor(fake)).toBeNull()

    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-2' }
    rerender(baseArgs(fake, { enabled: false }))
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('remembers the toggle through the persisted editorFileBlameEnabled setting', () => {
    const defaults = buildDefaultSettings({
      workspaceDir: '/workspace',
      appFontFamily: 'system-ui',
      editorAutoSaveDelayMs: 1_000,
      primarySelectionMiddleClickPaste: false,
      primarySelectionDefaultedForLinux: false,
      terminalFontFamily: 'monospace',
      terminalInactivePaneOpacity: 1,
      terminalRightClickToPaste: false,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: notification/voice defaults are irrelevant to editor settings under test; those sections are exercised by their own suites.
      notifications: {} as NotificationSettings,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: notification/voice defaults are irrelevant to editor settings under test; those sections are exercised by their own suites.
      voice: {} as VoiceSettings
    })
    // Opt-in: the whole-file gutter is visually heavy, unlike inline blame.
    expect(defaults.editorFileBlameEnabled).toBe(false)
  })

  it('does not poll in the background — an idle hour triggers zero extra git calls', async () => {
    const fake = createFakeEditor()
    const { unmount } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    vi.useFakeTimers()
    vi.advanceTimersByTime(60 * 60_000)
    vi.useRealTimers()

    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('refetches only on HEAD change or save — rerenders and cursor moves stay cached', async () => {
    const fake = createFakeEditor()
    const { rerender, unmount } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(fake)
    })
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1))

    // Same props, keystrokes (dirty buffer), and scroll churn must not refetch.
    rerender(baseArgs(fake))
    rerender(baseArgs(fake, { isDirty: true, content: 'line1\nedited' }))
    rerender(baseArgs(fake, { isDirty: true, content: 'line1\nedited again' }))
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)

    // A save (dirty -> clean with the final content) is the next revision — one refetch.
    rerender(baseArgs(fake, { content: 'line1\nedited again' }))
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(2))

    // HEAD movement invalidates the cache — one more refetch.
    storeMock.gitStatusHeadByWorktree = { 'wt-1': 'sha-2' }
    rerender(baseArgs(fake, { content: 'line1\nedited again' }))
    await waitFor(() => expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(3))
    unmount()
  })

  it('renders nothing outside a git worktree or on an empty repository', async () => {
    const noWorktree = createFakeEditor()
    const { unmount: unmount1 } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(noWorktree, { worktreeId: null, worktreePath: null })
    })
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    expect(gutterFor(noWorktree)).toBeNull()
    unmount1()

    const emptyRepo = createFakeEditor()
    storeMock.gitStatusHeadByWorktree = { 'wt-1': '' }
    const { unmount: unmount2 } = renderHook((args: HookArgs) => useMonacoFileBlame(args), {
      initialProps: baseArgs(emptyRepo)
    })
    await act(async () => {})
    expect(blameClient.getRuntimeGitBlame).not.toHaveBeenCalled()
    unmount2()
  })
})
