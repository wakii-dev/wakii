import { translate } from '@/i18n/i18n'

export type GitContextMenuStrings = {
  /** Editor context-menu item: opens the file history tab (GitLens-parity SF-3). */
  openFileHistory: string
  /** Editor context-menu item: toggles the file-blame gutter (GitLens-parity SF-2). */
  toggleFileBlame: string
}

export const GIT_CONTEXT_MENU_STRINGS_EN: GitContextMenuStrings = {
  openFileHistory: 'Open File History',
  toggleFileBlame: 'Toggle File Blame'
}

export function getGitContextMenuStrings(): GitContextMenuStrings {
  return {
    openFileHistory: translate(
      'auto.components.editor.git.context.menu.strings.99fa55520a',
      GIT_CONTEXT_MENU_STRINGS_EN.openFileHistory
    ),
    toggleFileBlame: translate(
      'auto.components.editor.git.context.menu.strings.59d25cc797',
      GIT_CONTEXT_MENU_STRINGS_EN.toggleFileBlame
    )
  }
}
