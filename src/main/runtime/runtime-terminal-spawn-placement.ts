import type { TerminalPanePlacement } from '../../shared/terminal-pane-placement'
import type { TerminalPaneSplitDirection, TerminalPaneLayoutNode } from '../../shared/terminal-tab-types'
import type { RuntimeTerminalPresentation } from '../../shared/runtime-terminal-contracts'

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
