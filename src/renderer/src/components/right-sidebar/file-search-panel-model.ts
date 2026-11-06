import type React from 'react'
import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'
import type { buildSearchRows } from './file-explorer/content-search/search-rows'
import type { SearchQueryRowProps } from './file-explorer/content-search/SearchQueryRow.tsx'
import type { SearchFiltersProps } from './file-explorer/content-search/SearchFilters.tsx'
import type { SearchReplacePreviewModalProps } from './search-replace-preview-modal'

export type FileSearchResultsProps = {
  results: SearchResult | null
  error?: string | null
  hasCommittedResults: boolean
  query: string
  loading: boolean
  rows: ReturnType<typeof buildSearchRows>
  scrollRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapsedFile: (filePath: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onMatchClick: (fileResult: SearchFileResult, match: SearchMatch) => void
}

export type FileSearchPanelModel = {
  activeWorktreeId: string | null
  queryRowProps: SearchQueryRowProps
  filtersProps: SearchFiltersProps
  resultsProps: FileSearchResultsProps
  replacePreviewProps: Pick<
    SearchReplacePreviewModalProps,
    'open' | 'onClose' | 'onConfirm' | 'loading' | 'summary' | 'replaceTerm' | 'totalOccurrences'
  >
  focusQueryInput: () => void
}
