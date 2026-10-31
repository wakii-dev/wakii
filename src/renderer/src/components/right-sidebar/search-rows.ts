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

  // Keep the summary outside virtualization as a fixed header while results scroll.
  const rows: SearchRow[] = []

  for (const fileResult of results.files) {
    const collapsed = collapsedFiles.has(fileResult.filePath)
    rows.push({ type: 'file', fileResult, collapsed })

    // Flatten for virtualization; mounting every ripgrep match at once froze the renderer.
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
