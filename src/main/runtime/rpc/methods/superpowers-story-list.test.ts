import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../../orchestration/db'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { ResolvedWorktree } from '../../runtime-worktree-path-identity'
import { resetSfStatusCacheForTests } from '../../../superpowers/story-linear-status'
import {
  listStoriesForRuntime,
  scanWorktreeStoryFiles,
  SUPERPOWERS_STORY_LIST_METHODS
} from './superpowers-story-list'

const linearGetStatus = vi.fn()
const linearGetIssue = vi.fn()

vi.mock('../../../linear/client', () => ({
  getStatus: (...args: unknown[]) => linearGetStatus(...args)
}))

vi.mock('../../../linear/linear-issue-lookups', () => ({
  getIssue: (...args: unknown[]) => linearGetIssue(...args)
}))

const VALID_BRACKET = [
  '# Story: FI-305 — Superpowers on Android',
  '',
  '## SF-1 Desktop RPC foundation',
  'Tier: 1',
  'What: RPC methods',
  'Depends on: —',
  'linear: FI-306',
  '',
  '## SF-2 Mobile client',
  'Tier: 2',
  'What: client UI',
  'Depends on: SF-1',
  ''
].join('\n')

const HEADING_ONLY_BRACKET = '# Story: FI-999 — Heading but no SFs\n\nbody text\n'

const NO_HEADING_BRACKET = 'just some notes, not a bracket\n'

function makeCatalogEntry(id: string, path: string, displayName: string): ResolvedWorktree {
  return { id, path, displayName } as unknown as ResolvedWorktree
}

function makeRuntime(catalog: ResolvedWorktree[], db: OrchestrationDb): OrcaRuntimeService {
  return {
    listWorktreeCatalog: vi.fn().mockResolvedValue(catalog),
    getOrchestrationDb: () => db
  } as unknown as OrcaRuntimeService
}

function seedPendingGateOnWorktree(
  db: OrchestrationDb,
  spec: string,
  worktreeId: string | null
): void {
  const task = db.createTask({ spec })
  const { dispatch } = db.createStartingWorkerDispatch({
    taskId: task.id,
    startOptions: {},
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER
  })
  db.db
    .prepare('UPDATE worker_dispatches SET worktree_id = ? WHERE dispatch_id = ?')
    .run(worktreeId, dispatch.id)
  db.db
    .prepare('INSERT INTO decision_gates (id, run_id, task_id, question) VALUES (?, ?, ?, ?)')
    .run(`gate_${task.id}`, task.run_id, task.id, 'Proceed?')
}

describe('superpowers.storyList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSfStatusCacheForTests()
    // SF-1 world: Linear absent → sfDone 0 everywhere.
    linearGetStatus.mockReturnValue({ connected: false })
  })

  it('registers the method with null params', () => {
    expect(SUPERPOWERS_STORY_LIST_METHODS).toHaveLength(1)
    expect(SUPERPOWERS_STORY_LIST_METHODS[0]?.name).toBe('superpowers.storyList')
    expect(SUPERPOWERS_STORY_LIST_METHODS[0]?.params).toBeNull()
  })

  it('enumerates one entry per bracket file across two worktrees', async () => {
    const db = new OrchestrationDb(':memory:')
    const scansByPath: Record<string, ReturnType<typeof scanWorktreeStoryFiles>> = {
      '/wt/a': [
        {
          storyId: 'brackets/fi305-android.md',
          epicId: 'FI-305',
          title: 'Superpowers on Android',
          sfTotal: 3,
          updatedAt: 200,
          parseError: false
        }
      ],
      '/wt/b': [
        {
          storyId: 'brackets/fi310-infra.md',
          epicId: 'FI-310',
          title: 'Infra',
          sfTotal: 2,
          updatedAt: 100,
          parseError: false
        },
        {
          storyId: 'brackets/fi311-dx.md',
          epicId: 'FI-311',
          title: 'DX',
          sfTotal: 1,
          updatedAt: 300,
          parseError: false
        }
      ]
    }
    const runtime = makeRuntime(
      [
        makeCatalogEntry('repo::/wt/a', '/wt/a', 'android'),
        makeCatalogEntry('repo::/wt/b', '/wt/b', 'infra')
      ],
      db
    )
    const stories = await listStoriesForRuntime(runtime, (path) => scansByPath[path] ?? [])

    expect(stories).toHaveLength(3)
    const byStoryId = new Map(stories.map((s) => [s.storyId, s]))
    expect(byStoryId.get('brackets/fi305-android.md')).toMatchObject({
      epicId: 'FI-305',
      title: 'Superpowers on Android',
      worktreeId: 'repo::/wt/a',
      workspaceName: 'android',
      sfTotal: 3,
      sfDone: 0,
      pendingGates: 0,
      parseError: false
    })
    expect(byStoryId.get('brackets/fi311-dx.md')).toMatchObject({
      worktreeId: 'repo::/wt/b',
      workspaceName: 'infra'
    })
  })

  it('counts pendingGates per matching worktreeId only', async () => {
    const db = new OrchestrationDb(':memory:')
    seedPendingGateOnWorktree(db, 'a1', 'repo::/wt/a')
    seedPendingGateOnWorktree(db, 'a2', 'repo::/wt/a')
    seedPendingGateOnWorktree(db, 'b1', 'repo::/wt/b')
    seedPendingGateOnWorktree(db, 'unmapped', null)
    const runtime = makeRuntime(
      [
        makeCatalogEntry('repo::/wt/a', '/wt/a', 'a'),
        makeCatalogEntry('repo::/wt/b', '/wt/b', 'b')
      ],
      db
    )
    const scanner = (worktreePath: string) => [
      {
        storyId: `brackets/${worktreePath.slice(1)}.md`,
        epicId: 'FI-1',
        title: 't',
        sfTotal: 1,
        updatedAt: 100,
        parseError: false
      }
    ]

    const stories = await listStoriesForRuntime(runtime, scanner)

    const byStoryId = new Map(stories.map((s) => [s.storyId, s]))
    expect(byStoryId.get('brackets/wt/a.md')?.pendingGates).toBe(2)
    expect(byStoryId.get('brackets/wt/b.md')?.pendingGates).toBe(1)
  })

  it('sorts by updatedAt desc with storyId asc tie-break', async () => {
    const db = new OrchestrationDb(':memory:')
    const runtime = makeRuntime([makeCatalogEntry('repo::/wt/a', '/wt/a', 'a')], db)
    const scanner = () => [
      {
        storyId: 'brackets/old.md',
        epicId: 'FI-1',
        title: 'o',
        sfTotal: 1,
        updatedAt: 100,
        parseError: false
      },
      {
        storyId: 'brackets/bb.md',
        epicId: 'FI-2',
        title: 'b',
        sfTotal: 1,
        updatedAt: 300,
        parseError: false
      },
      {
        storyId: 'brackets/aa.md',
        epicId: 'FI-3',
        title: 'a',
        sfTotal: 1,
        updatedAt: 300,
        parseError: false
      }
    ]

    const stories = await listStoriesForRuntime(runtime, scanner)

    expect(stories.map((s) => s.storyId)).toEqual([
      'brackets/aa.md',
      'brackets/bb.md',
      'brackets/old.md'
    ])
  })

  it('returns an empty list for an empty catalog', async () => {
    const db = new OrchestrationDb(':memory:')
    const runtime = makeRuntime([], db)

    const result = await SUPERPOWERS_STORY_LIST_METHODS[0]!.handler(undefined, {
      runtime
    } as unknown as Parameters<(typeof SUPERPOWERS_STORY_LIST_METHODS)[0]['handler']>[1])

    expect(result).toEqual({ stories: [] })
  })

  describe('sfDone via Linear statuses (desktop join)', () => {
    let root: string | null = null

    beforeEach(() => {
      root = null
    })

    afterEach(() => {
      if (root) {
        rmSync(root, { recursive: true, force: true })
        root = null
      }
    })

    function makeBracketWorktree(files: Record<string, string>): string {
      root = mkdtempSync(join(tmpdir(), 'orca-story-list-sfdone-'))
      const bracketsDir = join(root, 'docs', 'superpowers', 'brackets')
      mkdirSync(bracketsDir, { recursive: true })
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(bracketsDir, name), content)
      }
      return root
    }

    it('counts sfDone from Linear statuses by re-reading bracket linear ids', async () => {
      const db = new OrchestrationDb(':memory:')
      const wtPath = makeBracketWorktree({ 'story.md': VALID_BRACKET })
      const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
      linearGetStatus.mockReturnValue({ connected: true })
      linearGetIssue.mockResolvedValue({ state: { name: 'Done', type: 'completed', color: '' } })

      const stories = await listStoriesForRuntime(runtime)

      expect(stories).toHaveLength(1)
      expect(stories[0]).toMatchObject({ storyId: 'brackets/story.md', sfTotal: 2, sfDone: 1 })
      // Only the SF with linear: is read; SF-2 contributes nothing.
      expect(linearGetIssue).toHaveBeenCalledTimes(1)
      expect(linearGetIssue).toHaveBeenCalledWith('FI-306')
    })

    it('makes zero Linear reads when no SF carries linear:', async () => {
      const db = new OrchestrationDb(':memory:')
      const noLinear = '# Story: FI-1 — Plain\n\n## SF-1 A\nTier: 1\nWhat: x\nDepends on: —\n'
      const wtPath = makeBracketWorktree({ 'plain.md': noLinear })
      const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
      linearGetStatus.mockReturnValue({ connected: true })

      const stories = await listStoriesForRuntime(runtime)

      expect(stories[0]).toMatchObject({ sfTotal: 1, sfDone: 0 })
      expect(linearGetIssue).not.toHaveBeenCalled()
    })

    it('keeps sfDone 0 on per-issue Linear failure without failing the method', async () => {
      const db = new OrchestrationDb(':memory:')
      const wtPath = makeBracketWorktree({ 'story.md': VALID_BRACKET })
      const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
      linearGetStatus.mockReturnValue({ connected: true })
      linearGetIssue.mockRejectedValue(new Error('linear down'))

      const stories = await listStoriesForRuntime(runtime)

      expect(stories[0]).toMatchObject({ sfDone: 0, sfTotal: 2, parseError: false })
    })

    it('serves two polls within the TTL from one Linear pass', async () => {
      const db = new OrchestrationDb(':memory:')
      const wtPath = makeBracketWorktree({ 'story.md': VALID_BRACKET })
      const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
      linearGetStatus.mockReturnValue({ connected: true })
      linearGetIssue.mockResolvedValue({ state: { name: 'Done', type: 'completed', color: '' } })
      const clock = { now: () => 7_000 }

      await listStoriesForRuntime(runtime, scanWorktreeStoryFiles, clock)
      await listStoriesForRuntime(runtime, scanWorktreeStoryFiles, clock)

      expect(linearGetIssue).toHaveBeenCalledTimes(1)
    })
  })

  describe('scanWorktreeStoryFiles (fs scanner)', () => {
    let root: string | null = null

    afterEach(() => {
      if (root) {
        rmSync(root, { recursive: true, force: true })
        root = null
      }
    })

    function makeBracketWorktree(files: Record<string, string>): string {
      root = mkdtempSync(join(tmpdir(), 'orca-story-list-'))
      const bracketsDir = join(root, 'docs', 'superpowers', 'brackets')
      mkdirSync(bracketsDir, { recursive: true })
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(bracketsDir, name), content)
      }
      return root
    }

    it('parses valid brackets and flags zero-SF / heading-less files as parse errors', () => {
      const wtPath = makeBracketWorktree({
        'good.md': VALID_BRACKET,
        'heading-only.md': HEADING_ONLY_BRACKET,
        'no-heading.md': NO_HEADING_BRACKET
      })
      utimesSync(
        join(wtPath, 'docs', 'superpowers', 'brackets', 'good.md'),
        new Date(0),
        new Date(1_700_000_000_000)
      )

      const scans = scanWorktreeStoryFiles(wtPath)
      const byStoryId = new Map(scans.map((s) => [s.storyId, s]))

      expect(byStoryId.get('brackets/good.md')).toEqual({
        storyId: 'brackets/good.md',
        epicId: 'FI-305',
        title: 'Superpowers on Android',
        sfTotal: 2,
        updatedAt: 1_700_000_000_000,
        parseError: false
      })
      expect(byStoryId.get('brackets/heading-only.md')).toMatchObject({
        sfTotal: 0,
        parseError: true,
        epicId: 'FI-999'
      })
      expect(byStoryId.get('brackets/no-heading.md')).toMatchObject({
        sfTotal: 0,
        parseError: true,
        epicId: ''
      })
    })

    it('returns no stories for a worktree without a brackets dir', () => {
      const wtPath = mkdtempSync(join(tmpdir(), 'orca-story-list-empty-'))
      root = wtPath
      expect(scanWorktreeStoryFiles(wtPath)).toEqual([])
    })

    it('full path: tmpdir worktree brackets become sorted entries via the default scanner', async () => {
      const db = new OrchestrationDb(':memory:')
      const wtPath = makeBracketWorktree({
        'aaa.md': VALID_BRACKET,
        'zz-broken.md': NO_HEADING_BRACKET
      })
      utimesSync(
        join(wtPath, 'docs', 'superpowers', 'brackets', 'aaa.md'),
        new Date(0),
        new Date(1_700_000_000_000)
      )
      utimesSync(
        join(wtPath, 'docs', 'superpowers', 'brackets', 'zz-broken.md'),
        new Date(0),
        new Date(1_700_000_001_000)
      )
      const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'fixture')], db)

      const stories = await listStoriesForRuntime(runtime)

      expect(stories.map((s) => [s.storyId, s.parseError, s.sfTotal])).toEqual([
        ['brackets/zz-broken.md', true, 0],
        ['brackets/aaa.md', false, 2]
      ])
      expect(stories[1]).toMatchObject({
        worktreeId: `repo::${wtPath}`,
        workspaceName: 'fixture',
        epicId: 'FI-305',
        sfDone: 0,
        pendingGates: 0
      })
    })
  })
})

describe('superpowers.storyList — mindmaps/*.wakii discovery (VU-14 SF-5)', () => {
  let root: string | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    resetSfStatusCacheForTests()
    linearGetStatus.mockReturnValue({ connected: false })
  })

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = null
    }
  })

  function makeStoryWorktree(files: {
    mindmaps?: Record<string, string>
    brackets?: Record<string, string>
  }): string {
    root = mkdtempSync(join(tmpdir(), 'orca-story-list-wakii-'))
    for (const [dir, entries] of Object.entries(files)) {
      const dirPath = join(root, 'docs', 'superpowers', dir)
      mkdirSync(dirPath, { recursive: true })
      for (const [name, content] of Object.entries(entries)) {
        writeFileSync(join(dirPath, name), content)
      }
    }
    return root
  }

  const GOLDEN_WAKII = JSON.stringify({
    wakiiMindmap: 1,
    meta: {
      story: 'WI-9 — Golden story',
      epic: 'WI-9',
      dest: 'story/wi-9',
      generatedAt: '2026-09-28T00:00:00Z',
      generator: 'story-mindmap'
    },
    nodes: [
      { id: 'epic', kind: 'epic', title: 'WI-9 — Golden story' },
      { id: 'sf-1', kind: 'sf', title: 'First SF', tier: 1, summary: 'RPC', linear: 'FI-901' },
      { id: 'sf-2', kind: 'sf', title: 'Second SF', tier: 2, summary: 'UI' }
    ],
    edges: [
      { from: 'epic', to: 'sf-1', rel: 'contains' },
      { from: 'epic', to: 'sf-2', rel: 'contains' },
      { from: 'sf-2', to: 'sf-1', rel: 'depends-on' }
    ]
  })

  it('lists a .wakii-only worktree with storyId mindmaps/<name>.wakii and sfTotal from sf nodes', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = makeStoryWorktree({ mindmaps: { 'wi-9.wakii': GOLDEN_WAKII } })
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const stories = await listStoriesForRuntime(runtime)

    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({
      storyId: 'mindmaps/wi-9.wakii',
      epicId: 'WI-9',
      title: 'WI-9 — Golden story',
      sfTotal: 2,
      sfDone: 0,
      parseError: false
    })
  })

  it('counts sfDone from Linear using linear ids from .wakii nodes', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = makeStoryWorktree({ mindmaps: { 'wi-9.wakii': GOLDEN_WAKII } })
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
    linearGetStatus.mockReturnValue({ connected: true })
    linearGetIssue.mockResolvedValue({ state: { name: 'Done', type: 'completed', color: '' } })

    const stories = await listStoriesForRuntime(runtime)

    expect(stories[0]).toMatchObject({ sfTotal: 2, sfDone: 1 })
    expect(linearGetIssue).toHaveBeenCalledTimes(1)
    expect(linearGetIssue).toHaveBeenCalledWith('FI-901')
  })

  it('flags a broken .wakii as a parseError entry without failing the method', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = makeStoryWorktree({ mindmaps: { 'bad.wakii': '{ vỡ' } })
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const stories = await listStoriesForRuntime(runtime)

    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({ storyId: 'mindmaps/bad.wakii', parseError: true, sfTotal: 0 })
  })

  it('lists both sources: mindmaps .wakii and legacy brackets coexist', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = makeStoryWorktree({
      mindmaps: { 'wi-9.wakii': GOLDEN_WAKII },
      brackets: { 'legacy.md': VALID_BRACKET }
    })
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const stories = await listStoriesForRuntime(runtime)
    const ids = stories.map((s) => s.storyId).sort()

    expect(ids).toEqual(['brackets/legacy.md', 'mindmaps/wi-9.wakii'])
    expect(stories.find((s) => s.storyId === 'brackets/legacy.md')).toMatchObject({
      sfTotal: 2,
      parseError: false
    })
  })
})
