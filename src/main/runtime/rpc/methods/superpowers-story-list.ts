import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineMethod, type RpcMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { runtimeWorktreeIdsEqual } from '../../runtime-worktree-path-identity'
import type { OrchestrationDb } from '../../orchestration/db'
import { deriveWorktreeIdForGate } from '../../../superpowers/gate-worktree-derivation'
import { parseBracketHeading, parseBracketSfs } from '../../../superpowers/bracket-file-parse'
import { readSfStatuses } from '../../../superpowers/story-linear-status'
import type {
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Catalog source is PINNED to the runtime resolved-worktree snapshot — do not
// substitute (gate-worktree-derivation.ts header). Malformed brackets never
// fail the method: they surface as parseError entries.

export type BracketStoryScan = {
  storyId: string // 'brackets/<name.md>' — extension included (spec §3b)
  epicId: string // '' when the '# Story:' heading is missing
  title: string
  sfTotal: number
  updatedAt: number // bracket mtime, epoch ms
  parseError: boolean
}

export type BracketStoryScanner = (worktreePath: string) => BracketStoryScan[]

export function scanWorktreeBracketStories(worktreePath: string): BracketStoryScan[] {
  const bracketsDir = join(worktreePath, 'docs', 'superpowers', 'brackets')
  let names: string[]
  try {
    names = readdirSync(bracketsDir)
  } catch {
    return []
  }
  const scans: BracketStoryScan[] = []
  for (const name of names.filter((entry) => entry.endsWith('.md'))) {
    let updatedAt = 0
    try {
      updatedAt = statSync(join(bracketsDir, name)).mtimeMs
    } catch {
      // vanished between readdir and stat — keep 0, sort tail
    }
    let text = ''
    try {
      text = readFileSync(join(bracketsDir, name), 'utf8')
    } catch {
      // unreadable → parsed as empty below (parse-error entry)
    }
    const heading = parseBracketHeading(text, name)
    const sfs = parseBracketSfs(text)
    // Ruling R1: zero SF sections is a parse error — missing heading or a
    // heading with no SF body both land here; ≥1 SF section is a normal entry.
    const sfTotal = sfs === 'parse-error' ? 0 : sfs.length
    scans.push({
      storyId: `brackets/${name}`,
      epicId: heading.epicId ?? '',
      title: heading.title,
      sfTotal,
      updatedAt,
      parseError: sfTotal === 0
    })
  }
  return scans
}

type StoryListRuntime = Pick<OrcaRuntimeService, 'listWorktreeCatalog' | 'getOrchestrationDb'>

// The SF-1-frozen scanner drops raw text; re-read the bracket for `linear:` ids
// in the same pass (spec-critic P0 pin) — no scanner change, no third parser.
function readStoryLinearIds(worktreePath: string, storyId: string): string[] {
  try {
    const text = readFileSync(
      join(worktreePath, 'docs', 'superpowers', 'brackets', storyId.slice('brackets/'.length)),
      'utf8'
    )
    const sfs = parseBracketSfs(text)
    return sfs === 'parse-error' ? [] : sfs.flatMap((sf) => (sf.linear ? [sf.linear] : []))
  } catch {
    return []
  }
}

function countPendingGatesByWorktreeId(db: OrchestrationDb): Map<string, number> {
  const counts = new Map<string, number>()
  for (const gate of db.listGates({ status: 'pending' })) {
    const worktreeId = deriveWorktreeIdForGate(db, {
      run_id: gate.run_id,
      task_id: gate.task_id
    })
    if (!worktreeId) {
      continue
    }
    counts.set(worktreeId, (counts.get(worktreeId) ?? 0) + 1)
  }
  return counts
}

export async function listStoriesForRuntime(
  runtime: StoryListRuntime,
  scanBrackets: BracketStoryScanner = scanWorktreeBracketStories,
  opts?: { now?: () => number }
): Promise<SuperpowersStoryListItem[]> {
  const catalog = await runtime.listWorktreeCatalog()
  if (catalog.length === 0) {
    return []
  }
  const pendingGates = countPendingGatesByWorktreeId(runtime.getOrchestrationDb())
  const entries: {
    worktree: (typeof catalog)[number]
    scan: BracketStoryScan
    pendingGates: number
    linearIds: string[]
  }[] = []
  for (const worktree of catalog) {
    for (const scan of scanBrackets(worktree.path)) {
      let pendingGatesForStory = 0
      for (const [gateWorktreeId, count] of pendingGates) {
        if (runtimeWorktreeIdsEqual(gateWorktreeId, worktree.id)) {
          pendingGatesForStory += count
        }
      }
      entries.push({
        worktree,
        scan,
        pendingGates: pendingGatesForStory,
        linearIds: scan.parseError ? [] : readStoryLinearIds(worktree.path, scan.storyId)
      })
    }
  }
  // One batched Linear read per request (all stories' ids together); per-id
  // failures degrade to 'unknown' inside the helper — never fails the method.
  const sfStatuses = await readSfStatuses(
    [...new Set(entries.flatMap((entry) => entry.linearIds))],
    opts
  )
  return entries
    .map((entry) => ({
      storyId: entry.scan.storyId,
      title: entry.scan.title,
      epicId: entry.scan.epicId,
      worktreeId: entry.worktree.id,
      workspaceName: entry.worktree.displayName,
      sfTotal: entry.scan.sfTotal,
      sfDone: entry.linearIds.filter((id) => sfStatuses.get(id) === 'done').length,
      pendingGates: entry.pendingGates,
      updatedAt: entry.scan.updatedAt,
      parseError: entry.scan.parseError
    }))
    .sort(
      (a, b) =>
        b.updatedAt - a.updatedAt || (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0)
    )
}

export const SUPERPOWERS_STORY_LIST_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'superpowers.storyList',
    params: null,
    handler: async (_params, { runtime }): Promise<SuperpowersStoryListResult> => ({
      stories: await listStoriesForRuntime(runtime)
    })
  })
]
