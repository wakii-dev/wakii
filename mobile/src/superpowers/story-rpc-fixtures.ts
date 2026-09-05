import type {
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult,
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from '../../../src/shared/superpowers/story-rpc-contract'

// Wire-shaped mock responses against the PINNED §3b contract — `satisfies` is the
// compile-time conformance check; runtime checks live in story-rpc-conformance.test.ts.
// Exported for reuse by story data module (T3/T4) and UI tests.

export const storyListHappyPath = {
  stories: [
    {
      storyId: 'brackets/fi307-sf2-mobile-story.md',
      title: 'SF-2 Mobile story screens + Linear status',
      epicId: 'FI-307',
      worktreeId: 'wt-orca-main',
      workspaceName: 'orca',
      // khớp chéo storyDetailHappyPath: sfTotal = sfs.length, sfDone = đếm status 'done'
      sfTotal: 4,
      sfDone: 1,
      pendingGates: 1,
      updatedAt: 1757000060000,
      parseError: false
    },
    {
      storyId: 'brackets/fi306-sf1-superpowers-android.md',
      title: 'SF-1 Superpowers Android foundation',
      epicId: 'FI-306',
      worktreeId: 'wt-orca-main',
      workspaceName: 'orca',
      sfTotal: 4,
      sfDone: 0,
      pendingGates: 0,
      updatedAt: 1757000050000,
      parseError: false
    },
    {
      storyId: 'brackets/fi305-story-watchdog.md',
      title: 'Story watchdog + resume loop',
      epicId: 'FI-305',
      worktreeId: 'wt-atlas-fi305',
      workspaceName: 'atlas',
      sfTotal: 5,
      sfDone: 5,
      pendingGates: 0,
      updatedAt: 1757000040000,
      parseError: false
    },
    {
      // worktreeId null = ngoài worktree đăng ký ('khác' group) — defensive path, v1 hiếm gặp
      storyId: 'notes/scratch-idea.md',
      title: 'Scratch idea outside any worktree',
      epicId: 'FI-299',
      worktreeId: null,
      workspaceName: 'atlas',
      sfTotal: 2,
      sfDone: 1,
      pendingGates: 2,
      updatedAt: 1757000030000,
      parseError: false
    }
  ]
} satisfies SuperpowersStoryListResult

// Fully-broken bracket: heading fallback = file name, epicId ''. Desktop chỉ cam kết
// sfTotal: 0 + parseError: true — các counter còn lại phải zero.
export const storyListItemParseError = {
  storyId: 'brackets/broken-bracket.md',
  title: 'broken-bracket.md',
  epicId: '',
  worktreeId: 'wt-orca-main',
  workspaceName: 'orca',
  sfTotal: 0,
  sfDone: 0,
  pendingGates: 0,
  updatedAt: 1757000020000,
  parseError: true
} satisfies SuperpowersStoryListItem

// Malformed + healthy mix — healthy rows phải sống sót cạnh entry lỗi (T9).
export const storyListWithParseError = {
  stories: [...storyListHappyPath.stories, storyListItemParseError]
} satisfies SuperpowersStoryListResult

// Same bracket name in several worktrees is BY DESIGN (host-side list does not
// dedup) — rows must stay distinct via their worktree-scoped keys.
export const storyListDuplicateStoryIdAcrossWorktrees = {
  stories: [
    {
      storyId: 'brackets/fi307-sf2-mobile-story.md',
      title: 'SF-2 Mobile story screens + Linear status',
      epicId: 'FI-307',
      worktreeId: 'wt-orca-main',
      workspaceName: 'orca',
      sfTotal: 4,
      sfDone: 1,
      pendingGates: 0,
      updatedAt: 1757000060000,
      parseError: false
    },
    {
      storyId: 'brackets/fi307-sf2-mobile-story.md',
      title: 'SF-2 Mobile story screens + Linear status',
      epicId: 'FI-307',
      worktreeId: 'wt-atlas-fi307',
      workspaceName: 'atlas',
      sfTotal: 4,
      sfDone: 0,
      pendingGates: 1,
      updatedAt: 1757000055000,
      parseError: false
    }
  ]
} satisfies SuperpowersStoryListResult

export const storyDetailHappyPath = {
  story: {
    storyId: 'brackets/fi307-sf2-mobile-story.md',
    title: 'SF-2 Mobile story screens + Linear status',
    epicId: 'FI-307',
    destination: 'story/fi305-superpowers-android',
    worktreeId: 'wt-orca-main',
    workspaceName: 'orca',
    parseError: false,
    sfs: [
      {
        name: 'SF-1',
        title: 'Superpowers Android foundation',
        tier: 0,
        what: 'Contract + scanner + RPC methods trên host',
        dependsOn: [],
        linear: 'FI-306',
        status: 'done'
      },
      {
        name: 'SF-2',
        title: 'Mobile story screens + Linear status',
        tier: 1,
        what: 'List + detail screens, data modules, Linear read',
        dependsOn: ['SF-1'],
        linear: 'FI-307',
        status: 'in-progress'
      },
      {
        name: 'SF-3',
        title: 'Gate resolve + notifications',
        tier: 1,
        what: 'Resolve UI + gate notification routing',
        dependsOn: ['SF-1'],
        linear: 'FI-308',
        status: 'todo'
      },
      {
        name: 'SF-4',
        title: 'Deep links + device verification',
        tier: 2,
        what: 'Deep-link wiring + on-device acceptance',
        dependsOn: ['SF-2', 'SF-3'],
        linear: null,
        status: 'unknown'
      }
    ]
  },
  gates: [
    {
      gateId: 'gate-orchestrate-001',
      title: 'Approve SF-2 direction',
      status: 'pending',
      resolution: null,
      options: ['approve', 'reject'],
      worktreeId: 'wt-orca-main',
      createdAt: 1757000000000,
      storyLinked: true
    },
    {
      gateId: 'gate-orchestrate-002',
      title: 'Confirm contract §3b freeze',
      status: 'resolved',
      resolution: 'approve',
      options: ['approve', 'reject'],
      worktreeId: 'wt-orca-main',
      createdAt: 1756999900000,
      storyLinked: true
    },
    {
      gateId: 'gate-orchestrate-003',
      title: 'Pick emulator device id',
      status: 'timeout',
      resolution: null,
      options: ['emulator-5554', 'emulator-5556'],
      worktreeId: null,
      createdAt: 1756999800000,
      // timeout sau khi bracket bị xóa/rename → link lost
      storyLinked: false
    }
  ]
} satisfies SuperpowersStoryDetailResult

export const storyDetailNotFound = {
  error: 'story_not_found'
} satisfies SuperpowersStoryDetailError
