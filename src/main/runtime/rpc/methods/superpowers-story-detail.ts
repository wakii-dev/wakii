import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { runtimeWorktreeIdsEqual } from '../../runtime-worktree-path-identity'
import { deriveWorktreeIdForGate } from '../../../superpowers/gate-worktree-derivation'
import { parseBracketSfs } from '../../../superpowers/bracket-file-parse'
import { scanWorktreeBracketStories, type BracketStoryScan } from './superpowers-story-list'
import type {
  SuperpowersStoryDetailError,
  SuperpowersStoryDetailResult
} from '../../../../shared/superpowers/story-rpc-contract'

// Reuses Task 6's frozen bracket scanner for enumeration + selection; this
// module only adds the detail projection (sfs/destination) and the gate
// membership rule (spec §3b).

type StoryDetailRuntime = Pick<OrcaRuntimeService, 'listWorktreeCatalog' | 'getOrchestrationDb'>

const DESTINATION_RE = /^Destination:\s*(.+)$/m

function readBracketDestination(text: string): string | null {
  return DESTINATION_RE.exec(text)?.[1]?.trim() ?? null
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
  storyId: string
): Promise<SuperpowersStoryDetailResult | SuperpowersStoryDetailError> {
  const catalog = await runtime.listWorktreeCatalog()
  let match: {
    worktreeId: string
    worktreePath: string
    workspaceName: string
    scan: BracketStoryScan
  } | null = null
  for (const worktree of catalog) {
    for (const scan of scanWorktreeBracketStories(worktree.path)) {
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

  // The scanner discards raw text; re-read the winning bracket for sfs/destination.
  let text = ''
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
  const parsedSfs = match.scan.parseError ? [] : parseBracketSfs(text)
  const sfs = (Array.isArray(parsedSfs) ? parsedSfs : []).map((sf) => ({
    ...sf,
    // Linear status read is SF-2 — SF-1 hardcodes 'unknown'.
    status: 'unknown' as const
  }))

  const story: SuperpowersStoryDetailResult['story'] = {
    storyId: match.scan.storyId,
    title: match.scan.title,
    epicId: match.scan.epicId,
    destination: readBracketDestination(text),
    worktreeId: match.worktreeId,
    workspaceName: match.workspaceName,
    parseError: match.scan.parseError,
    sfs
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

export const SUPERPOWERS_STORY_DETAIL_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'superpowers.storyDetail',
    params: z.object({ storyId: requiredString('Missing storyId') }),
    handler: (params, { runtime }) => resolveStoryDetail(runtime, params.storyId)
  })
]
