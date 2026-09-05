import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../../orchestration/db'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { ResolvedWorktree } from '../../runtime-worktree-path-identity'
import { resetSfStatusCacheForTests } from '../../../superpowers/story-linear-status'
import { SUPERPOWERS_STORY_DETAIL_METHODS, resolveStoryDetail } from './superpowers-story-detail'

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
  'Destination: story/fi305-superpowers-android',
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

function makeBracketWorktree(prefix: string, brackets: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`))
  const bracketsDir = join(root, 'docs', 'superpowers', 'brackets')
  mkdirSync(bracketsDir, { recursive: true })
  for (const [name, content] of Object.entries(brackets)) {
    writeFileSync(join(bracketsDir, name), content)
  }
  return root
}

function setMtime(wtPath: string, fileName: string, mtimeMs: number): void {
  utimesSync(
    join(wtPath, 'docs', 'superpowers', 'brackets', fileName),
    new Date(0),
    new Date(mtimeMs)
  )
}

function seedGateOnWorktree(
  db: OrchestrationDb,
  spec: string,
  worktreeId: string | null,
  gate: { id: string; question: string; options?: string; createdAt?: string }
): void {
  const task = db.createTask({ spec })
  if (worktreeId !== null) {
    const { dispatch } = db.createStartingWorkerDispatch({
      taskId: task.id,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
    db.db
      .prepare('UPDATE worker_dispatches SET worktree_id = ? WHERE dispatch_id = ?')
      .run(worktreeId, dispatch.id)
  }
  db.db
    .prepare(
      'INSERT INTO decision_gates (id, run_id, task_id, question, options, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      gate.id,
      task.run_id,
      task.id,
      gate.question,
      gate.options ?? '[]',
      gate.createdAt ?? '2026-01-02 03:04:05'
    )
}

async function callStoryDetail(runtime: OrcaRuntimeService, storyId: string): Promise<unknown> {
  const method = SUPERPOWERS_STORY_DETAIL_METHODS[0]!
  const handler = method.handler as (
    params: unknown,
    ctx: { runtime: OrcaRuntimeService }
  ) => unknown
  return handler({ storyId }, { runtime })
}

describe('superpowers.storyDetail', () => {
  let roots: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    resetSfStatusCacheForTests()
    // SF-1 world: Linear absent → every status 'unknown'.
    linearGetStatus.mockReturnValue({ connected: false })
  })

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true })
    }
    roots = []
  })

  function track(root: string): string {
    roots.push(root)
    return root
  }

  it('registers the method with a storyId param schema', () => {
    expect(SUPERPOWERS_STORY_DETAIL_METHODS).toHaveLength(1)
    expect(SUPERPOWERS_STORY_DETAIL_METHODS[0]?.name).toBe('superpowers.storyDetail')
    expect(SUPERPOWERS_STORY_DETAIL_METHODS[0]?.params).not.toBeNull()
  })

  it('returns full detail for an existing story (sfs §3b shape)', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail', { 'fi305-android.md': VALID_BRACKET })
    )
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'android')], db)

    const result = (await callStoryDetail(runtime, 'brackets/fi305-android.md')) as {
      story: Record<string, unknown>
    }

    expect(result).not.toHaveProperty('error')
    expect(result.story).toMatchObject({
      storyId: 'brackets/fi305-android.md',
      title: 'Superpowers on Android',
      epicId: 'FI-305',
      destination: 'story/fi305-superpowers-android',
      worktreeId: `repo::${wtPath}`,
      workspaceName: 'android',
      parseError: false
    })
    expect(result.story.sfs).toEqual([
      {
        name: 'SF-1',
        title: 'Desktop RPC foundation',
        tier: 1,
        what: 'RPC methods',
        dependsOn: [],
        linear: 'FI-306',
        status: 'unknown'
      },
      {
        name: 'SF-2',
        title: 'Mobile client',
        tier: 2,
        what: 'client UI',
        dependsOn: ['SF-1'],
        linear: null,
        status: 'unknown'
      }
    ])
  })

  it('returns story_not_found when no worktree bracket matches (never throws)', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(makeBracketWorktree('orca-story-detail-miss', { 'a.md': VALID_BRACKET }))
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'a')], db)

    await expect(callStoryDetail(runtime, 'brackets/missing.md')).resolves.toEqual({
      error: 'story_not_found'
    })
    await expect(callStoryDetail(makeRuntime([], db), 'brackets/a.md')).resolves.toEqual({
      error: 'story_not_found'
    })
  })

  it('includes gates linked to the story worktree + null-derived gates, excludes other worktrees', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtA = track(makeBracketWorktree('orca-story-detail-ga', { 'story-a.md': VALID_BRACKET }))
    const wtB = track(makeBracketWorktree('orca-story-detail-gb', { 'story-b.md': VALID_BRACKET }))
    seedGateOnWorktree(db, 'linked', `repo::${wtA}`, {
      id: 'gate_linked',
      question: 'Proceed with SF-1?',
      options: '["yes","no"]',
      createdAt: '2026-01-02 03:04:05'
    })
    seedGateOnWorktree(db, 'unmapped', null, {
      id: 'gate_unmapped',
      question: 'Unlinked question?',
      createdAt: '2026-02-03 04:05:06'
    })
    seedGateOnWorktree(db, 'other', `repo::${wtB}`, { id: 'gate_other', question: 'Other tree?' })
    const runtime = makeRuntime(
      [makeCatalogEntry(`repo::${wtA}`, wtA, 'a'), makeCatalogEntry(`repo::${wtB}`, wtB, 'b')],
      db
    )

    const result = (await callStoryDetail(runtime, 'brackets/story-a.md')) as {
      gates: Record<string, unknown>[]
    }

    expect(result.gates.map((g) => g.gateId)).toEqual(['gate_linked', 'gate_unmapped'])
    expect(result.gates[0]).toEqual({
      gateId: 'gate_linked',
      title: 'Proceed with SF-1?',
      status: 'pending',
      resolution: null,
      options: ['yes', 'no'],
      worktreeId: `repo::${wtA}`,
      createdAt: Date.parse('2026-01-02T03:04:05Z'),
      storyLinked: true
    })
    expect(result.gates[1]).toMatchObject({
      gateId: 'gate_unmapped',
      worktreeId: null,
      storyLinked: false
    })
  })

  it('passes resolved status and resolution through', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-res', { 'story.md': VALID_BRACKET })
    )
    seedGateOnWorktree(db, 't', `repo::${wtPath}`, { id: 'gate_res', question: 'Continue?' })
    // Settle the seeded dispatch so resolveGate's task→ready transition is permitted.
    db.db.prepare("UPDATE dispatch_contexts SET status = 'completed'").run()
    db.resolveGate('gate_res', 'approved')
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const result = (await callStoryDetail(runtime, 'brackets/story.md')) as {
      gates: Record<string, unknown>[]
    }

    expect(result.gates[0]).toMatchObject({ status: 'resolved', resolution: 'approved' })
  })

  it('picks the newest-mtime bracket when the same storyId exists in two worktrees', async () => {
    const db = new OrchestrationDb(':memory:')
    const older = track(
      makeBracketWorktree('orca-story-detail-old', {
        'dupe.md': '# Story: FI-1 — Old copy\nDestination: branch/old\n'
      })
    )
    const newer = track(
      makeBracketWorktree('orca-story-detail-new', {
        'dupe.md': '# Story: FI-1 — New copy\nDestination: branch/new\n'
      })
    )
    setMtime(older, 'dupe.md', 1_000)
    setMtime(newer, 'dupe.md', 2_000)
    const runtime = makeRuntime(
      [
        makeCatalogEntry(`repo::${older}`, older, 'older'),
        makeCatalogEntry(`repo::${newer}`, newer, 'newer')
      ],
      db
    )

    const result = (await callStoryDetail(runtime, 'brackets/dupe.md')) as {
      story: Record<string, unknown>
    }

    expect(result.story).toMatchObject({
      title: 'New copy',
      destination: 'branch/new',
      worktreeId: `repo::${newer}`,
      workspaceName: 'newer'
    })
  })

  it('breaks mtime ties deterministically by catalog order', async () => {
    const db = new OrchestrationDb(':memory:')
    const first = track(
      makeBracketWorktree('orca-story-detail-t1', {
        'dupe.md': '# Story: FI-1 — First\nDestination: branch/first\n'
      })
    )
    const second = track(
      makeBracketWorktree('orca-story-detail-t2', {
        'dupe.md': '# Story: FI-1 — Second\nDestination: branch/second\n'
      })
    )
    setMtime(first, 'dupe.md', 1_000)
    setMtime(second, 'dupe.md', 1_000)
    const runtime = makeRuntime(
      [
        makeCatalogEntry(`repo::${first}`, first, 'first'),
        makeCatalogEntry(`repo::${second}`, second, 'second')
      ],
      db
    )

    const result = (await callStoryDetail(runtime, 'brackets/dupe.md')) as {
      story: Record<string, unknown>
    }

    expect(result.story).toMatchObject({ title: 'First', workspaceName: 'first' })
  })

  it('returns detail with parseError true and empty sfs for a non-bracket file', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-broken', { 'broken.md': NO_HEADING_BRACKET })
    )
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const result = (await callStoryDetail(runtime, 'brackets/broken.md')) as {
      story: Record<string, unknown>
    }

    expect(result.story).toMatchObject({
      storyId: 'brackets/broken.md',
      title: 'broken',
      epicId: '',
      destination: null,
      parseError: true,
      sfs: []
    })
  })

  it('parses corrupted-options gates as empty options instead of crashing', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-opt', { 'story.md': VALID_BRACKET })
    )
    seedGateOnWorktree(db, 't', `repo::${wtPath}`, {
      id: 'gate_bad_opts',
      question: 'Pick?',
      options: 'not-json'
    })
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)

    const result = (await callStoryDetail(runtime, 'brackets/story.md')) as {
      gates: Record<string, unknown>[]
    }

    expect(result.gates[0]).toMatchObject({ gateId: 'gate_bad_opts', options: [] })
  })

  it('reads Linear status for sfs carrying linear: when connected', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-linear', { 'story.md': VALID_BRACKET })
    )
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
    linearGetStatus.mockReturnValue({ connected: true })
    linearGetIssue.mockResolvedValue({ state: { name: 'Done', type: 'completed', color: '' } })

    const result = await resolveStoryDetail(runtime, 'brackets/story.md')

    expect(result).not.toHaveProperty('error')
    if (!('error' in result)) {
      expect(result.story.sfs[0]).toMatchObject({ linear: 'FI-306', status: 'done' })
      // SF-2 has no linear: → unknown without a Linear read.
      expect(result.story.sfs[1]).toMatchObject({ linear: null, status: 'unknown' })
    }
    expect(linearGetIssue).toHaveBeenCalledTimes(1)
    expect(linearGetIssue).toHaveBeenCalledWith('FI-306')
  })

  it('degrades a per-issue Linear failure to unknown without failing the method', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-linear-err', { 'story.md': VALID_BRACKET })
    )
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
    linearGetStatus.mockReturnValue({ connected: true })
    linearGetIssue.mockRejectedValue(new Error('linear down'))

    const result = await resolveStoryDetail(runtime, 'brackets/story.md')

    expect(result).not.toHaveProperty('error')
    if (!('error' in result)) {
      expect(result.story.sfs[0]).toMatchObject({ status: 'unknown' })
    }
  })

  it('serves two polls within the TTL from one Linear pass', async () => {
    const db = new OrchestrationDb(':memory:')
    const wtPath = track(
      makeBracketWorktree('orca-story-detail-ttl', { 'story.md': VALID_BRACKET })
    )
    const runtime = makeRuntime([makeCatalogEntry(`repo::${wtPath}`, wtPath, 'wt')], db)
    linearGetStatus.mockReturnValue({ connected: true })
    linearGetIssue.mockResolvedValue({ state: { name: 'Done', type: 'completed', color: '' } })
    const clock = { now: () => 5_000 }

    await resolveStoryDetail(runtime, 'brackets/story.md', clock)
    await resolveStoryDetail(runtime, 'brackets/story.md', clock)

    expect(linearGetIssue).toHaveBeenCalledTimes(1)
  })
})
