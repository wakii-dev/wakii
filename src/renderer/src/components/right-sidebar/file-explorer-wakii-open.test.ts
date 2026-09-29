import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WakiiMindmap } from '../../../../shared/wakii-mindmap-types'
import type { WakiiFileOpenPayload } from '../../../../shared/wakii-file-open-payload'
import { activateWakiiExplorerFile, isWakiiDocumentFileName } from './file-explorer-wakii-open'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

function validMindmap(): WakiiFileOpenPayload {
  const mindmap: WakiiMindmap = {
    wakiiMindmap: 1,
    meta: { story: 's', generatedAt: '2026-09-27T00:00:00Z', generator: 'story-mindmap 1.0.0' },
    nodes: [{ id: 'epic', kind: 'epic', title: 'E' }],
    edges: []
  }
  return { path: '/repo/map.wakii', mindmap }
}

describe('isWakiiDocumentFileName', () => {
  it('accepts the .wakii extension case-insensitively', () => {
    expect(isWakiiDocumentFileName('roadmap.wakii')).toBe(true)
    expect(isWakiiDocumentFileName('ROADMAP.WAKII')).toBe(true)
  })

  it('rejects other names', () => {
    expect(isWakiiDocumentFileName('roadmap.json')).toBe(false)
    expect(isWakiiDocumentFileName('wakii')).toBe(false)
    expect(isWakiiDocumentFileName('map.wakii.bak')).toBe(false)
    // Why dot > 0: mirrors node extname — a bare ".wakii" dotfile has no extension.
    expect(isWakiiDocumentFileName('.wakii')).toBe(false)
  })
})

describe('activateWakiiExplorerFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens a decoded payload in the viewer and reports success', async () => {
    const readDocument = vi.fn().mockResolvedValue(validMindmap())
    const openViewer = vi.fn()

    const routed = await activateWakiiExplorerFile({
      filePath: '/repo/map.wakii',
      viewer: { readDocument, openViewer }
    })

    expect(routed).toBe(true)
    expect(readDocument).toHaveBeenCalledWith('/repo/map.wakii')
    expect(openViewer).toHaveBeenCalledTimes(1)
    expect(openViewer).toHaveBeenCalledWith(expect.objectContaining({ path: '/repo/map.wakii' }))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('falls back to text with a toast when the document is invalid', async () => {
    const readDocument = vi
      .fn()
      .mockResolvedValue({ path: '/repo/map.wakii', error: { code: 'schema', message: 'nope' } })
    const openViewer = vi.fn()

    const routed = await activateWakiiExplorerFile({
      filePath: '/repo/map.wakii',
      viewer: { readDocument, openViewer }
    })

    expect(routed).toBe(false)
    expect(openViewer).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('falls back to text with a toast when the read fails', async () => {
    const readDocument = vi.fn().mockRejectedValue(new Error('ipc unavailable'))
    const openViewer = vi.fn()

    const routed = await activateWakiiExplorerFile({
      filePath: '/repo/map.wakii',
      viewer: { readDocument, openViewer }
    })

    expect(routed).toBe(false)
    expect(openViewer).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
