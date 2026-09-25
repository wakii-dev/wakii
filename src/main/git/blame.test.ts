import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitExecFileAsyncMock = vi.fn()

vi.mock('./runner', () => ({
  gitExecFileAsync: (...args: unknown[]) => gitExecFileAsyncMock(...args)
}))

import { getBlame } from './blame'

describe('getBlame', () => {
  beforeEach(() => {
    gitExecFileAsyncMock.mockReset()
  })

  it('runs git blame --porcelain against the requested file and parses the log', async () => {
    const sha = 'a'.repeat(40)
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: [`${sha} 1 1 1`, 'author Jane Dev', 'author-time 1700000000', 'author-tz +0000', 'committer C O Mitter', 'committer-time 1700000000', 'committer-tz +0000', 'summary Add blame reader', 'filename src/app.ts', '\tconst value = 1'].join('\n')
    })

    const result = await getBlame('C:/repo', { filePath: 'src/app.ts' })

    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(
      ['blame', '--porcelain', '--end-of-options', '--', 'src/app.ts'],
      { cwd: 'C:/repo' }
    )
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ hash: sha, author: 'Jane Dev', summary: 'Add blame reader' })
  })

  it('propagates executor failures (empty repository, permission, buffer cap)', async () => {
    gitExecFileAsyncMock.mockRejectedValue(new Error('fatal: malformed object name HEAD'))
    await expect(getBlame('C:/repo', { filePath: 'src/app.ts' })).rejects.toThrow(
      'fatal: malformed object name HEAD'
    )
  })
})
