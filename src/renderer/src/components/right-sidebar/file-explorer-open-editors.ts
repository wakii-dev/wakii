import { basename, dirname } from '@/lib/path'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

export type OpenEditorsEntry = {
  id: string
  fileName: string
  relativeDir: string
  isDirty: boolean
  isPreview: boolean
  isActive: boolean
  externalMutation: 'deleted' | 'renamed' | 'changed' | null
}

/** Text-editor tabs of the active worktree, in tab order — diff/conflict/check tabs are separate surfaces. */
export function selectOpenEditorsEntries(
  openFiles: OpenFile[],
  activeWorktreeId: string | null,
  activeFileId: string | null
): OpenEditorsEntry[] {
  if (!activeWorktreeId) {
    return []
  }
  return openFiles
    .filter(
      (file) =>
        file.worktreeId === activeWorktreeId &&
        (file.mode === 'edit' || file.mode === 'markdown-preview')
    )
    .map((file) => {
      const parentDir = dirname(file.relativePath)
      return {
        id: file.id,
        fileName: basename(file.relativePath),
        relativeDir: parentDir === '.' ? '' : parentDir,
        isDirty: file.isDirty,
        isPreview: Boolean(file.isPreview),
        isActive: file.id === activeFileId,
        externalMutation: file.externalMutation ?? null
      }
    })
}
