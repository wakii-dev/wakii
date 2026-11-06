import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

/**
 * Full commit message body (`git show -s --format=%B`) — the read surface the
 * blame hover card uses for its lazy per-sha message fetch. Git 2.25 baseline
 * safe; the sha is validated by the IPC layer before this runs.
 */
export async function getCommitMessageBody(
  worktreePath: string,
  args: { sha: string },
  options: GitRuntimeOptions = {}
): Promise<string> {
  const { stdout } = await gitExecFileAsync(
    ['show', '-s', '--format=%B', args.sha],
    gitOptionsForWorktree(worktreePath, options)
  )
  return stdout
}
