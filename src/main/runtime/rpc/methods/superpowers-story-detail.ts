import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SuperpowersStoryDetailParams } from '../../../../shared/rpc-contract/superpowers-params'
import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { runtimeWorktreeIdsEqual } from '../../runtime-worktree-path-identity'
import { deriveWorktreeIdForGate } from '../../../superpowers/gate-worktree-derivation'
import { parseBracketSfs } from '../../../superpowers/bracket-file-parse'
import { parseWakiiStory } from '../../../superpowers/wakii-story-parse'
import { readSfStatuses } from '../../../superpowers/story-linear-status'
import { scanWorktreeStoryFiles, type StoryFileScan } from './superpowers-story-list'
import type {
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Reuses the frozen story-file scanner for enumeration + selection; this
// module only adds the detail projection (sfs/destination/decodeWarnings) and
// the gate membership rule (spec §3b).

type StoryDetailRuntime = Pick<OrcaRuntimeService, 'listWorktreeCatalog' | 'getOrchestrationDb'>

const DESTINATION_RE = /^Destination:\s*(.+)$/m

function readBracketDestination(text: string): string | null {
  return DESTINATION_RE.exec(text)?.[1]?.trim() ?? null
}

// .wakii stories carry sfs/destination/decodeWarnings directly in the document
// (no markdown projection); a vanished/corrupt file degrades like brackets do.
function readWakiiStoryDetail(
  worktreePath: string,
  storyId: string
): {
  sfs: { name: string; title: string; tier: number; what: string; dependsOn: string[]; linear: string | null }[]
  destination: string | null
  decodeWarnings: string[]
} {
  let text = ''
  try {
    text = readFileSync(
      join(worktreePath, 'docs', 'superpowers', 'mindmaps', storyId.slice('mindmaps/'.length)),
      'utf8'
    )
  } catch {
    // vanished between scan and read → empty projection, scan fields survive
  }
  const doc = parseWakiiStory(text)
  if (doc === 'parse-error') {
    return { sfs: [], destination: null, decodeWarnings: [] }
  }
  return {
    sfs: doc.sfs,
    destination: doc.destination,
    decodeWarnings: doc.decodeWarnings
  }
}

// options column is a JSON string; corrupt rows degrade to [] (never crash).
function gateOptionsFromJson(options: string): string[] {
  try {
    const parsed: unknown = JSON.parse(options)
    return Array.isArray(parsed) && parsed.every((option) => typeof option === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

// sqlite datetime('now') is UTC 'YYYY-MM-DD HH:MM:SS'; a bare Date.parse would
// read the space form as local time, so pin the Z suffix.
function gateCreatedAtMs(createdAt: string): number {
  const parsed = Date.parse(`${createdAt.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function resolveStoryDetail(
  runtime: StoryDetailRuntime,
  storyId: string,
  opts?: { now?: () => number }
): Promise<SuperpowersStoryDetailResult | SuperpowersStoryDetailError> {
  const catalog = await runtime.listWorktreeCatalog()
  let match: {
    worktreeId: string
    worktreePath: string
    workspaceName: string
    scan: StoryFileScan
  } | null = null
  for (const worktree of catalog) {
    for (const scan of scanWorktreeStoryFiles(worktree.path)) {
      if (scan.storyId !== storyId) {
        continue
      }
      // Same storyId in several worktrees → newest mtime wins; mtime ties keep
      // catalog order (storyId tie-break is vacuous within one storyId).
      if (!match || scan.updatedAt > match.scan.updatedAt) {
        match = {
          worktreeId: worktree.id,
          worktreePath: worktree.path,
          workspaceName: worktree.displayName,
          scan
        }
      }
    }
  }
  if (!match) {
    return { error: 'story_not_found' }
  }

  // The scanner discards raw text; re-read the winning story file for
  // sfs/destination (+ decodeWarnings from .wakii).
  const isWakii = storyId.startsWith('mindmaps/')
  let text = ''
  if (!isWakii) {
    try {
      text = readFileSync(
        join(
          match.worktreePath,
          'docs',
          'superpowers',
          'brackets',
          storyId.slice('brackets/'.length)
        ),
        'utf8'
      )
    } catch {
      // vanished between scan and read → empty sfs/destination, scan fields survive
    }
  }
  let sfBase: { name: string; title: string; tier: number; what: string; dependsOn: string[]; linear: string | null }[] = []
  let destination: string | null = null
  let decodeWarnings: string[] = []
  if (isWakii) {
    // readWakiiStoryDetail degrades a vanished/corrupt file to the empty projection.
    const wakii = readWakiiStoryDetail(match.worktreePath, storyId)
    sfBase = wakii.sfs
    destination = wakii.destination
    decodeWarnings = wakii.decodeWarnings
  } else {
    const parsedSfs = match.scan.parseError ? [] : parseBracketSfs(text)
    sfBase = Array.isArray(parsedSfs) ? parsedSfs : []
    destination = readBracketDestination(text)
  }
  // One batched read per request; per-id failures degrade to 'unknown' inside
  // the helper, so Linear problems never fail the method.
  const sfStatuses = await readSfStatuses(
    sfBase.flatMap((sf) => (sf.linear ? [sf.linear] : [])),
    opts
  )
  const sfs = sfBase.map((sf) => ({
    ...sf,
    status: sf.linear ? (sfStatuses.get(sf.linear) ?? 'unknown') : 'unknown'
  }))

  const story: SuperpowersStoryDetailResult['story'] = {
    storyId: match.scan.storyId,
    title: match.scan.title,
    epicId: match.scan.epicId,
    destination,
    worktreeId: match.worktreeId,
    workspaceName: match.workspaceName,
    parseError: match.scan.parseError,
    sfs,
    // Optional wire field (remote-wire-compat safe-add): .wakii decode
    // warnings reach the tab so dropped unknown enums stay visible.
    ...(decodeWarnings.length > 0 ? { decodeWarnings } : {})
  }

  const db = runtime.getOrchestrationDb()
  const gates: SuperpowersStoryDetailResult['gates'] = []
  for (const gate of db.listGates()) {
    const gateWorktreeId = deriveWorktreeIdForGate(db, {
      run_id: gate.run_id,
      task_id: gate.task_id
    })
    const storyLinked =
      gateWorktreeId !== null && runtimeWorktreeIdsEqual(gateWorktreeId, match.worktreeId)
    // Include this story's gates plus the null-derived 'khác' group; gates of
    // other worktrees are not this story's business (spec §3b).
    if (!storyLinked && gateWorktreeId !== null) {
      continue
    }
    gates.push({
      gateId: gate.id,
      title: gate.question,
      status: gate.status,
      resolution: gate.resolution,
      options: gateOptionsFromJson(gate.options),
      worktreeId: gateWorktreeId,
      createdAt: gateCreatedAtMs(gate.created_at),
      storyLinked
    })
  }

  return { story, gates }
}

export const SUPERPOWERS_STORY_DETAIL_METHODS = [
  defineMethod({
    name: 'superpowers.storyDetail',
    permission: 'workspace',
    params: SuperpowersStoryDetailParams,
    handler: (params, { runtime }) => resolveStoryDetail(runtime, params.storyId)
  })
]
