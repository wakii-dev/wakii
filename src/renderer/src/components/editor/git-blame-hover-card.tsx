import type React from 'react'
import { Button } from '@/components/ui/button'
import { gitBlameAvatarInitial, gitBlameAvatarLaneForAuthor } from './git-blame-avatar-lane'
import {
  getBlamePreviousTarget,
  gitBlameCardBodyText,
  type GitBlameHoverCardModel
} from './git-blame-hover-card-model'
import type { GitBlameHoverCardStrings } from './git-blame-hover-card-strings'

export type GitBlameHoverCardProps = {
  card: GitBlameHoverCardModel
  strings: GitBlameHoverCardStrings
  onOpenCommit?: (hash: string) => void
  onBlamePrevious?: (hash: string) => void
}

/**
 * Editorial blame card (GitLens-parity SF-1, mockup B): lane-colored avatar,
 * headline + full message, and the three footer actions. Blame metadata is
 * attacker-controlled repo content, so every field renders as a plain text
 * node — no markdown/HTML surface anywhere in the card.
 */
export function GitBlameHoverCard({
  card,
  strings,
  onOpenCommit,
  onBlamePrevious
}: GitBlameHoverCardProps): React.JSX.Element {
  const lane = gitBlameAvatarLaneForAuthor(card.author)
  const previousTarget = getBlamePreviousTarget(card)
  const bodyText = gitBlameCardBodyText(card.fullMessage, card.summary)
  return (
    <div className="w-[420px] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md">
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-avatar-foreground-on-lane"
          style={{ backgroundColor: `var(--git-graph-lane-${lane})` }}
          data-avatar-lane={lane}
          aria-hidden="true"
        >
          {gitBlameAvatarInitial(card.author)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{card.author}</div>
          <div className="mt-px text-xs text-muted-foreground">
            {card.committed ? (
              <>
                {strings.committedLabel} <span>{card.relativeDate}</span>
                {' · '}
                <button
                  type="button"
                  className="cursor-pointer font-mono text-[11px] text-popover-foreground underline decoration-muted-foreground underline-offset-2"
                  onClick={() => onOpenCommit?.(card.hash)}
                >
                  {card.abbreviatedHash}
                </button>
              </>
            ) : (
              <span>{card.relativeDate}</span>
            )}
          </div>
        </div>
        {card.committed && card.stat ? (
          <div className="ml-auto shrink-0 self-start font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold text-diff-added">+{card.stat.added}</span>{' '}
            <span className="text-diff-removed">−{card.stat.removed}</span>
          </div>
        ) : null}
      </div>
      <div className="mb-2 text-sm font-semibold break-words">{card.summary}</div>
      {bodyText ? (
        <div className="mb-3 text-xs break-words text-foreground/80 whitespace-pre-line">
          {bodyText}
        </div>
      ) : null}
      {card.committed ? (
        <>
          <div className="-mx-4 mb-2.5 border-t border-border" />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="xs" onClick={() => onOpenCommit?.(card.hash)}>
              {strings.viewCommit}
            </Button>
            {previousTarget ? (
              <Button variant="ghost" size="xs" onClick={() => onBlamePrevious?.(previousTarget)}>
                {strings.blamePrevious}{' '}
                <span className="font-mono">{previousTarget.slice(0, 7)}</span>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void navigator.clipboard?.writeText(card.hash)
              }}
            >
              {strings.copySha}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
