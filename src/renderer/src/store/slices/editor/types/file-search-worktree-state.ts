import type { SearchResult } from '../../../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import type { SearchReplaceOp } from '@/components/right-sidebar/search-replace-op'

export type FileSearchWorktreeState = {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includePattern: string
  excludePattern: string
  results: SearchResult | null
  resultOwner: FileSearchResultOwner | null
  error?: string | null
  loading: boolean
  collapsedFiles: Set<string>
  replaceQuery: string
  replaceVisible: boolean
  replaceAllInProgress: boolean
  cancelRequested: boolean
  lastReplaceOp: SearchReplaceOp | null
  seedRequestId?: number
  focusRequestId?: number
}
