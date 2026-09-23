import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DiffViewer } from '@/components/editor/editor-lazy-views'
import { detectLanguage } from '@/lib/language-detect'
import { translate } from '@/i18n/i18n'
import type { ReplaceAllRunSummary } from './search-replace-all-runner'

const PREVIEW_DIFF_LIMIT = 10

export type SearchReplacePreviewModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  loading: boolean
  summary: ReplaceAllRunSummary | null
  replaceTerm: string
  totalOccurrences: number
}

// Why: pure presentational — the dry run lives in useFileSearchReplacePreview
// and the confirmed write lives in the panel, so cancel here can never write.
export function SearchReplacePreviewModal({
  open,
  onClose,
  onConfirm,
  loading,
  summary,
  replaceTerm,
  totalOccurrences
}: SearchReplacePreviewModalProps) {
  if (!open) {
    return null
  }

  const confirmDisabled =
    loading ||
    !summary ||
    summary.cancelled ||
    summary.stoppedOnTransportError ||
    summary.counts.replaced === 0
  const previewFiles = summary?.previews.slice(0, PREVIEW_DIFF_LIMIT) ?? []
  const previewOccurrences =
    summary?.previews.reduce((total, preview) => total + preview.matchCount, 0) ?? 0

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.right.sidebar.SearchReplacePreview.6c04a1f2b3',
              'Replace All Preview'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.right.sidebar.SearchReplacePreview.1d8e77c9a4',
              'Counts are re-derived from the files on disk before anything is written.'
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div
            data-testid="replace-preview-loading"
            className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            {translate(
              'auto.components.right.sidebar.SearchReplacePreview.2b91c0e5f7',
              'Reading files...'
            )}
          </div>
        ) : summary ? (
          <div className="space-y-3">
            <div data-testid="replace-preview-counts" className="text-sm">
              {translate(
                'auto.components.right.sidebar.SearchReplacePreview.4f3a92d1c8',
                '{{occurrences}} occurrences in {{files}} files would be replaced.',
                { occurrences: previewOccurrences, files: summary.counts.replaced }
              )}
              {totalOccurrences > previewOccurrences ? (
                <span className="text-xs text-muted-foreground">
                  {' '}
                  {translate(
                    'auto.components.right.sidebar.SearchReplacePreview.5e6b81d0a2',
                    'The search listed {{searched}} — stale matches are skipped at replace time.',
                    { searched: totalOccurrences }
                  )}
                </span>
              ) : null}
            </div>

            {replaceTerm === '' ? (
              <div
                data-testid="replace-preview-removal-note"
                className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              >
                {translate(
                  'auto.components.right.sidebar.SearchReplacePreview.7a20cf4b19',
                  'The replace field is empty — matched text will be removed.'
                )}
              </div>
            ) : null}

            <div
              data-testid="replace-preview-skips"
              className="text-xs text-muted-foreground"
            >
              {translate(
                'auto.components.right.sidebar.SearchReplacePreview.8c31da6e05',
                'Skipped — unsaved {{dirty}}, stale {{stale}}, errors {{errors}}, not attempted {{unprocessed}}.',
                {
                  dirty: summary.counts.skippedDirty,
                  stale: summary.counts.skippedStale,
                  errors: summary.counts.errors,
                  unprocessed: summary.counts.unprocessed
                }
              )}
            </div>

            <div className="max-h-80 space-y-3 overflow-y-auto scrollbar-sleek pr-1">
              {previewFiles.map((preview) => (
                <div key={preview.filePath} data-testid="replace-preview-diff" className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {preview.relativePath}
                    {` (${preview.matchCount})`}
                  </div>
                  <Suspense fallback={<div className="h-16 rounded-md bg-muted/40" />}>
                    <DiffViewer
                      modelKey={`replace-preview:${preview.filePath}`}
                      originalContent={preview.oldContent}
                      modifiedContent={preview.newContent}
                      language={detectLanguage(preview.filePath)}
                      filePath={preview.filePath}
                      relativePath={preview.relativePath}
                      sideBySide={false}
                    />
                  </Suspense>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="replace-preview-cancel"
            onClick={onClose}
          >
            {translate('auto.components.right.sidebar.SearchReplacePreview.3d86cf135a', 'Cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="replace-preview-confirm"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {translate('auto.components.right.sidebar.SearchReplacePreview.4e97d0246b', 'Replace All')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
