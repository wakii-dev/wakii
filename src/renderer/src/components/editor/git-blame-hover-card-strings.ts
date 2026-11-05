import { translate } from '@/i18n/i18n'

export type GitBlameHoverCardStrings = {
  /** Footer secondary action: opens the commit detail dialog. */
  viewCommit: string
  /** Footer ghost action: walks blame back to the line's parent commit. */
  blamePrevious: string
  /** Footer ghost action: copies the full sha to the clipboard. */
  copySha: string
  /** Prefix of the card's sub line, e.g. "committed 3 hours ago". */
  committedLabel: string
  /** Commit-detail dialog while the diff is being read. */
  loadingDiff: string
  /** Commit-detail dialog when the diff read fails. */
  diffError: string
  /** Commit-detail dialog when the file diff exceeds the render cap. */
  diffTruncated: string
  /** Commit-detail dialog for binary files. */
  binaryFile: string
  /** Revision badge prefix while the blame view walks a past revision. */
  viewingBlameAt: string
  /** Revision badge action returning the blame view to HEAD. */
  backToHead: string
}

export const GIT_BLAME_HOVER_CARD_STRINGS_EN: GitBlameHoverCardStrings = {
  viewCommit: 'View commit',
  blamePrevious: 'Blame previous',
  copySha: 'Copy SHA',
  committedLabel: 'committed',
  loadingDiff: 'Loading diff…',
  diffError: 'Could not load the diff.',
  diffTruncated: 'Diff is truncated — the file is too large.',
  binaryFile: 'Binary file — no text diff.',
  viewingBlameAt: 'Viewing blame at',
  backToHead: 'Back to HEAD'
}

export function getGitBlameHoverCardStrings(): GitBlameHoverCardStrings {
  return {
    viewCommit: translate(
      'auto.components.editor.git.blame.hover.card.strings.a50716ea63',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.viewCommit
    ),
    blamePrevious: translate(
      'auto.components.editor.git.blame.hover.card.strings.40fa6020df',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.blamePrevious
    ),
    copySha: translate(
      'auto.components.editor.git.blame.hover.card.strings.0eae340db7',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.copySha
    ),
    committedLabel: translate(
      'auto.components.editor.git.blame.hover.card.strings.90ad97b410',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.committedLabel
    ),
    loadingDiff: translate(
      'auto.components.editor.git.blame.hover.card.strings.3391c6e774',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.loadingDiff
    ),
    diffError: translate(
      'auto.components.editor.git.blame.hover.card.strings.8e4efd3b58',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.diffError
    ),
    diffTruncated: translate(
      'auto.components.editor.git.blame.hover.card.strings.9e1ebf17fd',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.diffTruncated
    ),
    binaryFile: translate(
      'auto.components.editor.git.blame.hover.card.strings.d100bd0ac1',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.binaryFile
    ),
    viewingBlameAt: translate(
      'auto.components.editor.git.blame.hover.card.strings.72ed431302',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.viewingBlameAt
    ),
    backToHead: translate(
      'auto.components.editor.git.blame.hover.card.strings.b82be82a58',
      GIT_BLAME_HOVER_CARD_STRINGS_EN.backToHead
    )
  }
}
