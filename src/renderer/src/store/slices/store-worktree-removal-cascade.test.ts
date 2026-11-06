import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import { getDefaultSettings } from '../../../../shared/constants'
import { createCompatibleRuntimeStatusResponseIfNeeded } from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'
import { toast } from 'sonner'
import { createTestStore, makeLayout, makeTab, makeWorktree, seedStore } from './store-test-helpers'
import { loadSessionCommitDrafts, saveSessionCommitDrafts } from '@/lib/source-control-commit-draft-session'
import { makeOpenFile } from './store-session-test-harness'
import { createStoreCascadesMockApi } from './store-cascades-test-harness'
import '../../../../shared/worktree/host-qualified-identity'

const mockUnregisterPtyDataHandlers = vi.hoisted(() => vi.fn<() => unknown[]>(() => []))
const mockRestorePtyDataHandlersAfterFailedShutdown = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: mockRestorePtyDataHandlersAfterFailedShutdown,
  unregisterPtyDataHandlers: mockUnregisterPtyDataHandlers
}))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentStatusModule>()
  return {
    ...actual,
    detectAgentStatusFromTitle: vi.fn().mockReturnValue(null)
  }
})

const mockApi = createStoreCascadesMockApi()

describe('removeWorktree cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRuntimeCompatibilityCacheForTests()
    saveSessionCommitDrafts({})
    mockApi.worktrees.remove.mockResolvedValue(undefined)
    mockApi.worktrees.forceDeletePreservedBranch.mockResolvedValue({ deleted: true })
    mockApi.runtimeEnvironments.call.mockReset()
    mockApi.runtimeEnvironments.call.mockImplementation((args: { method: string }) =>
      Promise.resolve(
        createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
          id: 'rpc-default',
          ok: true,
          result: {},
          _meta: { runtimeId: 'remote-runtime' }
        }
      )
    )
  })

  it('cleans up all associated state on successful removal', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'

    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1', path: '/path/wt1' })]
      },
      tabsByWorktree: {
        [worktreeId]: [
          makeTab({ id: 'tab1', worktreeId }),
          makeTab({ id: 'tab2', worktreeId, sortOrder: 1 })
        ]
      },
      ptyIdsByTabId: {
        tab1: ['pty1'],
        tab2: ['pty2']
      },
      terminalLayoutsByTabId: {
        tab1: makeLayout(),
        tab2: makeLayout()
      },
      deleteStateByWorktreeId: {
        [worktreeId]: {
          isDeleting: false,
          error: null,
          canForceDelete: false,
          forceDeleteReason: null
        }
      },
      fileSearchStateByWorktree: {
        [worktreeId]: {
          query: 'needle',
          caseSensitive: true,
          wholeWord: false,
          useRegex: false,
          includePattern: '*.ts',
          excludePattern: 'dist/**',
          results: { files: [], totalMatches: 0, truncated: false },
          resultOwner: null,
          loading: false,
          collapsedFiles: new Set(['/path/wt1/file.ts']),
          replaceQuery: '',
          replaceVisible: false,
          replaceAllInProgress: false,
          cancelRequested: false,
          lastReplaceOp: null
        }
      },
      activeWorktreeId: worktreeId,
      activeTabId: 'tab1',
      openFiles: [makeOpenFile({ id: '/path/wt1/file.ts', worktreeId })],
      activeFileId: '/path/wt1/file.ts',
      activeTabType: 'editor',
      activeFileIdByWorktree: { [worktreeId]: '/path/wt1/file.ts' },
      activeTabTypeByWorktree: { [worktreeId]: 'editor' },
      rightSidebarExplorerViewByWorktree: { [worktreeId]: 'search' }
    })
    saveSessionCommitDrafts({
      [worktreeId]: 'feat: stale draft',
      'repo1::/path/wt2': 'fix: keep draft'
    })

    const result = await store.getState().removeWorktree({ id: worktreeId, executionHostId: null })
    const s = store.getState()

    expect(result).toEqual({ ok: true })
    expect(s.worktreesByRepo['repo1']).toEqual([])
    expect(s.tabsByWorktree[worktreeId]).toBeUndefined()
    expect(s.ptyIdsByTabId['tab1']).toBeUndefined()
    expect(s.ptyIdsByTabId['tab2']).toBeUndefined()
    expect(s.terminalLayoutsByTabId['tab1']).toBeUndefined()
    expect(s.terminalLayoutsByTabId['tab2']).toBeUndefined()
    expect(s.deleteStateByWorktreeId[worktreeId]).toBeUndefined()
    expect(s.fileSearchStateByWorktree[worktreeId]).toBeUndefined()
    expect(s.activeWorktreeId).toBeNull()
    expect(s.activeTabId).toBeNull()
    expect(s.openFiles).toEqual([])
    expect(s.activeFileId).toBeNull()
    expect(s.activeTabType).toBe('terminal')
    expect(s.activeFileIdByWorktree[worktreeId]).toBeUndefined()
    expect(s.activeTabTypeByWorktree[worktreeId]).toBeUndefined()
    expect(s.rightSidebarExplorerViewByWorktree[worktreeId]).toBeUndefined()
    expect(loadSessionCommitDrafts()).toEqual({ 'repo1::/path/wt2': 'fix: keep draft' })
  })

  it('warns when workspace removal keeps the local branch', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'
    mockApi.worktrees.remove.mockResolvedValueOnce({
      preservedBranch: { branchName: 'feature/test', head: 'def456' }
    })

    seedStore(store, {
      worktreesByRepo: {
        repo1: [
          makeWorktree({
            id: worktreeId,
            repoId: 'repo1',
            path: '/path/wt1',
            displayName: 'Review cleanup'
          })
        ]
      }
    })

    const result = await store.getState().removeWorktree({ id: worktreeId, executionHostId: null })

    expect(result).toEqual({
      ok: true,
      preservedBranch: { branchName: 'feature/test', head: 'def456', hostId: 'local' }
    })
    expect(toast.warning).toHaveBeenCalledWith('Worktree deleted, branch kept', {
      id: 'preserved-branch:feature/test:def456',
      description: expect.anything(),
      dismissible: true,
      duration: Infinity
    })
  })

  it('can suppress preserved branch warning toasts for batched cleanup removal', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'
    mockApi.worktrees.remove.mockResolvedValueOnce({
      preservedBranch: { branchName: 'feature/test', head: 'def456' }
    })

    seedStore(store, {
      worktreesByRepo: {
        repo1: [
          makeWorktree({
            id: worktreeId,
            repoId: 'repo1',
            path: '/path/wt1',
            displayName: 'Review cleanup'
          })
        ]
      }
    })

    const result = await store
      .getState()
      .removeWorktree({ id: worktreeId, executionHostId: null }, false, {
        suppressPreservedBranchToast: true
      })

    expect(result).toEqual({
      ok: true,
      preservedBranch: { branchName: 'feature/test', head: 'def456', hostId: 'local' }
    })
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('sets delete state with dirty/untracked error and canForceDelete=true on failure', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'
    const error = 'Worktree has uncommitted or untracked changes.'

    mockApi.worktrees.remove.mockRejectedValueOnce(new Error(error))

    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1' })]
      },
      tabsByWorktree: { [worktreeId]: [makeTab({ id: 'tab1', worktreeId })] },
      ptyIdsByTabId: { tab1: ['pty1'] },
      terminalLayoutsByTabId: { tab1: makeLayout() },
      activeWorktreeId: worktreeId,
      activeTabId: 'tab1'
    })

    const result = await store.getState().removeWorktree({ id: worktreeId, executionHostId: null })
    const s = store.getState()

    expect(result).toEqual({ ok: false, error })
    expect(s.deleteStateByWorktreeId[worktreeId]).toEqual({
      isDeleting: false,
      error,
      canForceDelete: true,
      forceDeleteReason: 'dirty'
    })
    expect(s.worktreesByRepo['repo1']).toHaveLength(1)
    expect(s.tabsByWorktree[worktreeId]).toHaveLength(1)
    expect(s.ptyIdsByTabId['tab1']).toEqual(['pty1'])
    expect(mockApi.pty.kill).not.toHaveBeenCalled()
    expect(s.activeWorktreeId).toBe(worktreeId)
  })

  it.each([
    'Could not connect to the remote Wakii runtime.',
    'Remote Wakii runtime closed the connection.',
    'Timed out waiting for the remote Wakii runtime to respond.'
  ])(
    'does not offer force delete for wrapped remote runtime failure: %s',
    async (runtimeFailure) => {
      const store = createTestStore()
      const worktreeId = 'repo1::/path/wt1'
      const error = `Error invoking remote method 'runtime-environments:call': Error: ${runtimeFailure}`
      const displayed = runtimeFailure

      mockApi.runtimeEnvironments.call.mockImplementation((args: { method: string }) => {
        const compatibility = createCompatibleRuntimeStatusResponseIfNeeded(args)
        if (compatibility) {
          return Promise.resolve(compatibility)
        }
        if (args.method === 'repo.hooksCheck') {
          return Promise.resolve({
            id: 'rpc-hooks',
            ok: true,
            result: { hasHooks: false, hooks: null, mayNeedUpdate: false },
            _meta: { runtimeId: 'remote-runtime' }
          })
        }
        return Promise.reject(new Error(error))
      })

      seedStore(store, {
        settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'env-1' },
        worktreesByRepo: {
          repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1', hostId: 'runtime:env-1' })]
        },
        tabsByWorktree: {},
        ptyIdsByTabId: {},
        terminalLayoutsByTabId: {}
      })

      const result = await store
        .getState()
        .removeWorktree({ id: worktreeId, executionHostId: null })

      expect(result).toEqual({ ok: false, error: displayed })
      expect(store.getState().deleteStateByWorktreeId[worktreeId]).toEqual({
        isDeleting: false,
        error: displayed,
        canForceDelete: false,
        forceDeleteReason: null
      })
      expect(mockApi.worktrees.remove).not.toHaveBeenCalled()
    }
  )

  it('offers force delete for orphaned Wakii worktree directories', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'

    mockApi.worktrees.remove.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'worktrees:remove': Error: Worktree is no longer registered with Git but its directory remains."
      )
    )

    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1' })]
      },
      tabsByWorktree: {},
      ptyIdsByTabId: {},
      terminalLayoutsByTabId: {}
    })

    const result = await store.getState().removeWorktree({ id: worktreeId, executionHostId: null })

    expect(result.ok).toBe(false)
    expect(store.getState().deleteStateByWorktreeId[worktreeId]?.canForceDelete).toBe(true)
  })

  it('does NOT affect other worktrees', async () => {
    const store = createTestStore()
    const wt1 = 'repo1::/path/wt1'
    const wt2 = 'repo1::/path/wt2'

    seedStore(store, {
      worktreesByRepo: {
        repo1: [
          makeWorktree({ id: wt1, repoId: 'repo1', path: '/path/wt1' }),
          makeWorktree({ id: wt2, repoId: 'repo1', path: '/path/wt2', displayName: 'wt2' })
        ]
      },
      tabsByWorktree: {
        [wt1]: [makeTab({ id: 'tab1', worktreeId: wt1 })],
        [wt2]: [makeTab({ id: 'tab2', worktreeId: wt2 })]
      },
      ptyIdsByTabId: {
        tab1: ['pty1'],
        tab2: ['pty2']
      },
      terminalLayoutsByTabId: {
        tab1: makeLayout(),
        tab2: makeLayout()
      },
      fileSearchStateByWorktree: {
        [wt1]: {
          query: 'old',
          caseSensitive: false,
          wholeWord: false,
          useRegex: false,
          includePattern: '',
          excludePattern: '',
          results: { files: [], totalMatches: 0, truncated: false },
          resultOwner: null,
          loading: false,
          collapsedFiles: new Set(),
          replaceQuery: '',
          replaceVisible: false,
          replaceAllInProgress: false,
          cancelRequested: false,
          lastReplaceOp: null
        },
        [wt2]: {
          query: 'keep',
          caseSensitive: true,
          wholeWord: true,
          useRegex: false,
          includePattern: '*.md',
          excludePattern: '',
          results: { files: [], totalMatches: 1, truncated: false },
          resultOwner: null,
          loading: false,
          collapsedFiles: new Set(['/path/wt2/notes.md']),
          replaceQuery: '',
          replaceVisible: false,
          replaceAllInProgress: false,
          cancelRequested: false,
          lastReplaceOp: null
        }
      },
      activeWorktreeId: wt2,
      activeTabId: 'tab2'
    })

    await store.getState().removeWorktree({ id: wt1, executionHostId: null })
    const s = store.getState()

    expect(s.tabsByWorktree[wt2]).toHaveLength(1)
    expect(s.tabsByWorktree[wt2][0].id).toBe('tab2')
    expect(s.ptyIdsByTabId['tab2']).toEqual(['pty2'])
    expect(s.terminalLayoutsByTabId['tab2']).toEqual(makeLayout())
    expect(s.fileSearchStateByWorktree[wt2]?.query).toBe('keep')
    expect(s.activeWorktreeId).toBe(wt2)
    expect(s.activeTabId).toBe('tab2')

    expect(s.worktreesByRepo['repo1'].find((w) => w.id === wt1)).toBeUndefined()
    expect(s.tabsByWorktree[wt1]).toBeUndefined()
    expect(s.ptyIdsByTabId['tab1']).toBeUndefined()
    expect(s.terminalLayoutsByTabId['tab1']).toBeUndefined()
    expect(s.fileSearchStateByWorktree[wt1]).toBeUndefined()
  })

  it('shuts down terminals after the backend confirms worktree removal', async () => {
    const store = createTestStore()
    const worktreeId = 'repo1::/path/wt1'
    const callOrder: string[] = []

    mockApi.pty.kill.mockImplementationOnce(async () => {
      callOrder.push('kill')
    })
    mockApi.worktrees.remove.mockImplementationOnce(async () => {
      callOrder.push('remove')
    })

    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: worktreeId, repoId: 'repo1', path: '/path/wt1' })]
      },
      tabsByWorktree: {
        [worktreeId]: [makeTab({ id: 'tab1', worktreeId })]
      },
      ptyIdsByTabId: {
        tab1: ['pty1']
      },
      terminalLayoutsByTabId: {
        tab1: makeLayout()
      }
    })

    const result = await store.getState().removeWorktree({ id: worktreeId, executionHostId: null })

    expect(result).toEqual({ ok: true })
    expect(callOrder).toEqual(['remove', 'kill'])
  })
})
