import { ipcMain } from 'electron'
import { getCommitMessageBody } from '../../git/commit-message-read'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { validateFullGitObjectId } from './filesystem-path-containment'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

export function registerFilesystemGitCommitMessageHandlers(
  context: FilesystemHandlerContext
): void {
  const { store } = context
  ipcMain.handle(
    'git:commitMessageBody',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string; sha: string }
    ): Promise<string> => {
      // Why 'interactive': the blame hover card fetches the message body while
      // the user reads it — tier 0, user-waiting.
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const sha = validateFullGitObjectId(args.sha, 'sha')
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getCommitMessageBody(worktreePath, { sha }, gitOptions)
    }
  )
}
