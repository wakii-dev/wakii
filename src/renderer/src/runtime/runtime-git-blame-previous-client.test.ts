import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBlameResult } from '../../../shared/git-blame-types'
import {
  getRuntimeGitBlameAtRevision,
  resetGitBlameRevisionDisabledHosts
} from './runtime-git-blame-previous-client'
import type { RuntimeGitContext } from './runtime-git-client-context'

const blameClient = vi.hoisted(() => ({
  getRuntimeGitBlame: vi.fn()
}))
vi.mock('./runtime-git-blame-client', () => blameClient)

const CONTEXT: RuntimeGitContext = {
  target: { kind: 'local' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}

function headResult(): GitBlameResult {
  return { filePath: 'src/app.ts', lines: [] }
}

beforeEach(() => {
  blameClient.getRuntimeGitBlame.mockReset()
  blameClient.getRuntimeGitBlame.mockResolvedValue(headResult())
  resetGitBlameRevisionDisabledHosts()
})

describe('getRuntimeGitBlameAtRevision (SF-1 echo contract)', () => {
  it('serves a revision whose echo matches the requested revision', async () => {
    blameClient.getRuntimeGitBlame.mockResolvedValue({ ...headResult(), revision: 'p'.repeat(40) })
    const result = await getRuntimeGitBlameAtRevision(CONTEXT, 'src/app.ts', 'p'.repeat(40))
    expect(result.revision).toBe('p'.repeat(40))
    // The revision rides on the context, not a new RPC surface.
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledWith(
      expect.objectContaining({ blameRevision: 'p'.repeat(40) }),
      'src/app.ts'
    )
  })

  it('never renders HEAD data as the old revision — a missing echo disables the host', async () => {
    // Old host: dropped the unknown `revision` param, answered plain HEAD.
    await expect(
      getRuntimeGitBlameAtRevision(CONTEXT, 'src/app.ts', 'p'.repeat(40))
    ).rejects.toThrow(/past revision/)
    // The host stays disabled in memory — the next request fails fast.
    await expect(
      getRuntimeGitBlameAtRevision(CONTEXT, 'src/app.ts', 'p'.repeat(40))
    ).rejects.toThrow(/past revision/)
    expect(blameClient.getRuntimeGitBlame).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched echo the same as a missing one', async () => {
    blameClient.getRuntimeGitBlame.mockResolvedValue({ ...headResult(), revision: 'other' })
    await expect(
      getRuntimeGitBlameAtRevision(CONTEXT, 'src/app.ts', 'p'.repeat(40))
    ).rejects.toThrow(/past revision/)
  })

  it('keeps the disable scoped per host — another connection still tries', async () => {
    await expect(
      getRuntimeGitBlameAtRevision(CONTEXT, 'src/app.ts', 'p'.repeat(40))
    ).rejects.toThrow(/past revision/)
    blameClient.getRuntimeGitBlame.mockResolvedValue({
      ...headResult(),
      revision: 'p'.repeat(40)
    })
    const otherHost: RuntimeGitContext = { ...CONTEXT, connectionId: 'ssh-other' }
    await expect(
      getRuntimeGitBlameAtRevision(otherHost, 'src/app.ts', 'p'.repeat(40))
    ).resolves.toMatchObject({ revision: 'p'.repeat(40) })
  })
})
