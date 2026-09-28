import { createElement } from 'react'
import { GitCompareArrows, Eye, ShieldAlert, ListChecks } from 'lucide-react'
import {
  FILE_ICON_COLOR_CLASS,
  getFileTypeIcon,
  type FileTypeIconColorGroup
} from '@/lib/file-type-icons'
import { cn } from '@/lib/utils'

// Icon của EditorFileTab theo mode: conflict/check/diff/preview icon hoặc
// file-type icon với màu theo iconColorGroup. Tách riêng để EditorFileTab giữ
// đúng trọng tâm chrome + menu (gate max-lines).
export function EditorFileTabIcon({
  file,
  isActive,
  isConflictReview,
  isCheckDetails,
  isDiff,
  isMarkdownPreviewTab,
  iconColorGroup
}: {
  file: { filePath: string }
  isActive: boolean
  isConflictReview: boolean
  isCheckDetails: boolean
  isDiff: boolean
  isMarkdownPreviewTab: boolean
  iconColorGroup: FileTypeIconColorGroup | null
}) {
  if (isConflictReview) {
    return (
      <ShieldAlert
        className={`w-3 h-3 mr-1 shrink-0 ${isActive ? 'text-orange-400' : 'text-orange-400/70'}`}
      />
    )
  }
  if (isCheckDetails) {
    return (
      <ListChecks
        className={`w-3 h-3 mr-1 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
      />
    )
  }
  if (isDiff) {
    return (
      <GitCompareArrows
        className={`w-3 h-3 mr-1 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
      />
    )
  }
  if (isMarkdownPreviewTab) {
    return (
      <Eye
        className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
      />
    )
  }
  const FileIcon = getFileTypeIcon(file.filePath)
  return createElement(FileIcon, {
    className: cn(
      'w-3 h-3 mr-1 shrink-0',
      isActive
        ? 'text-foreground'
        : iconColorGroup
          ? FILE_ICON_COLOR_CLASS[iconColorGroup]
          : 'text-muted-foreground'
    )
  })
}
