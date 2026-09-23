import React from 'react'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { OpenEditorsEntry } from './file-explorer-open-editors'

type FileExplorerOpenEditorsProps = {
  entries: OpenEditorsEntry[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onActivate: (fileId: string) => void
  onClose: (fileId: string) => void
}

/** Sticky "Open Editors" section pinned above the explorer tree; the tree scrolls underneath. */
export function FileExplorerOpenEditors({
  entries,
  collapsed,
  onToggleCollapsed,
  onActivate,
  onClose
}: FileExplorerOpenEditorsProps): React.JSX.Element | null {
  if (entries.length === 0) {
    return null
  }

  return (
    <div className="shrink-0 border-b border-border">
      <button
        type="button"
        data-testid="open-editors-header"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', !collapsed && 'rotate-90')}
        />
        <span className="truncate">
          {translate(
            'auto.components.right.sidebar.FileExplorerOpenEditors.7b21c3f4a9',
            'Open Editors'
          )}
        </span>
        <span className="ml-auto text-[10px] tabular-nums">{entries.length}</span>
      </button>
      {!collapsed ? (
        <div className="pb-1">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid="open-editors-row"
              data-active={entry.isActive ? 'true' : undefined}
              onClick={() => onActivate(entry.id)}
              className={cn(
                'group flex h-6 w-full items-center gap-1.5 px-2 text-left text-xs',
                entry.isActive
                  ? 'bg-accent/60 text-accent-foreground'
                  : 'text-foreground hover:bg-accent'
              )}
              title={entry.relativeDir ? `${entry.relativeDir}/${entry.fileName}` : entry.fileName}
            >
              {/* Why span: nested <button> inside the row button is invalid HTML and browsers
                  will reparse it, breaking the row layout. */}
              <span
                role="button"
                tabIndex={0}
                data-testid="open-editors-close"
                aria-label={translate(
                  'auto.components.right.sidebar.FileExplorerOpenEditors.5e8b4c2d17',
                  'Close editor'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(entry.id)
                }}
                className="flex size-3 shrink-0 items-center justify-center"
              >
                {entry.isDirty ? (
                  <>
                    <span
                      aria-label={translate(
                        'auto.components.right.sidebar.FileExplorerOpenEditors.d3f9a2c1e8',
                        'Unsaved changes'
                      )}
                      className="size-2 rounded-full bg-foreground/70 group-hover:hidden"
                    />
                    <X className="hidden size-3 text-muted-foreground hover:text-foreground group-hover:block" />
                  </>
                ) : (
                  <X className="size-3 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" />
                )}
              </span>
              <span
                className={cn(
                  'min-w-0 truncate',
                  entry.isPreview && 'italic',
                  entry.externalMutation === 'deleted' && 'line-through opacity-70'
                )}
              >
                {entry.fileName}
              </span>
              {entry.relativeDir ? (
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  {entry.relativeDir}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
