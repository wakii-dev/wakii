// Contract PINNED — epic spec 2026-09-04 rev 3 §3b. SF-2/SF-3 (mobile) code chống đây.
// Type-only: KHÔNG import node/electron (mobile Metro bundle import được qua
// deep-relative path, pattern: mobile/src/worktree/worktree-host-row-identity.ts).

export type SuperpowersSfStatus = 'todo' | 'in-progress' | 'done' | 'unknown'

export type SuperpowersStoryListItem = {
  storyId: string // relative path từ docs/superpowers/ — vd 'brackets/fi305-superpowers-android.md'
  title: string
  epicId: string // id trong heading '# Story: <ID> — ...'
  worktreeId: string | null // null = ngoài worktree đăng ký (nhóm 'khác')
  workspaceName: string
  sfTotal: number
  sfDone: number // đếm sfs status === 'done' (SF-1 luôn 0 — status 'unknown')
  pendingGates: number
  updatedAt: number // mtime bracket (epoch ms)
  parseError: boolean
}

export type SuperpowersStoryListResult = { stories: SuperpowersStoryListItem[] }

export type SuperpowersStoryDetailSf = {
  name: string // 'SF-1'
  title: string
  tier: number
  what: string
  dependsOn: string[] // rỗng nếu tier 0 / '—'
  linear: string | null
  status: SuperpowersSfStatus // SF-1 hardcode 'unknown' (Linear read là SF-2)
}

export type SuperpowersStoryDetailResult = {
  story: {
    storyId: string
    title: string
    epicId: string
    destination: string | null
    worktreeId: string | null
    workspaceName: string
    parseError: boolean
    sfs: SuperpowersStoryDetailSf[]
  }
  gates: {
    gateId: string
    title: string
    status: 'pending' | 'resolved' | 'timeout'
    resolution: string | null
    options: string[]
    worktreeId: string | null
    createdAt: number
    storyLinked: boolean
  }[]
}

export type SuperpowersStoryDetailError = { error: 'story_not_found' }

export type SuperpowersGateResolveResult = {
  gateId: string
  status: 'resolved'
  resolution: string
}
export type SuperpowersGateResolveError =
  | { error: 'gate_not_found' }
  | { error: 'gate_not_pending' }
  | { error: 'invalid_resolution' }

// Notification routing payload — source 'gate-open' | 'gate-closed'
export type SuperpowersGateNotificationPayload = {
  gateId: string
  storyId: string | null
  worktreeId: string | null
  title: string
}
