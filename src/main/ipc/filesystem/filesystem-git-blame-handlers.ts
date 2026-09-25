import { ipcMain } from 'electron'
import type { GitBlameOptions, GitBlameResult } from '../../../shared/git-blame-types'
import { getBlame } from '../../git/blame'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../../providers/ssh-git-dispatch'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { validateGitRelativeFilePath } from '../filesystem-path-containment'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

export function registerFilesystemGitBlameHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:blame',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string } & GitBlameOptions
    ): Promise<GitBlameResult> => {
      // Why 'interactive': blame is user-waiting (cursor/hover-triggered) — tier 0.
      if (args.connectionId) {
        const filePath = validateGitRelativeFilePath(args.worktreePath, args.filePath)
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.getBlame(args.worktreePath, { filePath })
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getBlame(worktreePath, {
        ...gitOptions,
        filePath,
        admissionTier: 'interactive'
      })
    }
  )
}
