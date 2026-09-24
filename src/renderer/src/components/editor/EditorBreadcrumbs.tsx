import React from 'react'
import { ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'

type EditorBreadcrumbsProps = {
  filePath: string
  relativePath: string
  worktreeId?: string
  onReveal?: (worktreeId: string, filePath: string) => void
}

// VS Code-style path bar for the file editor. Every parent segment click reveals the
// file in the explorer (the explorer machinery expands ancestors and highlights it);
// the trailing file segment is the current location, so it is not a button.
export function EditorBreadcrumbs({
  filePath,
  relativePath,
  worktreeId,
  onReveal
}: EditorBreadcrumbsProps): React.JSX.Element {
  const segments = relativePath.split('/').filter(Boolean)
  // Stable unique keys: the accumulated path at each depth (segment names can repeat).
  const segmentKeys = segments.map(
    (_, depth) => `/${segments.slice(0, depth + 1).join('/')}`
  )
  const ariaLabel = translate('auto.components.editor.EditorBreadcrumbs.7a0b97acc9', 'File breadcrumbs')
  const revealTitle = translate(
    'auto.components.editor.EditorBreadcrumbs.deb1973b7d',
    'Reveal in explorer'
  )

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="editor-breadcrumbs"
      className="flex h-6 min-w-0 shrink-0 items-center gap-0.5 overflow-hidden px-2"
    >
      {segments.map((segment, index) => {
        const isFileSegment = index === segments.length - 1
        if (isFileSegment || !onReveal || !worktreeId) {
          return (
            <span
              key={segmentKeys[index]}
              data-testid="breadcrumb-segment"
              aria-current={isFileSegment ? 'page' : undefined}
              title={isFileSegment ? undefined : revealTitle}
              className="truncate text-xs text-muted-foreground"
            >
              {segment}
            </span>
          )
        }
        return (
          <span key={segmentKeys[index]} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              data-testid="breadcrumb-segment"
              title={revealTitle}
              onClick={() => onReveal(worktreeId, filePath)}
              className="truncate rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {segment}
            </button>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" />
          </span>
        )
      })}
    </nav>
  )
}
