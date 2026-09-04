// Orca Superpowers Launcher — plugin worker entry (pluginApi 1).
//
// Runs inside the out-of-process plugin worker (plain Node, no Electron).
// The default export receives the `orca` API: command registration + the
// capability-gated host API.
//
// IMPORTANT (v1.3): the panel→worker bridge is a CLOSED transport. Only three
// host actions are reachable from a sandboxed panel iframe (see Orca's
// plugin-host-api.js PANEL_ACTIONS list): workspace.readContext, terminal.sendText,
// notifications.show. There is NO route to plugin-registered commands. So the
// panel can only ever *type a string into a terminal*. We lean into that:
// every panel button composes a prompt and sends it via terminal.sendText —
// the agent in that terminal does the real work (renders progress, resolves
// gates, runs the skill). No CLI spawn, no snapshot, no DAG rendering here.
//
// POLICY MOVED TO SKILL.md (v1.3):
//   - COMMENT_AUDIT  → orca-superpowers-workflow SKILL.md Principle 7 (default ON; opt-out via "audit-log: off" token)
//   - FIGMA          → SKILL.md Principle 8 (auto-triggers when description has figma.com URL)
//   - AUTONOMOUS self-review → SKILL.md Principle 3
// Prompt now carries only: idea + short mode flags + audit opt-out token.
// Directives.json keeps the OPT-IN ones (polish/simplify/plan-only/quick-fix/subagent)
// + the compact audit-off / autonomous-on tokens.

import directives from './directives.json' with { type: 'json' }
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { accessSync, readFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const execFileAsync = promisify(execFileCb)

// Resolve the PRODUCTION orca binary explicitly. Why: when running inside the
// dev app's plugin worker, PATH puts the DEV wrapper script first
// (~/Documents/orca/out/bin/orca) which breaks outside its module context
// ("Cannot find module ..."). The production binary is self-contained.
function orcaBin() {
  const candidates = [
    '/opt/homebrew/bin/orca',
    '/usr/local/bin/orca',
    '/Applications/Orca.app/Contents/Resources/bin/orca'
  ]
  for (const c of candidates) {
    try { accessSync(c); return c } catch { continue }
  }
  return 'orca' // fallback to PATH (production app context)
}


const SKILL = 'orca-superpowers-workflow'
const {
  LOAD_CONTEXT,
  STORY_DIRECTIVE,
  POLISH_DIRECTIVE,
  SIMPLIFY_DIRECTIVE,
  PLAN_ONLY_DIRECTIVE,
  QUICK_FIX_DIRECTIVE,
  SUBAGENT_DIRECTIVE,
  AUDIT_OFF_TOKEN,
  AUTONOMOUS_TOKEN,
  EXECUTE_INLINE_TOKEN,
  EXECUTE_DELEGATE_TOKEN,
  EXECUTE_SUPERPOWERS_TOKEN
} = directives

function executeToken(mode) {
  if (mode === 'inline') return EXECUTE_INLINE_TOKEN
  if (mode === 'superpowers') return EXECUTE_SUPERPOWERS_TOKEN
  if (mode === 'delegate') return EXECUTE_DELEGATE_TOKEN  // default select value; still emits to reinforce skill-default Orca preference
  return ''  // unknown/undefined mode → no override, skill uses its default
}

function buildStartPrompt(idea, autonomous, polish, subagents, simplify, auditOn, executeMode, story, mindsetBrowser) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE)
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (subagents && subagents > 1) out += SUBAGENT_DIRECTIVE.replace(/<n>/g, String(subagents))
  if (autonomous) out += AUTONOMOUS_TOKEN
  if (auditOn === false) out += AUDIT_OFF_TOKEN  // default ON in skill; only flag when off
  if (mindsetBrowser !== false) out += '\nMindset 0: BROWSER LÀM VIỆC — TRƯỚC khi nói "xong": TÔI mở browser (orca tab create), TÔI đi trọn flow, TÔI chụp screenshot. CLI chỉ cho git/tests/servers. DOM query KHÔNG thay thế screenshot. Screenshot fail → nói thật + nhờ user.'
  if (story) out += STORY_DIRECTIVE
  out += executeToken(executeMode)
  return out
}

function buildPlanPrompt(idea, autonomous, polish, simplify, auditOn, executeMode, story) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE) + PLAN_ONLY_DIRECTIVE
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (autonomous) out += AUTONOMOUS_TOKEN
  if (auditOn === false) out += AUDIT_OFF_TOKEN
  if (story) out += STORY_DIRECTIVE
  out += executeToken(executeMode)
  return out
}

function buildQuickFixPrompt(idea, autonomous, polish, subagents, simplify, executeMode) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  // Quick fix skips Linear (no issue) → audit-log N/A (skill Principle 7 already exempts it).
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE) + QUICK_FIX_DIRECTIVE
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (subagents && subagents > 1) out += SUBAGENT_DIRECTIVE.replace(/<n>/g, String(subagents))
  if (autonomous) out += AUTONOMOUS_TOKEN
  // Quick-fix tasks are trivial (≤1 file, ≤10 lines) → worker-start overhead rarely worth it; default to inline regardless of executeMode, but honor explicit delegate.
  if (executeMode === 'delegate') out += EXECUTE_DELEGATE_TOKEN
  return out
}

function buildContinuePlanPrompt(planPath, autonomous, executeMode) {
  let out = `${LOAD_CONTEXT}Then: read the plan at ${planPath} and continue the ${SKILL} workflow from there — Phase 3 plan-writing was done, proceed to Phase 4 (execute) and beyond. If the plan file does not exist or is incomplete, tell me before doing anything.`
  if (autonomous) out += AUTONOMOUS_TOKEN
  out += executeToken(executeMode)
  return out
}

function buildContinueOrNewPrompt(autonomous, executeMode) {
  let out = `${LOAD_CONTEXT}Then: AUTO-LOAD the plan for the active run if one exists — find the plan matching the current Linear issue (in docs/superpowers/plans/<date>-<feature>-plan.md, or read from the Linear issue body), continue the ${SKILL} workflow from Phase 4 (execute). If NO plan exists yet OR there is no active run, ask me to describe a new feature and wait — do NOT start any work.`
  if (autonomous) out += AUTONOMOUS_TOKEN
  out += executeToken(executeMode)
  return out
}

function buildResumePrompt(hint) {
  const t = typeof hint === 'string' ? hint.trim() : ''
  return `${LOAD_CONTEXT}Then: Continue the ${SKILL} workflow${t ? `: ${t}` : ''}`
}

function buildStatusPrompt() {
  return `${LOAD_CONTEXT}Then: summarize the current ${SKILL} workflow state — active phase, task progress, and any pending gates.`
}

function buildGatePrompt(gateId, resolution) {
  return `${LOAD_CONTEXT}Then: Resolve gate ${gateId} as ${resolution} via: orca orchestration gate-resolve --id ${gateId} --resolution ${resolution}. Confirm the gate still exists and is pending first; if already resolved or missing, tell me.`
}


// Linear GraphQL helper (fallback khi orca CLI keychain chết — 28/8):
// /api/linear.app + key ~/.claude/.linear-key. Trả children + state đầy đủ.
async function linGqlChildren(epic) {
  try {
    let key = process.env.LINEAR_API_KEY || ''
    if (!key) { try { key = (await readFile(join(process.env.HOME || '', '.claude', '.linear-key'), 'utf8')).split('\n')[0].trim() } catch { key = '' } }
    if (!key) return null
    const r = await fetch('https://api.linear.app/graphql', {
      method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query{issue(id:"${epic}"){url title children(first:20){nodes{identifier title url state{name type color}}}}}` })
    })
    const d = (await r.json())?.data?.issue
    if (!d) return null
    return (d.children.nodes || []).map(c => ({
      identifier: c.identifier, title: c.title, url: c.url,
      stateName: c.state?.name ?? null, stateType: c.state?.type ?? null, stateColor: c.state?.color ?? null,
      state: c.state ? { name: c.state.name, type: c.state.type, color: c.state.color } : null,
      description: ''
    }))
  } catch { return null }
}
async function linearChildrenFull(epic) {
  // orca CLI trước (đủ thông tin hơn), GraphQL fallback
  try {
    const { stdout } = await execFileAsync(orcaBin(), ['linear', 'issue', epic, '--full', '--json'],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
    const parsed = JSON.parse(stdout)
    if (parsed?.ok) {
      const r = parsed.result || {}
      return { children: (r.children || []).map(c => ({
        identifier: c.identifier, title: c.title, url: c.url,
        stateName: c.state?.name ?? null, stateType: c.state?.type ?? null, stateColor: c.state?.color ?? null, description: c.description ?? ''
      })), url: r.issue?.url ?? null }
    }
  } catch {}
  const ch = await linGqlChildren(epic)
  if (ch) return { children: ch, url: null }
  return { children: [], url: null }
}

// Send `text` to the first terminal of the focused worktree. Returns a
// structured result so panel + worker callers can branch on failure.
async function sendToTerminal(orca, text, { terminalId } = {}) {
  const ctx = await orca.host.call('workspace.readContext', {})
  if (!ctx || !ctx.terminals || ctx.terminals.length === 0) {
    await orca.host.call('notifications.show', {
      title: 'Superpowers',
      body: 'No terminal in the focused worktree. Open a terminal first.'
    })
    return { ok: false, reason: 'no-terminal' }
  }
  const target = terminalId || ctx.terminals[0].id
  // Runtime byte-budget guard: Orca terminal.sendText rejects > 4096 bytes with
  // invalid_params. Panel guards the idea via maxLength + sendPrompt byte-count,
  // but command-palette route bypasses the panel — guard here too (defense-in-depth).
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > 4096) {
    await orca.host.call('notifications.show', {
      title: 'Superpowers',
      body: `Prompt ${bytes}B exceeds the 4096-byte sendText limit. Shorten the idea or uncheck mode directives.`
    })
    return { ok: false, reason: 'over-quota', bytes }
  }
  const sent = await orca.host.call('terminal.sendText', { terminalId: target, text, enter: true })
  if (!sent || sent.accepted !== true) {
    await orca.host.call('notifications.show', {
      title: 'Superpowers',
      body: 'Could not send the prompt to the terminal.'
    })
    return { ok: false, reason: 'send-failed', terminalId: target }
  }
  return { ok: true, terminalId: target, text }
}

// ---- Story sources -------------------------------------------------------
// Stories live as bracket files under docs/superpowers/brackets/*.md.
// Fallback source: issues-with-children from Linear (no bracket file yet).

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

async function worktreeRoot(orca) {
  try {
    const ctx = await orca.host.call('workspace.readContext', {})
    if (!ctx?.value?.displayName) return null
    return ctx.value
  } catch { return null }
}

// Parse one bracket file → { linear, title, sfs:[] }
function parseBracketFile(text, file) {
  const lines = text.split('\n')
  let linear = null, title = basename(file).replace(/\.md$/, '')
  const hm = text.match(/^#\s+Story:\s*([A-Z]+-\d+)\s*[—–-]\s*(.+)$/m)
  if (hm) { linear = hm[1]; title = hm[2].trim() }
  return { linear, title: title.slice(0, 60), file }
}

// Resolve the FOCUSED worktree's filesystem path.
// Why not process.cwd(): plugin workers fork with the Orca app's cwd, not the
// worktree's — scanning from cwd always finds nothing.
// Chain: workspace.readContext (focused worktree id) → orca worktree show (path).
async function focusedWorktreePath() {
  try {
    const { stdout } = await execFileAsync(orcaBin(), ['worktree', 'current', '--json'],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024 })
    const parsed = JSON.parse(stdout)
    if (parsed?.ok) {
      const wt = parsed.result?.worktree ?? parsed.result
      if (typeof wt?.path === 'string' && wt.path) return wt.path
    }
  } catch { /* fall through to env */ }
  // Fallback: env var Orca injects for the focused worktree (if any)
  return process.env.ORCA_ACTIVE_WORKTREE_PATH || null
}

// All candidate roots: focused worktree first, then every registered repo's
// workspace tree (Orca nests worktrees under repo base paths). Deduped.
async function storyScanRoots() {
  const roots = new Set()
  const focused = await focusedWorktreePath()
  if (focused) roots.add(focused)
  try {
    const { stdout } = await execFileAsync(orcaBin(), ['repo', 'list', '--json'],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024 })
    const parsed = JSON.parse(stdout)
    for (const r of parsed?.result?.repos ?? []) {
      if (typeof r?.path === 'string' && r.path) roots.add(r.path)
    }
  } catch { /* repo list unavailable */ }
  // Orca's default workspace base: worktrees of registered repos nest here
  // (including unregistered manual ones). Add project dirs AND their worktree
  // children (brackets live at wsBase/<project>/<worktree>/docs/...).
  const wsBase = join(process.env.HOME || '', 'orca', 'workspaces')
  try {
    for (const proj of await readdir(wsBase, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue
      const projDir = join(wsBase, proj.name)
      roots.add(projDir)
      try {
        for (const wt of await readdir(projDir, { withFileTypes: true })) {
          if (wt.isDirectory() && !wt.name.startsWith('.')) roots.add(join(projDir, wt.name))
        }
      } catch { /* unreadable */ }
    }
  } catch { /* no workspaces dir */ }
  return [...roots]
}

// story.list — every bracket file in the FOCUSED WORKTREE + which is "current"
// (current = the focused worktree's linked Linear issue matches a bracket).
async function listStories(orca) {
  try {
    const root = await focusedWorktreePath() // may be null — roots fallback below
    let stories = []
    if (root) {
      const dir = join(root, 'docs', 'superpowers', 'brackets')
      let entries = []
      try { entries = await readdir(dir) } catch { /* no brackets dir here */ }
      stories = (await Promise.all(entries.filter(f => f.endsWith('.md')).map(async f => {
        const text = await readFile(join(dir, f), 'utf8').catch(() => '')
        return parseBracketFile(text, f)
      }))).filter(st => st.linear)
    }
    // Scan ALL roots (registered repos + workspace trees) for brackets
    for (const r of await storyScanRoots()) {
      if (r === root) continue
      const d2 = join(r, 'docs', 'superpowers', 'brackets')
      let ents2 = []
      try { ents2 = await readdir(d2) } catch { continue }
      const more = (await Promise.all(ents2.filter(f => f.endsWith('.md')).map(async f => {
        const text = await readFile(join(d2, f), 'utf8').catch(() => '')
        return parseBracketFile(text, f)
      }))).filter(st => st.linear && !stories.some(x => x.linear === st.linear))
      stories = stories.concat(more)
    }
    stories.sort((a, b) => a.file.localeCompare(b.file))
    if (!stories.length) {
      await orca.host.call('storage.set', {
        key: 'story.list',
        value: { stories: [], currentLinear: null, currentFile: null,
                 error: 'no bracket files found in any workspace',
                 root, fetchedAt: new Date().toISOString() }
      })
      return { ok: true, count: 0, root }
    }
    // current story: linked issue of focused worktree (run inside the worktree root)
    let currentLinear = null
    try {
      const { stdout } = await execFileAsync(orcaBin(), ['linear', 'issue', '--current', '--json'],
        { timeout: 15000, maxBuffer: 4 * 1024 * 1024, cwd: root })
      const parsed = JSON.parse(stdout)
      if (parsed?.ok) currentLinear = parsed.result?.issue?.identifier ?? null
    } catch { /* no linked issue */ }
    const list = {
      stories,
      currentLinear,
      currentFile: (stories.find(st => st.linear === currentLinear) || {}).file ?? null,
      root,
      fetchedAt: new Date().toISOString()
    }
    await orca.host.call('storage.set', { key: 'story.list', value: list })
    return { ok: true, count: stories.length, currentLinear, root }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story list failed: ' + message)
    return { ok: false, error: message }
  }
}

// Load a story from a BRACKET FILE directly (autocomplete picks this path).
// The file IS the structure; Linear only enriches states. Searches all scan roots.
async function loadFromBracketFile(orca, fileName) {
  try {
    let full = null
    for (const r of await storyScanRoots()) {
      const cand = join(r, 'docs', 'superpowers', 'brackets', fileName)
      try { await readFile(cand, 'utf8'); full = cand; break } catch { continue }
    }
    if (!full) return { ok: false, error: 'bracket file not found: ' + fileName }
    const text = await readFile(full, 'utf8')
    const hm = text.match(/^#\s+Story:\s*([A-Za-z]+-\d+)\s*[—–-]\s*(.+)$/m)
    if (!hm) return { ok: false, error: 'bracket file malformed (no Story header)' }
    const epicId = hm[1]
    const storyTitle = hm[2].trim()
    // Fetch epic + children states from Linear
    let children = []
    let storyUrl = null
    try {
      const lf = await linearChildrenFull(epicId)
      children = lf.children || []
      storyUrl = lf.url
    } catch (linErr) {
      orca.log('linear fetch in load-by-file failed: ' + (linErr instanceof Error ? linErr.message : String(linErr)))
    }
    const snapshot = {
      story: { id: null, identifier: epicId, title: storyTitle, url: storyUrl },
      children,
      planMarkdown: text,
      bracketFile: fileName,
      fetchedAt: new Date().toISOString()
    }
    await orca.host.call('storage.set', { key: 'story.snapshot', value: snapshot })
    orca.log('story snapshot (file): ' + epicId + ' · ' + children.length + ' children')
    return { ok: true, identifier: epicId, children: children.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story load-by-file failed: ' + message)
    return { ok: false, error: message }
  }
}

// Story Load: read the active worktree's linked Linear issue (+children full),
// persist a snapshot for the panel's bracket view. Vertical-bracket data source.
async function loadStorySnapshot(orca, args) {
  try {
    // Arg precedence: explicit bracket FILE > issue ID > focused worktree
    const wantFile = typeof args?.file === 'string' && args.file.endsWith('.md') ? args.file : null
    if (wantFile) return loadFromBracketFile(orca, wantFile)
    const wantIssue = typeof args?.issue === 'string' && /^[A-Za-z]+-\d+$/.test(args.issue) ? args.issue : null
    const baseArgs = wantIssue
      ? ['linear', 'issue', wantIssue, '--full', '--json']
      : ['linear', 'issue', '--current', '--full', '--json']
    const cwdOpts = wantIssue ? {} : { cwd: (await focusedWorktreePath()) || undefined }
    const { stdout } = await execFileAsync(orcaBin(), baseArgs,
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024, ...cwdOpts })
    const parsed = JSON.parse(stdout)
    if (!parsed?.ok) throw new Error(parsed?.error || 'orca linear issue failed')
    const r = parsed.result || {}
    const issue = r.issue || {}
    const children = (r.children || []).map(c => ({
      id: c.id,
      identifier: c.identifier,
      title: c.title,
      url: c.url,
      stateName: c.state?.name ?? null,
      stateType: c.state?.type ?? null,
      stateColor: c.state?.color ?? null,
      description: c.description ?? ''
    }))
    // Plan markdown: parent issue first, else first child with a plan header
    const planFrom = [issue, ...(r.children || [])].find(x =>
      typeof x?.description === 'string' && /^#.*Task|SF-\d/m.test(x.description))
    const snapshot = {
      story: { id: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url },
      children,
      planMarkdown: planFrom?.description ?? '',
      fetchedAt: new Date().toISOString()
    }
    await orca.host.call('storage.set', { key: 'story.snapshot', value: snapshot })
    orca.log(`story snapshot: ${issue.identifier} · ${children.length} children`)
    return { ok: true, identifier: issue.identifier, children: children.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story load failed: ' + message)
    return { ok: false, error: message }
  }
}

// ---- Story Ops (kit CLIs): stall-check + DoD verify, panel-actioned --------
// Panel không chạy lệnh được (closed transport) — worker chạy hộ qua request
// key story.ops.request (pattern giống story.request). CLIs từ story-team-kit:
// ~/.claude/bin/story-resume --check  → "sf|verdict|detail" mỗi dòng
// ~/.claude/bin/story-verify --json   → [{sf, verdict, steps{5}, detail}]

const KIT_BIN = join(process.env.HOME || '', '.claude', 'bin')

async function runKit(bin, args) {
  try {
    const { stdout } = await execFileAsync(join(KIT_BIN, bin), args,
      { timeout: 90000, maxBuffer: 2 * 1024 * 1024 })
    return { ok: true, stdout }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function collectStoryOps(orca) {
  try {
    const out = { sfs: [], fetchedAt: new Date().toISOString() }
    const chk = await runKit('story-resume', ['--check'])
    if (chk.ok) {
      for (const line of chk.stdout.split('\n')) {
        const parts = line.split('|')
        if (parts.length >= 2 && parts[0].trim().startsWith('sf-')) {
          const sf = parts[0].trim()
          // repo: scan workspaces tìm worktree sf-* (cho heartbeat path)
          let repo = ''
          try { for (const r of await readdir(join(process.env.HOME || '', 'orca', 'workspaces'))) {
            try { await readFile(join(process.env.HOME || '', 'orca', 'workspaces', r, sf, '.git'), 'utf8'); repo = r; break } catch {}
          } } catch {}
          out.sfs.push({ sf, repo, verdict: parts[1].trim(), stallDetail: parts.slice(2).join('|').trim() })
        }
      }
    } else {
      out.error = 'story-resume: ' + chk.error
    }
    const ver = await runKit('story-verify', ['--json'])
    if (ver.ok) {
      try {
        for (const v of JSON.parse(ver.stdout)) {
          let row = out.sfs.find(s => s.sf === v.sf)
          if (!row) { row = { sf: v.sf }; out.sfs.push(row) }
          row.dod = v.verdict
          row.steps = v.steps || null
          row.detail = v.detail || ''
        }
      } catch { out.errorVerify = 'verify JSON parse failed' }
    } else {
      out.errorVerify = 'story-verify: ' + ver.error
    }
    // ── GAP queue: REQUIREMENT-GAP chưa có GAP-ANSWER trên mọi epic đang chạy
    out.gaps = []
    try {
      const keyFile = join(process.env.HOME || '', '.claude', '.linear-key')
      let key = process.env.LINEAR_API_KEY || ''
      if (!key) { try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch {} }
      if (key) {
        for (const r of await storyScanRoots()) {
          let ents = []
          try { ents = await readdir(join(r, 'docs', 'superpowers', 'brackets')) } catch { continue }
          for (const f of ents.filter(x => x.endsWith('.md'))) {
            let text = ''
            try { text = await readFile(join(r, 'docs', 'superpowers', 'brackets', f), 'utf8') } catch { continue }
            const hm = text.match(/^# Story:\s*([A-Za-z]+-\d+)/m)
            if (!hm) continue
            const epic = hm[1]
            const gq = `query{issue(id:"${epic}"){state{name} title comments(first:50){nodes{body createdAt}} children(first:20){nodes{state{name}}}}}`
            const rr = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gq }) })
            const jj = await rr.json()
            const iss = jj?.data?.issue
            if (!iss || iss.state?.name === 'Done') continue
            const ch = iss.children?.nodes || []
            if (ch.length && ch.every(c => c.state?.name === 'Done')) {
              out.complete.push({ epic, title: (iss.title || f).slice(0, 40) })
            }
            const cs = iss.comments?.nodes || []
            const answered = cs.some(c => /^\s*GAP-ANSWER/m.test(c.body || ''))
            for (const c of cs) {
              const b = c.body || ''
              const gm = b.match(/REQUIREMENT-GAP[:：][^\n]{0,160}/)
              if (gm && !answered) out.gaps.push({ epic, file: f.replace('.md',''), snippet: gm[0].slice(0, 140), at: c.createdAt })
            }
          }
        }
      }
    } catch { /* gap queue optional */ }
    out.complete = []  // phát hiện trong bracket loop bên dưới (children all Done)

    // heartbeat: commit cuối + dirty per SF (worktree git — kiểu story-top)
    for (const row of out.sfs) {
      try {
        const wt = join(process.env.HOME || '', 'orca', 'workspaces', row.repo || '', row.sf)
        const { execFile: ef } = await import('node:child_process')
        const { promisify: pf } = await import('node:util')
        const efa = pf(ef)
        const gl = await efa('git', ['-C', wt, 'log', '-1', '--format=%ct|%s'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
        const [cts, ...rest] = (gl.stdout || '').split('|')
        if (cts) {
          row.commitAge = Math.round((Date.now() / 1000) - Number(cts))
          row.commitSubj = rest.join('|').slice(0, 40)
        }
        const gs = await efa('git', ['-C', wt, 'status', '--short'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
        row.dirty = (gs.stdout || '').split('\n').filter(l => l.trim() && !l.includes('.agent-session')).length
      } catch { /* heartbeat optional */ }
    }
    await orca.host.call('storage.set', { key: 'story.ops', value: out })
    return { ok: true, sfs: out.sfs.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story ops failed: ' + message)
    return { ok: false, error: message }
  }
}

// GAP-ANSWER: user trả lời REQUIREMENT-GAP ngay từ panel — worker post
// comment lên EPIC qua GraphQL (keychain độc lập, mọi SF thấy đáp án).
async function postGapAnswer(epic, text) {
  try {
    const keyFile = join(process.env.HOME || '', '.claude', '.linear-key')
    let key = process.env.LINEAR_API_KEY || ''
    if (!key) {
      try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch { key = '' }
    }
    if (!key) return { ok: false, error: 'không có Linear key (~/.claude/.linear-key)' }
    const iss = await (async () => {
      const b = JSON.stringify({ query: `query{issue(id:"${epic}"){id}}` })
      const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: b })
      return (await r.json()).data?.issue?.id || null
    })()
    if (!iss) return { ok: false, error: 'epic không tìm thấy: ' + epic }
    const body = JSON.stringify({ query: `mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}`,
      variables: { i: { issueId: iss, body: `GAP-ANSWER (từ panel): ${text}` } } })
    const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body })
    const j = await r.json()
    const okFlag = j?.data?.commentCreate?.success === true
    return { ok: okFlag, stdout: okFlag ? `Đã post GAP-ANSWER lên ${epic}` : JSON.stringify(j).slice(0, 300) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// CLOSE story: epic → Done + audit STORY-COMPLETE (panel button)
async function postCloseStory(epic) {
  try {
    const keyFile = join(process.env.HOME || '', '.claude', '.linear-key')
    let key = process.env.LINEAR_API_KEY || ''
    if (!key) { try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch { key = '' } }
    if (!key) return { ok: false, error: 'không có Linear key' }
    const iss = await (async () => {
      const r = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `query{issue(id:"${epic}"){id team{states{nodes{id name}}}}}` }) })
      return (await r.json()).data?.issue
    })()
    if (!iss) return { ok: false, error: 'epic không tìm thấy: ' + epic }
    const done = iss.team?.states?.nodes?.find(x => x.name === 'Done')
    if (!done) return { ok: false, error: 'không tìm state Done' }
    const r1 = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation($id:String!,$u:IssueUpdateInput!){issueUpdate(id:$id,input:$u){success}}', variables: { id: iss.id, u: { stateId: done.id } } }) })
    const ok1 = (await r1.json())?.data?.issueUpdate?.success === true
    const r2 = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}', variables: { i: { issueId: iss.id, body: `**STORY-COMPLETE** — đóng từ panel. Code trên nhánh đích; merge main là việc USER.` } } }) })
    const ok2 = (await r2.json())?.data?.commentCreate?.success === true
    return { ok: ok1 && ok2, stdout: `epic ${epic} → Done + audit ${ok2 ? '✓' : '✗'}` }
  } catch (err) { return { ok: false, error: err.message } }
}

// ---- Kit self-install (bundle built-in Wakii) ----
// sync-kit.sh vendor story-team-kit vào kit/ cạnh main.mjs. Khi worker kích
// hoạt, chép skills/agents/bin vào ~/.claude/ — build Wakii xong là full chức
// năng, không cần chạy install.sh tay. Idempotent: skip khi đúng version đã
// cài (marker file). Chỉ đụng thư mục kit sở hữu — skill/CLI của người dùng
// ngoài kit KHÔNG bị đè.
function installKit(orca) {
  try {
    const kitRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'kit')
    const manifestPath = join(kitRoot, 'kit.json')
    if (!existsSync(manifestPath)) return // không bundle kit — bỏ qua (plugin chạy riêng vẫn OK)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const claude = join(process.env.HOME || '', '.claude')
    const marker = join(claude, '.story-team-kit-version')
    if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === String(manifest.version)) return
    for (const name of ['skills', 'agents', 'bin']) {
      const src = join(kitRoot, name)
      if (!existsSync(src)) continue
      const dst = join(claude, name)
      mkdirSync(dst, { recursive: true })
      for (const ent of readdirSync(src, { withFileTypes: true })) {
        const from = join(src, ent.name), to = join(dst, ent.name)
        rmSync(to, { recursive: true, force: true })
        cpSync(from, to, { recursive: true })
        if (name === 'bin') {
          try { chmodSync(to, 0o755) } catch { /* non-fatal */ }
        }
      }
    }
    mkdirSync(claude, { recursive: true })
    writeFileSync(marker, String(manifest.version))
    orca.log('story-team-kit self-installed: v' + manifest.version)
  } catch (err) {
    try { orca.log('kit self-install failed (plugin vẫn chạy): ' + err.message) } catch { /* silent */ }
  }
}

export default function activate(orca) {
  installKit(orca)
  // Story-request poll: panel writes story.request {linear} (fork: panel can
  // storage.set) → worker finds the bracket file with that linear ID and loads it.
  let lastReqAt = 0
  // process any pending request immediately at spawn (worker may be cold)
  const processRequest = async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'story.request' })
      const req = stored?.value
      if (req && typeof req.linear === 'string' && req.at && req.at !== lastReqAt) {
        lastReqAt = req.at
        if (typeof req.file === 'string' && req.file.endsWith('.md')) {
          await loadFromBracketFile(orca, req.file)
          return true
        }
        for (const r of await storyScanRoots()) {
          const d = join(r, 'docs', 'superpowers', 'brackets')
          let ents = []
          try { ents = await readdir(d) } catch { continue }
          for (const f of ents.filter(x => x.endsWith('.md'))) {
            const text = await readFile(join(d, f), 'utf8').catch(() => '')
            const hm = text.match(/^#\s+Story:\s*([A-Za-z]+-\d+)\s/m)
            if (hm && hm[1] === req.linear) {
              await loadFromBracketFile(orca, f)
              return true
            }
          }
        }
        orca.log('story request unmatched: ' + req.linear)
      }
    } catch { /* silent */ }
    return false
  }
  void processRequest()
  const reqTimer = setInterval(() => { void processRequest() }, 3000)
  reqTimer.unref?.()
  orca.commands.register('superpowers.start', async (args) => {
    const idea = args && (args.idea || args.text || '')
    const res = await sendToTerminal(orca, buildStartPrompt(idea, args?.autonomous, args?.polish, args?.subagents, args?.simplify, args?.auditLog, args?.executeMode, args?.story, args?.mindsetBrowser))
    if (res.ok) orca.log(`superpowers.start → terminal ${res.terminalId}: ${res.text}`)
    return res
  })

  orca.commands.register('superpowers.storyLoad', async (args) => loadStorySnapshot(orca, args))

  orca.commands.register('superpowers.storyList', async () => listStories(orca))

  // story.states — children states THEO EPIC (bất kể snapshot nào): panel gọi
  // khi load bracket để có state màu + children đúng story, không phụ thuộc snapshot cũ.
  orca.commands.register('superpowers.storyStates', async (args) => {
    try {
      const epic = typeof args?.epic === 'string' && /^[A-Za-z]+-\d+$/.test(args.epic) ? args.epic : null
      if (!epic) return { ok: false, error: 'epic required (FI-169)' }
      const r = await linearChildrenFull(epic)
      const children = (r.children || [])
        .filter(c => c.state?.type !== 'canceled' && c.state?.type !== 'duplicate')
        .map(c => ({
          identifier: c.identifier, title: c.title, url: c.url,
          stateName: c.state?.name ?? null, stateType: c.state?.type ?? null, stateColor: c.state?.color ?? null
        }))
      const out = { epic, children, fetchedAt: new Date().toISOString() }
      await orca.host.call('storage.set', { key: 'story.states.' + epic, value: out })
      return { ok: true, children: children.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      orca.log('story states failed: ' + message)
      return { ok: false, error: message }
    }
  })

  // story.tasks — agent activity: terminal titles (đang làm gì) + plan checkbox
  // progress (đã làm bao nhiêu %) per SF worktree. Panel bracket hiển thị.
  const collectStoryTasks = async () => {
    try {
      const out = { agents: [], progress: {}, fetchedAt: new Date().toISOString() }
      // 1. Agents đang chạy: terminal titles theo worktree (DEV runtime — story
      // worktrees sống trong app dev; production binary + ORCA_USER_DATA_PATH)
      try {
        const { stdout } = await execFileAsync(orcaBin(), ['terminal', 'list', '--json'],
          { timeout: 15000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, ORCA_USER_DATA_PATH: join(process.env.HOME || '', 'Library', 'Application Support', 'orca-dev') } })
        const parsed = JSON.parse(stdout)
        // chỉ giữ terminal trong worktree sf-* THẬT (tồn tại trên đĩa trong workspace
        // trees) — tránh title mồ côi của story cũ ghép nhầm vào node story mới
        const wsBase2 = join(process.env.HOME || '', 'orca', 'workspaces')
        for (const t of parsed?.result?.terminals ?? []) {
          const wtPath = (t.worktreeId || '').split('::')[1] || ''
          const wt = wtPath.split('/').pop()
          if (!wt || !t.title || /^\s*$/.test(t.title)) continue
          if (!wt.startsWith('sf-')) continue
          let exists = false
          try { await readFile(join(wtPath, '.git'), 'utf8'); exists = true } catch {
            try { await readdir(wtPath); exists = wtPath.includes('/workspaces/') } catch { exists = false }
          }
          if (exists) out.agents.push({ worktree: wt, title: t.title.trim().slice(0, 120) })
        }
      } catch { /* terminal list unavailable */ }
      // 2. Plan progress: đếm checkboxes trong mỗi sf worktree plan mới nhất
      const roots = await storyScanRoots()
      for (const r of roots) {
        const plansDir = join(r, 'docs', 'superpowers', 'plans')
        let ents = []
        try { ents = await readdir(plansDir) } catch { continue }
        const wt = r.split('/').pop()
        for (const f of ents.filter(x => x.endsWith('.md')).sort().reverse().slice(0, 2)) {
          const text = await readFile(join(plansDir, f), 'utf8').catch(() => '')
          const done = (text.match(/- \[x\]/g) || []).length
          const todo = (text.match(/- \[ \]/g) || []).length
          // task ĐANG CHẠY = dòng [ ] đầu tiên (làm sạch markdown prefix)
          let cur = ''
          const cm = text.match(/^[ \t]*- \[ \][ \t]*(.+)$/m)
          if (cm) cur = cm[1].replace(/\*\*|`/g, '').replace(/^\d+[.)][ \t]*/, '').slice(0, 44)
          if (done + todo > 0) {
            let eff = done
            const est = done === 0 && todo > 0
            if (est) {
              // agent chưa tick plan file → ước lượng theo commits trên branch
              // (mỗi task ~1 commit): đếm commits từ điểm fork story đích
              try {
                const { execFile: ef2 } = await import('node:child_process')
                const { promisify: pf2 } = await import('node:util')
                const ef2a = pf2(ef2)
                const dest = 'story/fi169-nextjs-migration'
                const { stdout: gl } = await ef2a('git', ['-C', r, 'rev-list', '--count', `${dest}..HEAD`], { timeout: 5000 }).catch(() => ({ stdout: '0' }))
                const commits = parseInt(gl.trim() || '0', 10)
                eff = Math.min(commits, todo)
              } catch { eff = 0 }
            }
            const prev = out.progress[wt]
            const curObj = { plan: f, done: eff, total: done + todo,
              pct: Math.round((eff / (done + todo)) * 100), est: done === 0 && eff > 0, cur }
            if (!prev || curObj.total > prev.total) out.progress[wt] = curObj
          }
        }
      }
      await orca.host.call('storage.set', { key: 'story.tasks', value: out })
      return { ok: true, agents: out.agents.length, progressSfs: Object.keys(out.progress).length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      orca.log('story tasks failed: ' + message)
      return { ok: false, error: message }
    }
  }
  orca.commands.register('superpowers.storyTasks', () => collectStoryTasks())
  // Poll story.viewed → nạp story.states cho story panel đang mở (panel không
  // invoke được command — đây là đường panel⇄worker handshake cho states)
  const statesTimer = setInterval(async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'story.viewed' })
      const v = stored?.value
      if (v && typeof v.epic === 'string' && /^[A-Za-z]+-\d+$/.test(v.epic)) {
        const cur = await orca.host.call('storage.get', { key: 'story.states.' + v.epic })
        const c = cur?.value
        // refresh nếu chưa có hoặc quá 60s
        const stale = !c || !c.fetchedAt || (Date.now() - new Date(c.fetchedAt).getTime() > 60000)
        if (stale) {
          const lf = await linearChildrenFull(v.epic)
          const children = (lf.children || [])
            .filter(ch => ch.stateType !== 'canceled' && ch.stateType !== 'duplicate')
            .map(ch => ({ identifier: ch.identifier, title: ch.title, url: ch.url,
              stateName: ch.stateName, stateType: ch.stateType, stateColor: ch.stateColor }))
          await orca.host.call('storage.set', { key: 'story.states.' + v.epic,
            value: { epic: v.epic, children, fetchedAt: new Date().toISOString() } })
        }
      }
    } catch { /* silent */ }
  }, 20000)
  statesTimer.unref?.()

  // TỰ REFRESH 15s — panel bracket luôn có dữ liệu tươi mà không cần ai invoke
  const tasksTimer = setInterval(() => { void collectStoryTasks() }, 15000)
  tasksTimer.unref?.()
  void collectStoryTasks()

  // ---- Story Ops: poll request từ panel (resume/watchdog/refresh) + refresh 60s
  let lastOpsReqAt = 0
  const processOpsRequest = async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'story.ops.request' })
      const req = stored?.value
      if (req && req.at && req.at !== lastOpsReqAt) {
        lastOpsReqAt = req.at
        let result = null
        if (req.action === 'resume' && typeof req.sf === 'string') {
          result = await runKit('story-resume', [req.sf, '--send'])
        } else if (req.action === 'watchdog') {
          // --with-index khớp cron mặc định kit — pass xong index memory (fail-safe)
          result = await runKit('story-watchdog', ['--with-index'])
        } else if (req.action === 'verify') {
          result = await runKit('story-verify', [])
        } else if (req.action === 'launch') {
          // launch mọi SF sẵn sàng (deps Done, đã approve, chưa có worktree)
          result = await runKit('story-watchdog', ['--launch-next', '--with-index'])
        } else if (req.action === 'stats') {
          result = await runKit('story-stats', [])
        } else if (req.action === 'memory-query' && typeof req.q === 'string' && req.q.trim()) {
          // graph memory v2.0 — query patterns team đã học (kèm provenance)
          result = await runKit('story-memory', ['query', req.q.trim()])
        } else if (req.action === 'memory-stats') {
          result = await runKit('story-memory', ['stats'])
        } else if (req.action === 'attempts') {
          // attempt-cap: attempt log hôm nay (3 lần cùng approach → đổi hướng)
          result = await runKit('story-attempt', ['show'])
        } else if (req.action === 'visual-regress' && typeof req.baseline === 'string' && req.baseline.trim()
                   && typeof req.current === 'string' && req.current.trim()) {
          result = await runKit('story-visual-regress', ['--baseline', req.baseline.trim(), '--current', req.current.trim()])
        } else if (req.action === 'bracket-save' && typeof req.file === 'string' && req.file
                   && !req.file.includes('..') && !req.file.includes('/') && typeof req.content === 'string') {
          // Bracket node CRUD (panel drag/edit) — ghi lại file .md gốc qua
          // storyScanRoots (cùng nguồn với fileRead, không đoán đường dẫn)
          let written = null
          for (const r of await storyScanRoots()) {
            const p = join(r, 'docs', 'superpowers', 'brackets', req.file)
            try { await writeFile(p, req.content, 'utf8'); written = p; break } catch { continue }
          }
          result = written
            ? { ok: true, stdout: 'saved bracket: ' + written }
            : { ok: false, error: 'bracket file not writable in any workspace: ' + req.file }
        } else if (req.action === 'gap-answer' && typeof req.epic === 'string' && typeof req.text === 'string' && req.text.trim()) {
          result = await postGapAnswer(req.epic, req.text.trim())
        } else if (req.action === 'close' && typeof req.epic === 'string') {
          result = await postCloseStory(req.epic)
        } else if (req.action !== 'refresh') {
          return
        }
        if (result) {
          await orca.host.call('storage.set', {
            key: 'story.ops.result',
            value: { action: req.action, sf: req.sf ?? null, ok: result.ok,
                     output: String(result.stdout || result.error || '').slice(0, 2000),
                     at: new Date().toISOString() }
          })
        }
        await collectStoryOps(orca)
      }
    } catch { /* silent */ }
  }
  void processOpsRequest()
  const opsReqTimer = setInterval(() => { void processOpsRequest() }, 3000)
  opsReqTimer.unref?.()
  const opsTimer = setInterval(() => { void collectStoryOps(orca) }, 60000)
  opsTimer.unref?.()
  // ═══ DASHBOARD GATES ═══
  let lastDashGateAt = 0
  const processDashGate = async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'dash.gate.request' })
      const req = stored?.value
      if (req && req.at && req.at !== lastDashGateAt) {
        lastDashGateAt = req.at
        const gates = {
          'preflight': ['story-preflight'],
          'diff-review': ['story-diff-review'],
          'test': ['story-test', 'http://localhost:4200', '--flow', 'orders'],
          'snapshot': ['story-snapshot-env'],
          'verify': ['story-verify'],
        }
        // 5-gate chain (khớp README kit): preflight → diff-review → test →
        // snapshot-env → post-merge. post-merge cần nhánh đích (req.dest).
        if (req.gate === 'post-merge') {
          if (typeof req.dest !== 'string' || !req.dest.trim()) {
            await orca.host.call('storage.set', {
              key: 'dash.gate.result',
              value: { gate: 'post-merge', pass: false, output: 'post-merge cần dest branch (req.dest, vd story/<epic>-<slug>)', at: Date.now() }
            })
            return
          }
          orca.log('dash gate: post-merge')
          const pm = await runKit('story-post-merge', [req.dest.trim()])
          await orca.host.call('storage.set', {
            key: 'dash.gate.result',
            value: { gate: 'post-merge', pass: pm.ok, output: String(pm.stdout || pm.error || '').slice(-500), at: Date.now() }
          })
          return
        }
        const args = gates[req.gate]
        if (!args) return
        orca.log(`dash gate: ${req.gate}`)
        const result = await runKit(args[0], args.slice(1))
        await orca.host.call('storage.set', {
          key: 'dash.gate.result',
          value: { gate: req.gate, pass: result.ok, output: String(result.stdout || result.error || '').slice(-500), at: Date.now() }
        })
      }
    } catch { /* silent */ }
  }
  const dashTimer = setInterval(() => { void processDashGate() }, 3000)
  dashTimer.unref?.()

  orca.commands.register('superpowers.storyOps', () => collectStoryOps(orca))

  orca.commands.register('superpowers.debugEnv', async () => {
    const { execFile: ef } = await import('node:child_process')
    const { promisify: pf } = await import('node:util')
    const efA = pf(ef)
    const { stdout } = await efA('which', ['orca'], {})
    const { stdout: lsOut } = await efA('ls', ['-la', stdout.trim()], {}).catch(e => ({ stdout: 'ERR ' + e.message }))
    return { path: process.env.PATH, whichOrca: stdout.trim(), ls: lsOut.slice(0, 200), cwd: process.cwd() }
  })

  orca.commands.register('superpowers.plan', async (args) => {
    const idea = args && (args.idea || args.text || '')
    const res = await sendToTerminal(orca, buildPlanPrompt(idea, args?.autonomous, args?.polish, args?.simplify, args?.auditLog, args?.executeMode, args?.story))
    if (res.ok) orca.log(`superpowers.plan → terminal ${res.terminalId}: ${res.text}`)
    return res
  })

  orca.commands.register('superpowers.quickFix', async (args) => {
    const idea = args && (args.idea || args.text || '')
    const res = await sendToTerminal(orca, buildQuickFixPrompt(idea, args?.autonomous, args?.polish, args?.subagents, args?.simplify, args?.executeMode))
    if (res.ok) orca.log(`superpowers.quickFix → terminal ${res.terminalId}: ${res.text}`)
    return res
  })

  orca.commands.register('superpowers.continuePlan', async (args) => {
    const planPath = args && args.planPath
    if (!planPath) return { ok: false, reason: 'planPath required' }
    const res = await sendToTerminal(orca, buildContinuePlanPrompt(planPath, args?.autonomous, args?.executeMode))
    if (res.ok) orca.log(`superpowers.continuePlan → terminal ${res.terminalId}: ${res.text}`)
    return res
  })

  orca.commands.register('superpowers.resume', async (args) => {
    const hint = args && (args.hint || args.text || '')
    const res = await sendToTerminal(orca, buildResumePrompt(hint))
    if (res.ok) orca.log(`superpowers.resume → terminal ${res.terminalId}`)
    return res
  })

  orca.commands.register('superpowers.status', async () => {
    const res = await sendToTerminal(orca, buildStatusPrompt())
    if (res.ok) orca.log(`superpowers.status → terminal ${res.terminalId}`)
    return res
  })

  orca.commands.register('superpowers.resolve', async (args) => {
    const gateId = args && args.gateId
    const resolution = args && args.resolution
    if (!gateId || !resolution) return { ok: false, reason: 'gateId + resolution required' }
    const res = await sendToTerminal(orca, buildGatePrompt(gateId, resolution))
    if (res.ok) orca.log(`superpowers.resolve → terminal ${res.terminalId}: ${res.text}`)
    return res
  })
}
