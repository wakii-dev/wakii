import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/constants'
import type { WakiiFileOpenPayload } from '../../../../../../shared/wakii-mindmap-types'
import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'

function wakiiTabLabel(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Opens a `.wakii` mindmap viewer tab in the floating workspace. The payload is
 * already decoded by main (`ui:openWakiiFile`) — stored keyed by path so the
 * tab renders it; re-push of the same path refreshes the payload and refocuses
 * the existing tab (spec §5 dedupe, refresh = hash change owner is main).
 */
export function createWakiiViewerActions(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openWakiiViewerFile'> {
  return {
    openWakiiViewerFile: (payload: WakiiFileOpenPayload): void => {
      set((s) => ({ wakiiViewerFiles: { ...s.wakiiViewerFiles, [payload.path]: payload } }))
      get().openFile(
        {
          filePath: payload.path,
          relativePath: wakiiTabLabel(payload.path),
          worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
          language: 'plaintext',
          mode: 'wakii-viewer',
          runtimeEnvironmentId: null
        },
        { preview: false, suppressActiveRuntimeFallback: true }
      )
    }
  }
}
