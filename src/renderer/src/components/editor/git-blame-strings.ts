import { translate } from '@/i18n/i18n'

export type GitBlameStrings = {
  /** Label for a line the user inserted but has not committed. */
  you: string
  /** Suffix shown while the buffer has unsaved changes the blame predates. */
  stale: string
  /** Hover text when the file is over the byte limit. */
  skipReasonTooLarge: string
  /** Hover text when the file is over the line limit. */
  skipReasonTooManyLines: string
  /** Hover field labels. */
  hashLabel: string
  authorLabel: string
  dateLabel: string
}

export const GIT_BLAME_STRINGS_EN: GitBlameStrings = {
  you: 'You',
  stale: 'unsaved changes',
  skipReasonTooLarge: 'File is too large for inline blame.',
  skipReasonTooManyLines: 'File has too many lines for inline blame.',
  hashLabel: 'Commit',
  authorLabel: 'Author',
  dateLabel: 'Date'
}

export function getGitBlameStrings(): GitBlameStrings {
  return {
    you: translate('auto.components.editor.git-blame-strings.you', GIT_BLAME_STRINGS_EN.you),
    stale: translate(
      'auto.components.editor.git-blame-strings.stale',
      GIT_BLAME_STRINGS_EN.stale
    ),
    skipReasonTooLarge: translate(
      'auto.components.editor.git-blame-strings.skip-too-large',
      GIT_BLAME_STRINGS_EN.skipReasonTooLarge
    ),
    skipReasonTooManyLines: translate(
      'auto.components.editor.git-blame-strings.skip-too-many-lines',
      GIT_BLAME_STRINGS_EN.skipReasonTooManyLines
    ),
    hashLabel: translate(
      'auto.components.editor.git-blame-strings.hash-label',
      GIT_BLAME_STRINGS_EN.hashLabel
    ),
    authorLabel: translate(
      'auto.components.editor.git-blame-strings.author-label',
      GIT_BLAME_STRINGS_EN.authorLabel
    ),
    dateLabel: translate(
      'auto.components.editor.git-blame-strings.date-label',
      GIT_BLAME_STRINGS_EN.dateLabel
    )
  }
}
