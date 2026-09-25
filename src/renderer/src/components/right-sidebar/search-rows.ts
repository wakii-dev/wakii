import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'

export type SearchRow =
  | {
      type: 'file'
      fileResult: SearchFileResult
      collapsed: boolean
    }
  | {
      type: 'match'
      fileResult: SearchFileResult
      match: SearchMatch
      matchIndex: number
    }

export function buildSearchRows(
  results: SearchResult | null,
  collapsedFiles: ReadonlySet<string>
): SearchRow[] {
  if (!results) {
    return []
  }

  // Why: the summary row is rendered as a fixed header in Search.tsx so it
  // stays visible while the user scrolls through results and doesn't
  // participate in virtualisation.
  const rows: SearchRow[] = []

  for (const fileResult of results.files) {
    const collapsed = collapsedFiles.has(fileResult.filePath)
    rows.push({ type: 'file', fileResult, collapsed })

    // Why: flattening the tree into rows lets the sidebar virtualize search
    // output. Rendering every file header and every match at once is what made
    // large ripgrep result sets freeze the renderer.
    if (collapsed) {
      continue
    }

    for (const [matchIndex, match] of fileResult.matches.entries()) {
      rows.push({
        type: 'match',
        fileResult,
        match,
        matchIndex
      })
    }
  }

  return rows
}

/** Collapsed-file set covering every result file (collapse-all) or none (expand-all). */
export function setAllSearchFilesCollapsed(
  results: SearchResult | null,
  collapsed: boolean
): Set<string> {
  if (!results || !collapsed) {
    return new Set<string>()
  }
  return new Set(results.files.map((fileResult) => fileResult.filePath))
}

/** Index of the next/previous match row relative to the given row, or null at the boundary. */
export function getNextMatchRowIndex(
  rows: readonly SearchRow[],
  fromIndex: number,
  direction: 1 | -1
): number | null {
  let index = fromIndex + direction
  while (index >= 0 && index < rows.length) {
    if (rows[index].type === 'match') {
      return index
    }
    index += direction
  }
  return null
}
