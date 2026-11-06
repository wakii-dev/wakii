// Deterministic author → git-graph-lane color map (mockup B). Same author
// always gets the same lane color; collisions are accepted — this is a hint
// color like GitLens, not an identity.
const GIT_BLAME_AVATAR_LANE_COUNT = 5

export function gitBlameAvatarLaneForAuthor(author: string): number {
  let hash = 0
  for (let index = 0; index < author.length; index += 1) {
    hash = (hash * 31 + author.charCodeAt(index)) >>> 0
  }
  return (hash % GIT_BLAME_AVATAR_LANE_COUNT) + 1
}

/** First grapheme of the author name, uppercased — the avatar letter. */
export function gitBlameAvatarInitial(author: string): string {
  const first = [...author.trim()][0]
  return (first ?? '?').toUpperCase()
}
