// FORK-LOCAL: find the FIRST docs/superpowers that contains brackets/ or
// contexts/ across: focused worktree (via services context) and Orca
// workspace trees (~/orca/workspaces/<project>/<worktree>). Returns the
// superpowers root so fileList/fileRead can join 'brackets'/'contexts'.
import { execFile as execFileCb } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseBracketHeading } from '../superpowers/bracket-file-parse'
import { definePluginMethod } from './plugin-host-method-binding'
import type { PluginHostServices } from './plugin-host-method-bindings'

const execFileAsync = promisify(execFileCb)

async function resolveWorkspaceDocsRoot(services: PluginHostServices): Promise<string | null> {
  // 0. Focused worktree wins: brackets của story sống trong worktree đang mở —
  //    quét global theo mtime có thể chọn nhầm worktree stale khác.
  try {
    const context = await services.resolveActiveWorktreeContext()
    if (context?.path) {
      const docs = join(context.path, 'docs', 'superpowers')
      if ((await stat(join(docs, 'brackets')).catch(() => null))?.isDirectory()) {
        return docs
      }
    }
  } catch {
    /* focused worktree has no superpowers docs — fall through to the scan */
  }
  const candidates: string[] = []
  // 1. Orca workspace trees: ~/orca/workspaces/<proj>/<wt>
  const wsBase = join(homedir(), 'orca', 'workspaces')
  try {
    for (const proj of await readdir(wsBase).catch(() => [] as string[])) {
      const projDir = join(wsBase, proj)
      candidates.push(projDir)
      for (const wt of await readdir(projDir).catch(() => [] as string[])) {
        candidates.push(join(projDir, wt))
      }
    }
  } catch {
    /* ignore */
  }
  // 2. Registered repos via orca CLI (dev-safe: absolute prod binary like plugin)
  try {
    const bin = '/opt/homebrew/bin/orca'
    const { stdout } = await execFileAsync(bin, ['repo', 'list', '--json'], { timeout: 15000 })
    for (const r of JSON.parse(stdout)?.result?.repos ?? []) {
      if (typeof r?.path === 'string') {
        candidates.push(r.path)
      }
    }
  } catch {
    /* ignore */
  }
  // 3. cwd fallback (dev plugin host runs from repo)
  candidates.push(process.cwd())

  // Prefer a root whose brackets dir is the most recently modified
  let best: { root: string; mtime: number } | null = null
  for (const c of candidates) {
    const docs = join(c, 'docs', 'superpowers')
    try {
      const st = await stat(join(docs, 'brackets'))
      if (st.isDirectory() && (!best || st.mtimeMs > best.mtime)) {
        best = { root: docs, mtime: st.mtimeMs }
      }
    } catch {
      /* no brackets here */
    }
  }
  return best?.root ?? null
}

export const pluginHostWorkspaceDocsMethodBindings = [
  definePluginMethod('workspace.planProgress', async () => {
    const progress: Record<
      string,
      { plan: string; done: number; total: number; pct: number; est?: boolean }
    > = {}
    const wsBase = join(homedir(), 'orca', 'workspaces')
    let projects: string[] = []
    try {
      projects = await readdir(wsBase)
    } catch {
      return { progress }
    }
    for (const proj of projects) {
      const projDir = join(wsBase, proj)
      let wts: string[] = []
      try {
        wts = await readdir(projDir)
      } catch {
        continue
      }
      for (const wt of wts) {
        if (!wt.startsWith('sf-')) {
          continue
        }
        const wtPath = join(projDir, wt)
        const plansDir = join(wtPath, 'docs', 'superpowers', 'plans')
        let ents: string[] = []
        try {
          ents = await readdir(plansDir)
        } catch {
          continue
        }
        // plan mới nhất khớp sf-<n>
        const n = (wt.match(/^sf-(\d+)/) || [])[1]
        if (!n) {
          continue
        }
        const matching = ents.filter((f) => f.endsWith('.md') && f.includes(`-sf${n}-`)).sort()
        if (!matching.length) {
          continue
        }
        const f = matching.at(-1)
        if (!f) {
          continue
        }
        const text = await readFile(join(plansDir, f), 'utf8').catch(() => '')
        const done = (text.match(/- \[x\]/g) || []).length
        const todo = (text.match(/- \[ \]/g) || []).length
        if (done + todo === 0) {
          continue
        }
        let eff = done
        let est = false
        if (done === 0 && todo > 0) {
          // commit-based estimate (execFile is sync-free: use execFileAsync below)
          try {
            const { promisify } = await import('node:util')
            const efA = promisify(execFileCb)
            const { stdout } = await efA(
              'git',
              ['-C', wtPath, 'rev-list', '--count', 'HEAD', '--not', '--glob=refs/heads/story/*'],
              { timeout: 5000 }
            ).catch(() => ({ stdout: '0' }))
            const commits = Number.parseInt((stdout || '0').trim(), 10)
            eff = Math.min(commits, todo)
            est = eff > 0
          } catch {
            eff = 0
          }
        }
        progress[wt] = {
          plan: f as string,
          done: eff,
          total: done + todo,
          pct: Math.round((eff / (done + todo)) * 100),
          est
        }
      }
    }
    return { progress }
  }),

  definePluginMethod('workspace.fileList', async (params, { services }) => {
    const { dir } = params as { dir: 'brackets' | 'contexts' }
    const root = await resolveWorkspaceDocsRoot(services)
    if (!root) {
      return { files: [] }
    }
    const target = join(root, dir)
    let entries: string[] = []
    try {
      entries = await readdir(target)
    } catch {
      return { files: [] }
    }
    const files = await Promise.all(
      entries
        .filter((f) => f.endsWith('.md'))
        .map(async (f) => {
          const st = await stat(join(target, f)).catch(() => null)
          const text = await readFile(join(target, f), 'utf8').catch(() => '')
          const heading = parseBracketHeading(text, f)
          return {
            name: f,
            linear: heading.epicId,
            title: heading.title.slice(0, 80),
            mtime: st?.mtimeMs ?? 0
          }
        })
    )
    files.sort((a, b) => b.mtime - a.mtime)
    return { files: files.slice(0, 200) }
  }),

  definePluginMethod('workspace.fileRead', async (params, { services }) => {
    const { dir, name } = params as { dir: 'brackets' | 'contexts'; name: string }
    if (name.includes('..') || name.includes('/')) {
      throw new Error('invalid file name')
    }
    const root = await resolveWorkspaceDocsRoot(services)
    if (!root) {
      throw new Error('no workspace root')
    }
    const content = await readFile(join(root, dir, name), 'utf8')
    return { content: content.slice(0, 256 * 1024) }
  })
]
