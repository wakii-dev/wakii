import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from './dispatcher'
import type { RpcRequest } from './core'
import { OrcaRuntimeService } from '../orca-runtime'
import { settledWriteStub } from '../../providers/settled-pty-write-stub'
import { TERMINAL_METHODS } from './methods/terminal'
import { getDefaultWorkspaceSession } from '../../../shared/constants'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'

// Why (#59): the registry still knows the launchAgent while the pane is booting or
// sits at a bare shell. A single-line send there must stay raw — wrapping put
// literal `[200~` into the shell. The settled agent-prompt path is excluded here.
describe('terminal send single-line paste gate (launch-agent foreground, non-settled)', () => {
  const GATED_PTY_ID = 'pty-launch-agent-gate'
  const WORKTREE_ID = 'repo-1::/tmp/gate-worktree'
  const LEAF_ID = '33333333-3333-4333-8333-333333333333'

  function makeRequest(params: unknown): RpcRequest {
    return { id: 'request', authToken: 'token', method: 'terminal.send', params }
  }

  function makeRealRuntimeStore(): Record<string, unknown> {
    const session: WorkspaceSessionState = getDefaultWorkspaceSession()
    return {
      getWorkspaceSession: vi.fn(() => session),
      setWorkspaceSession: vi.fn(),
      getRepos: vi.fn(() => [
        {
          id: 'repo-1',
          path: '/tmp/gate-worktree',
          displayName: 'gate',
          badgeColor: '#000000',
          addedAt: 0
        }
      ]),
      getAllWorktreeMeta: vi.fn(() => ({})),
      getWorktreeMeta: vi.fn(() => undefined),
      setWorktreeMeta: vi.fn(),
      removeWorktreeMeta: vi.fn(),
      getSettings: vi.fn(() => ({ workspaceDir: '/tmp/workspaces' })),
      getProjects: vi.fn(() => [])
    }
  }

  function makeRuntimeWithLaunchedAgentPty(): {
    runtime: OrcaRuntimeService
    handle: string
    write: ReturnType<typeof vi.fn>
    settledProbe: ReturnType<typeof vi.fn>
  } {
    const runtime = new OrcaRuntimeService(makeRealRuntimeStore() as never)
    const write = vi.fn(() => true)
    runtime.setPtyController({
      spawn: vi.fn(async () => ({ id: GATED_PTY_ID, incarnationId: 'inc-1' })),
      write,
      writeWithSettlement: settledWriteStub(write),
      kill: () => true,
      getForegroundProcess: async () => null,
      listProcesses: vi.fn(async () => []),
      hasPty: () => true
    } as never)
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, {
      tabs: [
        {
          tabId: 'tab-1',
          worktreeId: WORKTREE_ID,
          title: 'Agent',
          activeLeafId: LEAF_ID,
          layout: null
        }
      ],
      leaves: [
        {
          tabId: 'tab-1',
          worktreeId: WORKTREE_ID,
          leafId: LEAF_ID,
          paneRuntimeId: 1,
          ptyId: GATED_PTY_ID,
          paneTitle: null,
          title: ''
        }
      ]
    })
    runtime.onPtySpawned(GATED_PTY_ID, 'inc-1', { awaitsRegistration: false })
    const internals = runtime as unknown as {
      ptysById: Map<string, { launchAgent: string | null }>
      issuePtyHandle(pty: unknown): string
    }
    const pty = internals.ptysById.get(GATED_PTY_ID)
    if (!pty) {
      throw new Error('pty record was not registered')
    }
    pty.launchAgent = 'claude'
    const handle = internals.issuePtyHandle(pty)
    // Foreground NON-settled: the RPC must not take the settled agent-prompt path.
    const settledProbe = vi
      .spyOn(runtime, 'isTerminalRunningSettledPromptAgent')
      .mockResolvedValue(false)
    return { runtime, handle, write, settledProbe }
  }

  it('writes single-line bytes into the agent pty without bracketed-paste markers', async () => {
    const { runtime, handle, write, settledProbe } = makeRuntimeWithLaunchedAgentPty()
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest({
        terminal: handle,
        text: 'git status',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-cli', type: 'desktop' }
      })
    )

    expect(response.ok).toBe(true)
    expect(settledProbe).toHaveBeenCalledWith(handle)
    const written = write.mock.calls
      .map(([, data]) => data)
      .filter((data): data is string => typeof data === 'string')
      .join('')
    expect(written).toBe('git status\r')
    expect(written).not.toContain('\x1b[200~')
    expect(written).not.toContain('\x1b[201~')
  }, 15_000)
})
