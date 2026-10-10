import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { runtimeWorktreeIdsEqual } from '../../runtime-worktree-path-identity'
import type { OrchestrationDb } from '../../orchestration/db'
import { deriveWorktreeIdForGate } from '../../../superpowers/gate-worktree-derivation'
import { parseBracketHeading, parseBracketSfs } from '../../../superpowers/bracket-file-parse'
import { parseWakiiStory } from '../../../superpowers/wakii-story-parse'
import { readSfStatuses } from '../../../superpowers/story-linear-status'
import type {
  SuperpowersStoryListItem,
  SuperpowersStoryListResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Catalog source is PINNED to the runtime resolved-worktree snapshot — do not
// substitute (gate-worktree-derivation.ts header). Malformed story files never
// fail the method: they surface as parseError entries.

export type StoryFileScan = {
  storyId: string // 'mindmaps/<name>.wakii' (canonical) or 'brackets/<name.md>' (legacy) — extension included (spec §3b)
  epicId: string // '' when missing (wakii: meta.epic; bracket: '# Story:' heading)
  title: string
  sfTotal: number
  updatedAt: number // story file mtime, epoch ms
  parseError: boolean
}

export type StoryFileScanner = (worktreePath: string) => StoryFileScan[]

// mindmaps/*.wakii first (canonical VU-14), brackets/*.md as the legacy
// fallback for stories not yet migrated (VI-1 — no forced migration mid-run).
export function scanWorktreeStoryFiles(worktreePath: string): StoryFileScan[] {
  return [...scanWorktreeWakiiStories(worktreePath), ...scanWorktreeBracketStories(worktreePath)]
}

function scanWorktreeWakiiStories(worktreePath: string): StoryFileScan[] {
  const mindmapsDir = join(worktreePath, 'docs', 'superpowers', 'mindmaps')
  let names: string[]
  try {
    names = readdirSync(mindmapsDir)
  } catch {
    return []
  }
  const scans: StoryFileScan[] = []
  for (const name of names.filter((entry) => entry.endsWith('.wakii'))) {
    let updatedAt = 0
    try {
      updatedAt = statSync(join(mindmapsDir, name)).mtimeMs
    } catch {
      // vanished between readdir and stat — keep 0, sort tail
    }
    let text = ''
    try {
      text = readFileSync(join(mindmapsDir, name), 'utf8')
    } catch {
      // unreadable → parsed as broken below (parse-error entry)
    }
    const doc = parseWakiiStory(text)
    const fallbackTitle = name.replace(/\.wakii$/, '')
    if (doc === 'parse-error') {
      scans.push({
        storyId: `mindmaps/${name}`,
        epicId: '',
        title: fallbackTitle,
        sfTotal: 0,
        updatedAt,
        parseError: true
      })
      continue
    }
    // Zero sf nodes mirrors the bracket ruling: an entry that cannot describe
    // a single SF is a parse error, not a story.
    scans.push({
      storyId: `mindmaps/${name}`,
      epicId: doc.epicId,
      title: doc.title,
      sfTotal: doc.sfs.length,
      updatedAt,
      parseError: doc.sfs.length === 0
    })
  }
  return scans
}

function scanWorktreeBracketStories(worktreePath: string): StoryFileScan[] {
  const bracketsDir = join(worktreePath, 'docs', 'superpowers', 'brackets')
  let names: string[]
  try {
    names = readdirSync(bracketsDir)
  } catch {
    return []
  }
  const scans: StoryFileScan[] = []
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

// The SF-1-frozen scanner drops raw text; re-read the story file for linear ids
// in the same pass (spec-critic P0 pin) — no scanner change, no third parser.
function readStoryLinearIds(worktreePath: string, storyId: string): string[] {
  const isWakii = storyId.startsWith('mindmaps/')
  const dir = isWakii ? 'mindmaps' : 'brackets'
  const fileName = storyId.slice(`${dir}/`.length)
  try {
    const text = readFileSync(join(worktreePath, 'docs', 'superpowers', dir, fileName), 'utf8')
    if (isWakii) {
      const doc = parseWakiiStory(text)
      return doc === 'parse-error' ? [] : doc.sfs.flatMap((sf) => (sf.linear ? [sf.linear] : []))
    }
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
  scanStories: StoryFileScanner = scanWorktreeStoryFiles,
  opts?: { now?: () => number }
): Promise<SuperpowersStoryListItem[]> {
  const catalog = await runtime.listWorktreeCatalog()
  if (catalog.length === 0) {
    return []
  }
  const pendingGates = countPendingGatesByWorktreeId(runtime.getOrchestrationDb())
  const entries: {
    worktree: (typeof catalog)[number]
    scan: StoryFileScan
    pendingGates: number
    linearIds: string[]
  }[] = []
  for (const worktree of catalog) {
    for (const scan of scanStories(worktree.path)) {
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

export const SUPERPOWERS_STORY_LIST_METHODS = [
  defineMethod({
    name: 'superpowers.storyList',
    permission: 'workspace',
    params: null,
    handler: async (_params, { runtime }): Promise<SuperpowersStoryListResult> => ({
      stories: await listStoriesForRuntime(runtime)
    })
  })
]
