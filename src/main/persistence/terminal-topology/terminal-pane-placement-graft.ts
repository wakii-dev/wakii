import type { TerminalPanePlacement } from '../../../shared/workspace-layout/terminal-pane-placement'
import type { TerminalPaneLayoutNode } from '../../../shared/workspace-layout/terminal-tab-types'
import {
  collectLayoutLeafIdsInOrder,
  insertLeafBeside,
  layoutContainsLeafId,
  removeLayoutLeaf
} from '../../../shared/workspace-layout/terminal-pane-tree'
import { cloneLayoutNode } from '../restoring-sessions/terminal-layout-normalization'

/** Accept a proposed tree only if it adds this leaf alone; otherwise split beside the parent or return null. */
export function placedSplitRoot(
  root: TerminalPaneLayoutNode,
  leafId: string,
  placement: TerminalPanePlacement | undefined
): TerminalPaneLayoutNode | null {
  if (placement?.kind !== 'split' || !layoutContainsLeafId(root, placement.parentLeafId)) {
    return null
  }
  const { proposedRoot, parentLeafId, direction, ratio } = placement
  if (proposedRoot && addsOnlyLeaf(root, proposedRoot, leafId)) {
    return withNewSplit(proposedRoot, root, leafId)
  }
  return insertLeafBeside(
    cloneLayoutNode(root),
    parentLeafId,
    leafId,
    direction === 'vertical' ? 'right' : 'bottom',
    ratio
  )
}

function addsOnlyLeaf(
  root: TerminalPaneLayoutNode,
  proposed: TerminalPaneLayoutNode,
  leafId: string
): boolean {
  const without = removeLayoutLeaf(proposed, leafId)
  if (without === null) return false
  const proposedIds = collectLayoutLeafIdsInOrder(proposed)
  if (proposedIds.filter((id) => id === leafId).length !== 1) return false
  // Canonical grid (CEO 2/11): so theo TẬP leaf — proposed được XẾP LẠI các pane
  // hiện có vào ghế chuẩn (3 trên/3 dưới) miễn không mất/thêm pane nào ngoài
  // leaf mới. samePanesIgnoringRatios (so cấu trúc chặt) vẫn dùng ở nơi khác.
  const rootIds = [...collectLayoutLeafIdsInOrder(root)].sort()
  const withoutIds = [...collectLayoutLeafIdsInOrder(without)].sort()
  return rootIds.length === withoutIds.length && rootIds.every((id, i) => id === withoutIds[i])
}

/** Take the new split without overwriting main's divider positions. */
function withNewSplit(
  proposed: TerminalPaneLayoutNode,
  root: TerminalPaneLayoutNode,
  leafId: string
): TerminalPaneLayoutNode {
  if (proposed.type === 'leaf') {
    return cloneLayoutNode(root)
  }
  const isNew = (node: TerminalPaneLayoutNode): boolean =>
    node.type === 'leaf' && node.leafId === leafId
  if (isNew(proposed.first) || isNew(proposed.second)) {
    return {
      ...proposed,
      first: isNew(proposed.first) ? cloneLayoutNode(proposed.first) : cloneLayoutNode(root),
      second: isNew(proposed.second) ? cloneLayoutNode(proposed.second) : cloneLayoutNode(root)
    }
  }
  // addsOnlyLeaf proves the old root belongs inside this proposed split.
  if (root.type === 'leaf') {
    return cloneLayoutNode(root)
  }
  return {
    ...root,
    first: withNewSplit(proposed.first, root.first, leafId),
    second: withNewSplit(proposed.second, root.second, leafId)
  }
}
