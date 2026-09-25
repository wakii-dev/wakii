/** X offset of one indent guide: chevron column center for rows at that level (padding 8 + half 12px icon). */
const GUIDE_BASE_PX = 14
/** Row indent step in px — must match FileExplorerRow's `depth * 16 + 8` padding. */
const INDENT_STEP_PX = 16

/** Left offsets (px) of the indent guides drawn on a row at the given depth. */
export function getIndentGuideLefts(depth: number): number[] {
  const guides: number[] = []
  for (let level = 0; level < depth; level += 1) {
    guides.push(level * INDENT_STEP_PX + GUIDE_BASE_PX)
  }
  return guides
}
