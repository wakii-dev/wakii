import { createPortal } from 'react-dom'
import type React from 'react'
import type { editor } from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type { GitBlameLine } from '../../../../shared/git-blame-types'
import { GitBlameCommitDetailDialog } from './git-blame-commit-detail-dialog'
import { fetchGitBlameCommitMessage } from './git-blame-commit-message-client'
import { buildBlameHoverCard, type GitBlameHoverCardModel } from './git-blame-hover-card-model'
import {
  fetchGitBlameCommitDiffStat,
  type GitBlameCommitDiffStat
} from './git-blame-commit-diff-stat-client'
import { getGitBlameHoverCardStrings } from './git-blame-hover-card-strings'
import { GitBlameHoverCard } from './git-blame-hover-card'
import { getGitBlameStrings } from './git-blame-strings'
import type { MonacoGitBlameApi } from './use-monaco-git-blame'

export type GitBlameEditorHoverOverlayProps = {
  mountedEditor: editor.IStandaloneCodeEditor | null
  blame: MonacoGitBlameApi
  relativePath: string | null
}

type CardAnchor = { line: GitBlameLine; top: number }

const HOVER_SHOW_DELAY_MS = 400

/**
 * Editorial blame card for the editor (GitLens-parity SF-1): hovering a blamed
 * line opens the card (replacing the FI-35 markdown hover, which the hook
 * suppresses), View commit / SHA opens the centered commit-detail dialog, and
 * Blame previous walks the whole blame view back through `previousHash` with a
 * revision badge + return-to-HEAD affordance.
 */
export function GitBlameEditorHoverOverlay({
  mountedEditor,
  blame,
  relativePath
}: GitBlameEditorHoverOverlayProps): React.JSX.Element | null {
  const strings = getGitBlameHoverCardStrings()
  const [anchor, setAnchor] = useState<CardAnchor | null>(null)
  const [messageBody, setMessageBody] = useState<string | undefined>(undefined)
  const [diffStat, setDiffStat] = useState<GitBlameCommitDiffStat | undefined>(undefined)
  const [dialogCard, setDialogCard] = useState<GitBlameHoverCardModel | null>(null)
  // Latest blame api behind a ref: the listener effect registers once per editor.
  const blameRef = useRef(blame)
  blameRef.current = blame
  const contextRef = useRef<RuntimeGitContext | null>(null)
  contextRef.current = blame.getRuntimeContext()

  useEffect(() => {
    const activeEditor = mountedEditor
    if (!activeEditor) {
      return
    }
    let showTimer: ReturnType<typeof setTimeout> | undefined
    const cancelPending = (): void => {
      if (showTimer !== undefined) {
        clearTimeout(showTimer)
        showTimer = undefined
      }
    }
    const moveDisposable = activeEditor.onMouseMove((event) => {
      const lineNumber = event.target.position?.lineNumber ?? 0
      const line = blameRef.current.getBlameLineAt(lineNumber)
      if (!line?.committed) {
        cancelPending()
        setAnchor(null)
        return
      }
      cancelPending()
      showTimer = setTimeout(() => {
        const visible = activeEditor.getScrolledVisiblePosition({ lineNumber, column: 1 })
        if (visible) {
          setAnchor({ line, top: visible.top + (visible.height ?? 20) + 6 })
        }
      }, HOVER_SHOW_DELAY_MS)
    })
    const hide = (): void => {
      cancelPending()
      setAnchor(null)
    }
    const leaveDisposable = activeEditor.onMouseLeave(hide)
    const scrollDisposable = activeEditor.onDidScrollChange(hide)
    return () => {
      cancelPending()
      moveDisposable.dispose()
      leaveDisposable.dispose()
      scrollDisposable.dispose()
    }
  }, [mountedEditor])

  // Lazy full-message fetch: one read per sha, only while a card is open.
  useEffect(() => {
    if (!anchor) {
      return
    }
    const context = contextRef.current
    if (!context) {
      return
    }
    let alive = true
    setMessageBody(undefined)
    setDiffStat(undefined)
    fetchGitBlameCommitMessage(context, anchor.line.hash).then((fetched) => {
      if (alive && fetched) {
        setMessageBody(fetched)
      }
    })
    if (relativePath) {
      fetchGitBlameCommitDiffStat(
        context,
        anchor.line.hash,
        relativePath,
        anchor.line.previousHash
      ).then((stat) => {
        if (alive && stat) {
          setDiffStat(stat)
        }
      })
    }
    return () => {
      alive = false
    }
  }, [anchor, relativePath])

  const domNode = mountedEditor?.getDomNode() ?? null
  if (!domNode) {
    return null
  }
  const card = anchor
    ? buildBlameHoverCard(anchor.line, {
        strings: getGitBlameStrings(),
        ...(messageBody !== undefined ? { messageBody } : {}),
        ...(diffStat !== undefined ? { stat: diffStat } : {})
      })
    : null
  const context = contextRef.current
  return createPortal(
    <>
      {blame.blameRevision ? (
        <div className="absolute top-2 right-4 z-30 flex items-center gap-2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-sm">
          <span>
            {strings.viewingBlameAt}{' '}
            <span className="font-mono">{blame.blameRevision.slice(0, 7)}</span>
          </span>
          <button
            type="button"
            className="cursor-pointer font-semibold text-foreground underline underline-offset-2"
            onClick={blame.returnBlameToHead}
          >
            {strings.backToHead}
          </button>
        </div>
      ) : null}
      {card ? (
        <div
          className="absolute right-4 z-30"
          style={{ top: anchor?.top }}
          onMouseLeave={() => setAnchor(null)}
        >
          <GitBlameHoverCard
            card={card}
            strings={strings}
            onOpenCommit={() => {
              if (!relativePath || !context) {
                return
              }
              setDialogCard(card)
              setAnchor(null)
            }}
            onBlamePrevious={(previousHash) => {
              blame.requestBlamePrevious(previousHash)
              setAnchor(null)
            }}
          />
        </div>
      ) : null}
      {dialogCard && relativePath && context ? (
        <GitBlameCommitDetailDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialogCard(null)
            }
          }}
          card={dialogCard}
          filePath={relativePath}
          context={context}
        />
      ) : null}
    </>,
    domNode
  )
}
