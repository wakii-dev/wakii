import type { GitBlameOptions, GitBlameResult } from '../../shared/git-blame-types'
import { loadGitBlameFromExecutor } from '../../shared/git-blame-porcelain-parser'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

export async function getBlame(
  worktreePath: string,
  options: GitBlameOptions & GitRuntimeOptions
): Promise<GitBlameResult> {
  return loadGitBlameFromExecutor(
    (args, cwd) => gitExecFileAsync(args, gitOptionsForWorktree(cwd, options)),
    worktreePath,
    options
  )
}
