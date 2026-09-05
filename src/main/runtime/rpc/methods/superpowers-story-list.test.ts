import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../../orchestration/db'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { ResolvedWorktree } from '../../runtime-worktree-path-identity'
import {
  listStoriesForRuntime,
  scanWorktreeBracketStories,
  SUPERPOWERS_STORY_LIST_METHODS
} from './superpowers-story-list'

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
  it('registers the method with null params', () => {
    expect(SUPERPOWERS_STORY_LIST_METHODS).toHaveLength(1)
    expect(SUPERPOWERS_STORY_LIST_METHODS[0]?.name).toBe('superpowers.storyList')
    expect(SUPERPOWERS_STORY_LIST_METHODS[0]?.params).toBeNull()
  })

  it('enumerates one entry per bracket file across two worktrees', async () => {
    const db = new OrchestrationDb(':memory:')
    const scansByPath: Record<string, ReturnType<typeof scanWorktreeBracketStories>> = {
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

  describe('scanWorktreeBracketStories (fs scanner)', () => {
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

      const scans = scanWorktreeBracketStories(wtPath)
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
      expect(scanWorktreeBracketStories(wtPath)).toEqual([])
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
