import type { TerminalPanePlacement } from '../../../../shared/workspace-layout/terminal-pane-placement'
import type {
  TerminalPaneLayoutNode,
  TerminalPaneSplitDirection
} from '../../../../shared/workspace-layout/terminal-tab-types'
import type { RuntimeTerminalPresentation } from '../../../../shared/runtime-terminal-contracts'

/** Use requested/first group; revealed tabs honor user names, background worker tabs keep live titles. */
export function newTabIn(opts: {
  viewMode?: 'terminal' | 'chat'
  targetGroupId?: string
  title?: string
  presentation?: RuntimeTerminalPresentation
}): {
  placement: TerminalPanePlacement
  groupId?: string
} {
  const { viewMode, targetGroupId } = opts
  const title = opts.presentation === 'background' ? undefined : opts.title
  const row = {
    ...(viewMode ? { viewMode } : {}),
    ...(title ? { customTitle: title } : {})
  }
  return {
    placement: viewMode || title ? { kind: 'new-tab', row } : { kind: 'new-tab' },
    ...(targetGroupId ? { groupId: targetGroupId } : {})
  }
}

/**
 * Canonical 6-seat grid (CEO ruling 2/11): xếp LẠI các pane hiện có vào ghế chuẩn
 * 3 trên / 3 dưới theo đúng thứ tự seat truyền vào (captain đầu tiên), pane mới
 * vào ghế kế tiếp. Idempotent: cùng đội hình luôn ra cùng một cây — ghost pane
 * (không trong seats) được caller xếp cuối. Graft chấp nhận vì addsOnlyLeaf
 * giờ so theo tập leaf.
 */
export function canonicalGridPlacement(
  seatLeafIds: readonly string[],
  sourceLeafId: string,
  newLeafId: string
): TerminalPanePlacement | null {
  const seats = seatLeafIds.filter((id) => id && id !== newLeafId)
  if (seats.length === 0 || seats.length > 5) return null
  const all = [...seats, newLeafId]
  const leaf = (id: string): TerminalPaneLayoutNode => ({ type: 'leaf', leafId: id })
  let row1: TerminalPaneLayoutNode = leaf(all[0])
  for (let c = 1; c < Math.min(3, all.length); c++) {
    row1 = { type: 'split', direction: 'vertical', first: row1, second: leaf(all[c]) }
  }
  let row2: TerminalPaneLayoutNode | null = null
  for (let c = 3; c < all.length; c++) {
    row2 = row2 === null ? leaf(all[c]) : { type: 'split', direction: 'vertical', first: row2, second: leaf(all[c]) }
  }
  const proposed: TerminalPaneLayoutNode =
    row2 === null ? row1 : { type: 'split', direction: 'horizontal', first: row1, second: row2 }
  return {
    kind: 'split',
    parentLeafId: sourceLeafId,
    direction: 'vertical',
    proposedRoot: structuredClone(proposed)
  }
}

export function runtimeSplitPlacement(
  parentLeafId: string,
  direction: TerminalPaneSplitDirection
): TerminalPanePlacement {
  return { kind: 'split', parentLeafId, direction }
}

/**
 * Wrap the tab's whole current tree as the first child of a new horizontal
 * split, with the new pane below as a full-width row (team grid: row 1 keeps
 * its columns; worker N wraps to a fresh row). Falls back to null when main
 * has no layout root for the tab — callers then use a plain leaf split.
 */
export function wrapRowSplitPlacement(
  root: TerminalPaneLayoutNode | null | undefined,
  sourceLeafId: string,
  newLeafId: string
): TerminalPanePlacement | null {
  if (!root) {
    return null
  }
  return {
    kind: 'split',
    parentLeafId: sourceLeafId,
    direction: 'horizontal',
    proposedRoot: {
      type: 'split',
      direction: 'horizontal',
      first: structuredClone(root),
      second: { type: 'leaf', leafId: newLeafId }
    }
  }
}
