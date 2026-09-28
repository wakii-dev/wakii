import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveAuthorizedPath: vi.fn(async (_path: string) => _path),
  resolveOpenedWakiiFiles: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../filesystem-auth', () => ({
  resolveAuthorizedPath: mocks.resolveAuthorizedPath
}))

vi.mock('../../startup/os-opened-wakii-files', () => ({
  resolveOpenedWakiiFiles: mocks.resolveOpenedWakiiFiles
}))

import { ipcMain } from 'electron'
import { registerFilesystemReadHandlers } from './filesystem-read-handlers'

type Handler = (event: unknown, args: unknown) => unknown

function registeredHandler(channel: string): Handler {
  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls as [string, Handler][]
  const found = calls.find(([registered]) => registered === channel)
  if (!found) {
    throw new Error(`handler not registered: ${channel}`)
  }
  return found[1]
}

describe('fs:readWakiiDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveAuthorizedPath.mockImplementation(async (filePath: string) => filePath)
  })

  it('authorizes the path before reading and returns the resolved payload', async () => {
    registerFilesystemReadHandlers({ store: {} } as never)
    const handler = registeredHandler('fs:readWakiiDocument')
    const payload = { path: '/repo/map.wakii', mindmap: { wakiiMindmap: 1 } }
    mocks.resolveOpenedWakiiFiles.mockResolvedValue([
      { payload, contentHash: 'abc' }
    ])

    const result = await handler({}, { filePath: '/repo/../repo/map.wakii' })

    expect(result).toEqual(payload)
    expect(mocks.resolveAuthorizedPath).toHaveBeenCalledWith('/repo/../repo/map.wakii', {})
    // Why order matters: authorization must gate the read — an unregistered path never reaches fs.
    expect(mocks.resolveAuthorizedPath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolveOpenedWakiiFiles.mock.invocationCallOrder[0]
    )
    expect(mocks.resolveOpenedWakiiFiles).toHaveBeenCalledWith(['/repo/../repo/map.wakii'])
  })

  it('passes per-file decode errors through as payload errors instead of throwing', async () => {
    registerFilesystemReadHandlers({ store: {} } as never)
    const handler = registeredHandler('fs:readWakiiDocument')
    const payload = { path: '/repo/map.wakii', error: { code: 'schema', message: 'bad json' } }
    mocks.resolveOpenedWakiiFiles.mockResolvedValue([{ payload, contentHash: null }])

    await expect(handler({}, { filePath: '/repo/map.wakii' })).resolves.toEqual(payload)
  })
})
