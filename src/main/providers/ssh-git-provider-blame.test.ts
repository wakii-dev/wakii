import { beforeEach, describe, expect, it } from 'vitest'
import { SshGitProvider } from './ssh-git-provider'
import { createMockMux, type MockMultiplexer } from './ssh-git-provider-test-harness'
import { GIT_BLAME_UNSUPPORTED_HOST_MARKER } from '../../shared/git-blame-types'

describe('SshGitProvider blame', () => {
  let mux: MockMultiplexer
  let provider: SshGitProvider

  beforeEach(() => {
    mux = createMockMux()
    provider = new SshGitProvider('conn-1', mux as never)
  })

  it('getBlame sends git.blame request with the worktree path and file path', async () => {
    const blameResult = {
      filePath: 'src/index.ts',
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
    mux.request.mockResolvedValue(blameResult)

    const result = await provider.getBlame('/home/user/repo', { filePath: 'src/index.ts' })

    expect(mux.request).toHaveBeenCalledWith('git.blame', {
      worktreePath: '/home/user/repo',
      filePath: 'src/index.ts'
    })
    expect(result).toEqual(blameResult)
  })

  it('getBlame propagates mux failures (old relay without git.blame)', async () => {
    mux.request.mockRejectedValue(new Error('Unknown method: git.blame'))
    await expect(
      provider.getBlame('/home/user/repo', { filePath: 'src/index.ts' })
    ).rejects.toThrow('Unknown method: git.blame')
  })

  it('getBlame converts a -32601 old-relay miss into the shared unsupported-host marker', async () => {
    const rpcMiss = Object.assign(new Error('Method not found: git.blame'), { code: -32601 })
    mux.request.mockRejectedValue(rpcMiss)

    await expect(
      provider.getBlame('/home/user/repo', { filePath: 'src/index.ts' })
    ).rejects.toThrow(GIT_BLAME_UNSUPPORTED_HOST_MARKER)
  })
})
