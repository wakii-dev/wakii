import type React from 'react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getRuntimeGitCommitDiff } from '@/runtime/runtime-git-diff-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type { GitDiffResult } from '../../../../shared/git/diff/git-diff-compare-types'
import { gitBlameAvatarInitial, gitBlameAvatarLaneForAuthor } from './git-blame-avatar-lane'
import { fetchGitBlameCommitMessage } from './git-blame-commit-message-client'
import { buildGitBlameFileDiff } from './git-blame-commit-diff-hunks'
import { getGitBlameHoverCardStrings } from './git-blame-hover-card-strings'
import type { GitBlameHoverCardModel } from './git-blame-hover-card-model'

export type GitBlameCommitDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The card whose commit is shown; `previousHash` doubles as the parent oid. */
  card: GitBlameHoverCardModel
  /** File being blamed — the only file whose diff the dialog shows. */
  filePath: string
  context: RuntimeGitContext
}

type LoadState = { phase: 'loading' } | { phase: 'ready'; diff: GitDiffResult } | { phase: 'error' }

/**
 * Centered commit detail dialog (GitLens-parity SF-1, mockup B): avatar +
 * subject title, author/relative/sha meta, full message, and the diff of the
 * file being blamed through the existing `git.commitDiff` pipeline.
 */
export function GitBlameCommitDetailDialog({
  open,
  onOpenChange,
  card,
  filePath,
  context
}: GitBlameCommitDetailDialogProps): React.JSX.Element {
  const strings = getGitBlameHoverCardStrings()
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [message, setMessage] = useState<string | null>(card.fullMessage)

  useEffect(() => {
    if (!open) {
      return
    }
    let alive = true
    setLoad({ phase: 'loading' })
    setMessage(card.fullMessage)
    fetchGitBlameCommitMessage(context, card.hash).then((fetched) => {
      if (alive && fetched) {
        setMessage(fetched)
      }
    })
    getRuntimeGitCommitDiff(context, {
      commitOid: card.hash,
      parentOid: card.previousHash ?? null,
      filePath
    })
      .then((diff) => {
        if (alive) {
          setLoad({ phase: 'ready', diff })
        }
      })
      .catch(() => {
        if (alive) {
          setLoad({ phase: 'error' })
        }
      })
    return () => {
      alive = false
    }
  }, [open, card.hash, card.previousHash, card.fullMessage, filePath, context])

  const lane = gitBlameAvatarLaneForAuthor(card.author)
  const fileDiff = load.phase === 'ready' ? buildGitBlameFileDiff(load.diff) : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2.5 text-left text-sm font-semibold">
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-avatar-foreground-on-lane"
                style={{ backgroundColor: `var(--git-graph-lane-${lane})` }}
                data-avatar-lane={lane}
                aria-hidden="true"
              >
                {gitBlameAvatarInitial(card.author)}
              </div>
              <span className="min-w-0 break-words">{card.summary}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto scrollbar-editor">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{card.author}</span>
            <span>
              {strings.committedLabel} {card.relativeDate}
            </span>
            <span className="rounded-xs bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">
              {card.abbreviatedHash}
            </span>
          </div>
          {message && message !== card.summary ? (
            <div className="text-xs break-words text-foreground/80 whitespace-pre-line">
              {message}
            </div>
          ) : null}
          <div className="border-t border-border pt-3">
            {load.phase === 'loading' ? (
              <div className="text-xs text-muted-foreground">{strings.loadingDiff}</div>
            ) : null}
            {load.phase === 'error' ? (
              <div className="text-xs text-muted-foreground">{strings.diffError}</div>
            ) : null}
            {fileDiff && !fileDiff.isText ? (
              <div className="text-xs text-muted-foreground">{strings.binaryFile}</div>
            ) : null}
            {fileDiff?.truncated ? (
              <div className="text-xs text-muted-foreground">{strings.diffTruncated}</div>
            ) : null}
            {fileDiff?.isText && !fileDiff.truncated ? (
              <>
                <div className="mb-2 flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-foreground">{filePath}</span>
                  <span className="ml-auto text-diff-added">+{fileDiff.added}</span>
                  <span className="text-diff-removed">−{fileDiff.removed}</span>
                </div>
                <div className="overflow-hidden rounded-md border border-border font-mono text-[11px] leading-[18px]">
                  {fileDiff.hunks.map((hunk, hunkIndex) => (
                    <div key={hunkIndex}>
                      {hunk.rows.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={
                            row.kind === 'added'
                              ? 'bg-diff-added-background px-2 whitespace-pre'
                              : row.kind === 'removed'
                                ? 'bg-diff-removed-background px-2 whitespace-pre'
                                : 'px-2 whitespace-pre'
                          }
                        >
                          {row.text}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
