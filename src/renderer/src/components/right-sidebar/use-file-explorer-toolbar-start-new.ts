import { useCallback } from 'react'
import type { TreeNode } from './file-explorer-types'

export function useFileExplorerToolbarStartNew(
  worktreePath: string | null | undefined,
  selectedNode: TreeNode | null,
  startNew: (type: 'file' | 'folder', parentPath: string, depth: number) => void
) {
  return useCallback(
    (type: 'file' | 'folder') => () => {
      if (!worktreePath) {
        return
      }
      const parentPath = selectedNode?.isDirectory ? selectedNode.path : worktreePath
      const depth = selectedNode?.isDirectory ? selectedNode.depth + 1 : 0
      startNew(type, parentPath, depth)
    },
    [worktreePath, selectedNode, startNew]
  )
}
