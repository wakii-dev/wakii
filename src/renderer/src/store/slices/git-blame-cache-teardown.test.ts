/**
 * Wiring regression for the inline-blame cache eviction helpers: the module
 * scope cache in components/editor/git-blame-cache.ts must be evicted by the
 * two teardown chokepoints (closeFile for a tab, removeWorktree for a whole
 * worktree) — otherwise stale entries survive for the session (spec FI-34
 * task-6 exit criteria: eviction on tab close + worktree remove).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import { createEditorStore } from './editor-slice-test-harness'
import { createTestStore, makeWorktree, seedStore } from './store-test-helpers'
import type { GitBlameResult } from '../../../../shared/git-blame-types'
import { clearGitBlameCacheForWorktree, gitBlameCache } from '@/components/editor/git-blame-cache'

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: vi.fn()
}))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentStatusModule>()
  return { ...actual, detectAgentStatusFromTitle: vi.fn().mockReturnValue(null) }
})

const notifyHostOfMirroredEditorCloseMock = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: (...args: unknown[]) =>
    notifyHostOfMirroredEditorCloseMock(...args)
}))

const mockApi = {
  worktrees: {
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    forceDeletePreservedBranch: vi.fn().mockResolvedValue({ deleted: true }),
    updateMeta: vi.fn().mockResolvedValue({})
  },
  pty: { kill: vi.fn().mockResolvedValue(undefined) },
  runtimeEnvironments: { call: vi.fn().mockResolvedValue({ ok: true, result: {} }) }
}
// @ts-expect-error -- minimal window.api stub for the store under test
globalThis.window = { api: mockApi }

const BLAME: GitBlameResult = {
  filePath: 'src/app.ts',
  lines: [
    {
      lineNumber: 1,
      hash: 'a'.repeat(40),
      abbreviatedHash: 'aaaaaaa',
      author: 'Jane Dev',
      authorTime: 1_700_000_000_000,
      summary: 'Seed entry',
      committed: true
    }
  ]
}

const HEAD = 'sha-1'
const REVISION = 'rev-1'

function seedCacheEntry(worktreeId: string, filePath: string): void {
  gitBlameCache.set(worktreeId, filePath, HEAD, BLAME, REVISION)
}

describe('git blame cache teardown wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const worktreeId of ['wt-1', 'repo1::/path/wt1', 'repo1::/path/wt2']) {
      clearGitBlameCacheForWorktree(worktreeId)
    }
    mockApi.worktrees.remove.mockResolvedValue(undefined)
  })

  it('closeFile evicts the closed file blame entries', () => {
    const store = createEditorStore()
    store.getState().openFile({
      filePath: '/repo/src/app.ts',
      relativePath: 'src/app.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
    seedCacheEntry('wt-1', 'src/app.ts')
    expect(gitBlameCache.get('wt-1', 'src/app.ts', HEAD, REVISION)).not.toBeNull()

    store.getState().closeFile('/repo/src/app.ts')

    expect(gitBlameCache.get('wt-1', 'src/app.ts', HEAD, REVISION)).toBeNull()
  })

  it('removeWorktree evicts the removed worktree blame entries only', async () => {
    const store = createTestStore()
    seedStore(store, {
      worktreesByRepo: {
        repo1: [
          makeWorktree({ id: 'repo1::/path/wt1', repoId: 'repo1', path: '/path/wt1' }),
          makeWorktree({ id: 'repo1::/path/wt2', repoId: 'repo1', path: '/path/wt2' })
        ]
      }
    })
    seedCacheEntry('repo1::/path/wt1', 'src/app.ts')
    seedCacheEntry('repo1::/path/wt2', 'src/keep.ts')

    const result: { ok: boolean } | { ok: false; error: string } = await store
      .getState()
      .removeWorktree({ id: 'repo1::/path/wt1', executionHostId: null })
    expect(result.ok).toBe(true)

    expect(gitBlameCache.get('repo1::/path/wt1', 'src/app.ts', HEAD, REVISION)).toBeNull()
    // A surviving worktree's entries must not be touched.
    expect(gitBlameCache.get('repo1::/path/wt2', 'src/keep.ts', HEAD, REVISION)).not.toBeNull()
  })
})
