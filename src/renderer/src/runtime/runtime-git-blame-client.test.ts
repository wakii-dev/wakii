import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import type * as runtimeRpcClientModule from './runtime-rpc-client'
import {
  GitBlameHostUnsupportedError,
  getRuntimeGitBlame,
  isGitBlameSupportedForHost,
  resetGitBlameDisabledHosts
} from './runtime-git-blame-client'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('./runtime-rpc-client', async (importOriginal) => {
  const actual = await importOriginal<typeof runtimeRpcClientModule>()
  return { ...actual, callRuntimeRpc }
})

const blameResult = {
  filePath: 'src/app.ts',
  lines: [
    {
      lineNumber: 1,
      hash: 'a'.repeat(40),
      abbreviatedHash: 'aaaaaaa',
      author: 'Jane Dev',
      authorTime: 1_700_000_000_000,
      summary: 'Add blame reader',
      committed: true
    }
  ]
}

function rpcFailure(code: string): RuntimeRpcCallError {
  return new RuntimeRpcCallError({
    id: 'call-1',
    ok: false,
    error: { code, message: `boom: ${code}` },
    _meta: { runtimeId: 'runtime-1' }
  })
}

function withWindow(api: Record<string, unknown>): void {
  vi.stubGlobal('window', { api: { git: api } })
}

const localContext = {
  settings: { activeRuntimeEnvironmentId: null },
  worktreeId: null,
  worktreePath: 'C:/repo',
  connectionId: undefined
} as const

const runtimeContext = {
  settings: { activeRuntimeEnvironmentId: 'env-1' },
  worktreeId: 'wt-9',
  worktreePath: 'C:/repo',
  connectionId: undefined
} as const

beforeEach(() => {
  callRuntimeRpc.mockReset()
  resetGitBlameDisabledHosts()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRuntimeGitBlame', () => {
  it('routes the local path through the IPC bridge', async () => {
    const blame = vi.fn().mockResolvedValue(blameResult)
    withWindow({ blame })

    await expect(getRuntimeGitBlame({ ...localContext }, 'src/app.ts')).resolves.toEqual(blameResult)
    expect(blame).toHaveBeenCalledWith({
      worktreePath: 'C:/repo',
      connectionId: undefined,
      filePath: 'src/app.ts'
    })
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('routes the remote path through the runtime RPC with a worktree selector', async () => {
    callRuntimeRpc.mockResolvedValue(blameResult)

    await expect(getRuntimeGitBlame({ ...runtimeContext }, 'src/app.ts')).resolves.toEqual(
      blameResult
    )
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'git.blame',
      { worktree: 'id:wt-9', filePath: 'src/app.ts' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('disables the host in-memory when the runtime answers method_not_found, without re-asking', async () => {
    callRuntimeRpc.mockRejectedValue(rpcFailure('method_not_found'))

    await expect(getRuntimeGitBlame({ ...runtimeContext }, 'src/app.ts')).rejects.toBeInstanceOf(
      GitBlameHostUnsupportedError
    )
    expect(isGitBlameSupportedForHost({ ...runtimeContext })).toBe(false)

    const callsAfterDisable = callRuntimeRpc.mock.calls.length
    await expect(getRuntimeGitBlame({ ...runtimeContext }, 'src/app.ts')).rejects.toBeInstanceOf(
      GitBlameHostUnsupportedError
    )
    expect(callRuntimeRpc.mock.calls.length).toBe(callsAfterDisable)
  })

  it('keeps hosts independent — a disabled environment does not disable another', async () => {
    const oldHost = {
      settings: { activeRuntimeEnvironmentId: 'env-old' },
      worktreeId: 'wt-1',
      worktreePath: '/w',
      connectionId: undefined
    } as const
    const newHost = {
      settings: { activeRuntimeEnvironmentId: 'env-new' },
      worktreeId: 'wt-1',
      worktreePath: '/w',
      connectionId: undefined
    } as const
    callRuntimeRpc.mockImplementation((target) =>
      target.kind === 'environment' && target.environmentId === 'env-old'
        ? Promise.reject(rpcFailure('method_not_found'))
        : Promise.resolve(blameResult)
    )

    await expect(getRuntimeGitBlame(oldHost, 'src/app.ts')).rejects.toBeInstanceOf(
      GitBlameHostUnsupportedError
    )
    await expect(getRuntimeGitBlame(newHost, 'src/app.ts')).resolves.toEqual(blameResult)
    expect(isGitBlameSupportedForHost(oldHost)).toBe(false)
    expect(isGitBlameSupportedForHost(newHost)).toBe(true)
  })

  it('disables only the SSH connection whose relay answers -32601 (main-side marker)', async () => {
    const marker = 'git-blame-unsupported-host'
    const blame = vi.fn().mockRejectedValue(new Error(`${marker}: host too old`))
    withWindow({ blame })

    const sshContext = { ...localContext, connectionId: 'conn-7' }
    await expect(getRuntimeGitBlame(sshContext, 'src/app.ts')).rejects.toBeInstanceOf(
      GitBlameHostUnsupportedError
    )
    expect(isGitBlameSupportedForHost(sshContext)).toBe(false)

    const otherConnection = { ...localContext, connectionId: 'conn-8' }
    expect(isGitBlameSupportedForHost(otherConnection)).toBe(true)
    const plainLocal = { ...localContext, connectionId: undefined }
    expect(isGitBlameSupportedForHost(plainLocal)).toBe(true)
  })

  it('does not disable the host for ordinary git failures — the feature stays alive', async () => {
    const blame = vi
      .fn()
      .mockRejectedValueOnce(new Error('fatal: not a git repository'))
      .mockResolvedValue(blameResult)
    withWindow({ blame })

    await expect(getRuntimeGitBlame({ ...localContext }, 'src/app.ts')).rejects.toThrow(
      'fatal: not a git repository'
    )
    expect(isGitBlameSupportedForHost({ ...localContext })).toBe(true)

    // A following call still reaches git (per-file silent, no host-level lockout).
    await expect(getRuntimeGitBlame({ ...localContext }, 'src/app.ts')).resolves.toEqual(blameResult)
  })

  it('treats a preload without blame as unsupported, silently', async () => {
    withWindow({})

    await expect(getRuntimeGitBlame({ ...localContext }, 'src/app.ts')).rejects.toBeInstanceOf(
      GitBlameHostUnsupportedError
    )
  })
})
