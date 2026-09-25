export type GitBlameOptions = {
  /** Repo-relative (or worktree-relative) path of the file to blame. */
  filePath: string
}

export type GitBlameLine = {
  /** 1-based line number in the working-tree file this blame entry applies to. */
  lineNumber: number
  /** Full commit sha, or the all-zero hash for uncommitted lines. */
  hash: string
  /** Short display sha derived from `hash`. */
  abbreviatedHash: string
  author: string
  /** Author time in epoch milliseconds. */
  authorTime: number
  summary: string
  /** False for the all-zero hash (line matches the working tree, not a commit). */
  committed: boolean
  /** Parent sha from porcelain `previous` (absent for root/boundary commits). */
  previousHash?: string
}

export type GitBlameResult = {
  filePath: string
  lines: GitBlameLine[]
}
