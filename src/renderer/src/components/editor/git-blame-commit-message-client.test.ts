// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearGitBlameCommitMessageCache,
  fetchGitBlameCommitMessage
} from './git-blame-commit-message-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'

const CONTEXT: RuntimeGitContext = {
  target: { kind: 'local' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}

const SHA = 'a'.repeat(40)

const commitMessageBody = vi.hoisted(() => vi.fn())

describe('fetchGitBlameCommitMessage (SF-1 lazy full message)', () => {
  beforeEach(() => {
    clearGitBlameCommitMessageCache()
    commitMessageBody.mockReset()
    commitMessageBody.mockResolvedValue('Add blame reader\n\nBody paragraph.')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test stubs the preload surface; the type is defined in src/preload and not importable here.
    const api = { git: { commitMessageBody } } as unknown
    Object.defineProperty(window, 'api', { value: api, configurable: true })
  })

  it('fetches once per sha and serves the second read from cache (spy)', async () => {
    const first = await fetchGitBlameCommitMessage(CONTEXT, SHA)
    expect(first).toContain('Body paragraph.')
    const second = await fetchGitBlameCommitMessage(CONTEXT, SHA)
    expect(second).toBe(first)
    expect(commitMessageBody).toHaveBeenCalledTimes(1)
  })

  it('degrades to headline-only (null) when the read fails', async () => {
    commitMessageBody.mockRejectedValue(new Error('git died'))
    await expect(fetchGitBlameCommitMessage(CONTEXT, SHA)).resolves.toBeNull()
  })

  it('degrades to null on remote runtime environments — desktop-only surface, wire-safe', async () => {
    const remote: RuntimeGitContext = {
      ...CONTEXT,
      target: { kind: 'environment', environmentId: 'env-1' }
    }
    await expect(fetchGitBlameCommitMessage(remote, SHA)).resolves.toBeNull()
    expect(commitMessageBody).not.toHaveBeenCalled()
  })
})
