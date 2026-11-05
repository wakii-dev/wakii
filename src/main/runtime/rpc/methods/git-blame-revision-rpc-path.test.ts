import { describe, expect, it, vi } from 'vitest'
import { GitBlameAtRevision } from '../../../../shared/rpc-contract/git-params'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { eraseRpcMethods } from '../core'
import { GIT_METHODS } from './git'

const SHA = 'a'.repeat(40)

function blameMethod() {
  const found = eraseRpcMethods(GIT_METHODS).find((candidate) => candidate.name === 'git.blame')
  if (!found) {
    throw new Error('Missing method git.blame')
  }
  return found
}

function runtimeWith(getRuntimeGitBlame: ReturnType<typeof vi.fn>): OrcaRuntimeService {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler under test only touches runtime.getRuntimeGitBlame, which the stub provides.
  return { getRuntimeGitBlame } as unknown as OrcaRuntimeService
}

// GitLens-parity SF-1 blame-previous: the optional `revision` walk target must
// survive the whole RPC path. A catalog without the field zod-strips it before
// the host sees the request, so even a revision-aware host answers with HEAD
// blame and the renderer's echo check disables the feature per host.
describe('git.blame keeps the revision param on the RPC path', () => {
  it('parses revision through the params schema instead of stripping it', () => {
    const parsed = GitBlameAtRevision.parse({
      worktree: 'wt_1',
      filePath: 'src/app.ts',
      revision: SHA
    })
    expect(parsed.revision).toBe(SHA)
  })

  it('rejects a revision that is not a full object id', () => {
    expect(() =>
      GitBlameAtRevision.parse({
        worktree: 'wt_1',
        filePath: 'src/app.ts',
        revision: '--upload-pack=x'
      })
    ).toThrow()
  })

  it('forwards revision to the runtime blame command', async () => {
    const getRuntimeGitBlame = vi.fn().mockResolvedValue({ filePath: 'src/app.ts', lines: [] })
    const method = blameMethod()
    await method.handler(
      GitBlameAtRevision.parse({ worktree: 'wt_1', filePath: 'src/app.ts', revision: SHA }),
      { runtime: runtimeWith(getRuntimeGitBlame) }
    )
    expect(getRuntimeGitBlame).toHaveBeenCalledWith('wt_1', {
      filePath: 'src/app.ts',
      revision: SHA
    })
  })

  it('omits revision for HEAD blame so the wire contract stays additive', async () => {
    const getRuntimeGitBlame = vi.fn().mockResolvedValue({ filePath: 'src/app.ts', lines: [] })
    const method = blameMethod()
    await method.handler(GitBlameAtRevision.parse({ worktree: 'wt_1', filePath: 'src/app.ts' }), {
      runtime: runtimeWith(getRuntimeGitBlame)
    })
    expect(getRuntimeGitBlame).toHaveBeenCalledWith('wt_1', { filePath: 'src/app.ts' })
  })
})
