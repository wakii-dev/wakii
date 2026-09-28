import { describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/constants'
import type { WakiiFileOpenPayload } from '../../../../../../shared/wakii-mindmap-types'
import type { EditorFilesSlice } from '../types/editor-files-slice'
import type { EditorGet, EditorSet } from '../types/editor-set-get'
import { createWakiiViewerActions } from './wakii-viewer-actions'
import { WAKII_GOLDEN_MINDMAP } from '@/viewer/wakii-viewer-golden-fixture'

function payload(path = '/repo/docs/superpowers/mindmaps/vu-14.wakii'): WakiiFileOpenPayload {
  return { path, mindmap: WAKII_GOLDEN_MINDMAP }
}

function harness() {
  const openFile = vi.fn<EditorFilesSlice['openFile']>(() => 'tab-1')
  let state: {
    openFile: EditorFilesSlice['openFile']
    wakiiViewerFiles: Record<string, WakiiFileOpenPayload>
  } = {
    openFile,
    wakiiViewerFiles: {}
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: unit harness fakes only the zustand set surface this action touches; the updater is zustand's partial-or-function form applied over the stub state.
  const set = ((partial: unknown) => {
    if (typeof partial === 'function') {
      state = { ...state, ...partial(state) }
      return
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the object form of zustand's set is a partial patch over the stub state.
    const patch = partial as Record<string, unknown>
    state = { ...state, ...patch }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: see above — the stub satisfies only the set half of the store contract.
  }) as unknown as EditorSet
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: same harness — the action only reads openFile/wakiiViewerFiles off the store.
  const get = (() => state) as unknown as EditorGet
  return { actions: createWakiiViewerActions(set, get), openFile, state: () => state }
}

describe('createWakiiViewerActions', () => {
  it('stores the payload and opens a wakii-viewer tab in the floating workspace', () => {
    const { actions, openFile, state } = harness()
    actions.openWakiiViewerFile(payload())
    expect(state().wakiiViewerFiles['/repo/docs/superpowers/mindmaps/vu-14.wakii']).toMatchObject({
      path: '/repo/docs/superpowers/mindmaps/vu-14.wakii'
    })
    expect(openFile).toHaveBeenCalledTimes(1)
    expect(openFile).toHaveBeenCalledWith(
      {
        filePath: '/repo/docs/superpowers/mindmaps/vu-14.wakii',
        relativePath: 'vu-14.wakii',
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        language: 'plaintext',
        mode: 'wakii-viewer',
        runtimeEnvironmentId: null
      },
      { preview: false, suppressActiveRuntimeFallback: true }
    )
  })

  it('refreshes the payload on a re-push of the same path (main owns hash dedupe)', () => {
    const { actions, state } = harness()
    actions.openWakiiViewerFile(payload())
    const refreshed: Extract<WakiiFileOpenPayload, { mindmap: unknown }> = {
      path: '/repo/docs/superpowers/mindmaps/vu-14.wakii',
      mindmap: { ...WAKII_GOLDEN_MINDMAP, decodeWarnings: ['regen'] }
    }
    actions.openWakiiViewerFile(refreshed)
    const stored = state().wakiiViewerFiles['/repo/docs/superpowers/mindmaps/vu-14.wakii']
    expect('mindmap' in stored && stored.mindmap.decodeWarnings).toEqual(['regen'])
  })

  it('labels the tab from the basename on either separator', () => {
    const { actions, openFile } = harness()
    actions.openWakiiViewerFile(payload('C:\\repo\\docs\\vu-14.wakii'))
    expect(openFile.mock.calls[0][0].relativePath).toBe('vu-14.wakii')
  })

  it('routes error payloads through the same tab so the viewer can render the error card', () => {
    const { actions, state } = harness()
    const errorPayload: WakiiFileOpenPayload = {
      path: '/repo/broken.wakii',
      error: { code: 'schema', message: 'INVALID: schema — thiếu wakiiMindmap' }
    }
    actions.openWakiiViewerFile(errorPayload)
    expect(state().wakiiViewerFiles['/repo/broken.wakii']).toEqual(errorPayload)
  })
})

describe('editor slice regression — markdown flow untouched', () => {
  it('keeps .md opens in their own modes (wakii routing never intercepts them)', () => {
    // The wakii path only triggers via openWakiiViewerFile; a plain markdown
    // openFile call keeps its mode — this pins the boundary in the slice contract.
    const { actions, openFile } = harness()
    actions.openWakiiViewerFile(payload('/repo/README.wakii'))
    expect(openFile.mock.calls[0][0].mode).toBe('wakii-viewer')
    // markdown docs still open through openFile directly (existing behavior).
    openFile({
      filePath: '/repo/README.md',
      relativePath: 'README.md',
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      language: 'markdown',
      mode: 'edit',
      runtimeEnvironmentId: null
    })
    expect(openFile.mock.calls[1][0].mode).toBe('edit')
  })
})
