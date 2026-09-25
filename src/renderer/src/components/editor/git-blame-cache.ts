import { GitBlameCache } from './git-blame-annotation-model'

// Module-level: blame survives editor remounts and is shared across surfaces.
// Lives in its own store-free module so store teardown slices can wire eviction
// without importing the hook (which imports the store — a circular import).
export const gitBlameCache = new GitBlameCache()

/** Eviction hook for worktree removal — wired by the removeWorktree chokepoint. */
export function clearGitBlameCacheForWorktree(worktreeId: string): void {
  gitBlameCache.clearWorktree(worktreeId)
}

/** Eviction hook for tab close — wired by the closeFile action. */
export function clearGitBlameCacheForFile(worktreeId: string, filePath: string): void {
  gitBlameCache.clearFile(worktreeId, filePath)
}
