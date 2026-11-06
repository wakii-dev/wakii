import { ipcMain } from 'electron'
import type { GitBlameOptions, GitBlameResult } from '../../../shared/git-blame-types'
import { getBlame } from '../../git/blame'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { resolveRegisteredWorktreePath } from '../worktrees/removal/registered-worktree-roots-cache'
import { validateGitRelativeFilePath } from './access/filesystem-path-containment'
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
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
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
        ...(args.revision ? { revision: args.revision } : {}),
        admissionTier: 'interactive'
      })
    }
  )
}
