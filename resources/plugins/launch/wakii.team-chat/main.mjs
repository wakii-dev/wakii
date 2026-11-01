// Wakii Team Chat — plugin worker entry (pluginApi 1).
//
// Runs inside the out-of-process plugin worker (plain Node, no Electron).
// The default export receives the `orca` API: command registration + the
// capability-gated host API.
//
// Panel bridge (wakii fork 31/10): panels may call storage.get/storage.set
// (plugin-private store, session-bound to this plugin) plus
// workspace.readContext/notifications.show. Chat flow: panel writes
// 'team.chat.send' single-slot → poller below appends to the JSONL bus and
// refreshes 'team.chat.tail' (200 tin cuối) mỗi 2s cho panel poll.
// CLI bins (team-chat/team-orch/…) append thẳng bus — một nguồn sự thật.

import directives from './directives.json' with { type: 'json' }
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { accessSync, readFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync, writeFileSync, chmodSync, statSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const execFileAsync = promisify(execFileCb)

// Resolve the PRODUCTION orca binary explicitly. Why: when running inside the
// dev app's plugin worker, PATH puts the DEV wrapper script first
// (~/Documents/orca/out/bin/orca) which breaks outside its module context
// ("Cannot find module ..."). The production binary is self-contained.
function orcaBin() {
  const isWin = process.platform === 'win32'
  const candidates = isWin ? [
    // Windows: binary sống cạnh app resources (exe + bin/orca.exe); ALSO the
    // app's own executable path is unusable — resolve from process.execPath.
    join(dirname(process.execPath), 'resources', 'bin', 'orca.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'orca', 'resources', 'bin', 'orca.exe')
  ] : [
    '/opt/homebrew/bin/orca',
    '/usr/local/bin/orca',
    '/Applications/Wakii.app/Contents/Resources/bin/orca',
    '/Applications/Orca.app/Contents/Resources/bin/orca'
  ]
  for (const c of candidates) {
    try { if (c) accessSync(c); else continue; return c } catch { continue }
  }
  return 'orca' // fallback to PATH (production app context)
}

// Windows GUI processes have USERPROFILE but often no HOME (the app scrubs
// worker env to an allowlist that may carry only one of the two) — always
// resolve the user root through this instead of process.env.HOME directly.
function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || ''
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
    if (!key) { try { key = (await readFile(join(homeDir(), '.claude', '.linear-key'), 'utf8')).split('\n')[0].trim() } catch { key = '' } }
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

import { readFile, readdir, writeFile, unlink, appendFile, mkdir } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'

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
  const hm = text.match(/^#\s+Story:\s*([A-Za-z]+-\d+)\s*[—–-]\s*(.+)$/m)
  if (hm) { linear = hm[1]; title = hm[2].trim() }
  return { linear, title: title.slice(0, 60), file }
}

// Worker-side catalog mirror của src/shared/wakii-mindmap-types.ts (bảng
// required-field) — full validation nằm ở wakii-validate / app parser,
// không mở rộng ở đây (tránh drift).
export function parseWakiiMeta(text, file) {
  let doc = null
  try { doc = JSON.parse(text) } catch { return null }
  if (!doc || doc.wakiiMindmap !== 1 || !doc.meta || !Array.isArray(doc.nodes)) return null
  const { story, epic } = doc.meta
  if (typeof story !== 'string' || !story.trim()) return null
  if (typeof epic !== 'string' || !/^[A-Za-z]+-\d+$/.test(epic)) return null
  const sfNodes = doc.nodes.filter(n => n?.kind === 'sf')
  const linear = sfNodes.filter(n => typeof n.linear === 'string').map(n => n.linear)
  return { linear: epic, title: story.slice(0, 60), file, source: 'wakii', sfCount: sfNodes.length, sfs: linear }
}

// Quét mindmaps/*.wakii của 1 root → meta entries (mindmaps-first: canonical
// VU-14; caller tự dedupe với brackets). dir có thể không tồn tại → [].
async function scanWakiiDir(root) {
  const dir = join(root, 'docs', 'superpowers', 'mindmaps')
  let entries = []
  try { entries = await readdir(dir) } catch { return [] }
  return (await Promise.all(entries.filter(f => f.endsWith('.wakii')).map(async f => {
    const text = await readFile(join(dir, f), 'utf8').catch(() => '')
    return parseWakiiMeta(text, f)
  }))).filter(Boolean)
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
  const wsBase = join(homeDir(), 'orca', 'workspaces')
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

// story.list — story files in the ACTIVE WORKTREE + which is "current"
// (current = the active worktree's linked Linear issue matches a story file).
// Canonical mindmaps/*.wakii first; a bracket with the same linear is shadowed.
// Đọc qua HOST workspace fs (workspace.listFiles/fileRead) chứ không node fs +
// CLI: đó là cùng root mà panel dùng khi mở story — list theo nguồn khác sẽ
// gợi ý story panel không bao giờ mở được (lỗi "file not found").
async function listStories(orca) {
  try {
    const listDir = async (rel) => {
      try {
        const r = await orca.host.call('workspace.listFiles', { dir: rel })
        return ((r && r.files) || []).map((f) => f.name)
      } catch {
        return [] // dir chưa tồn tại trong active worktree
      }
    }
    const readFile = async (rel) => {
      try {
        const r = await orca.host.call('workspace.fileRead', { path: rel })
        return (r && r.content) || ''
      } catch {
        return ''
      }
    }
    let stories = []
    const skipped = [] // observability — file bị drop phải để lại dấu vết
    for (const f of await listDir('docs/superpowers/mindmaps')) {
      if (!f.endsWith('.wakii')) continue
      const meta = parseWakiiMeta(await readFile('docs/superpowers/mindmaps/' + f), f)
      if (meta && meta.linear) stories.push(meta)
      else skipped.push({ file: 'mindmaps/' + f, reason: 'malformed hoặc bị fileRead clamp 256KB (schema cho tới 5MB)' })
    }
    // legacy brackets — shadowed bởi wakii cùng linear
    for (const f of await listDir('docs/superpowers/brackets')) {
      if (!f.endsWith('.md')) continue
      const meta = parseBracketFile(await readFile('docs/superpowers/brackets/' + f), f)
      if (meta && meta.linear && !stories.some((x) => x.linear === meta.linear)) {
        stories.push(meta)
      }
    }
    stories.sort((a, b) => a.file.localeCompare(b.file))
    if (!stories.length) {
      // Observability: diagnostics in the storage payload —
      // silent-empty made the Windows autocomplete bug invisible for weeks.
      await orca.host.call('storage.set', {
        key: 'story.list',
        value: { stories: [], currentLinear: null, currentFile: null,
                 error: 'no story files (.wakii/.md) in the active worktree',
                 skipped, fetchedAt: new Date().toISOString() }
      })
      return { ok: true, count: 0, skipped: skipped.length }
    }
    // current story: linked issue of the active worktree — cwd PHẢI là focused
    // root (CLI resolve --current theo cwd; worker cwd = Orca app, sai worktree)
    let currentLinear = null
    try {
      const { stdout } = await execFileAsync(orcaBin(), ['linear', 'issue', '--current', '--json'],
        { timeout: 15000, maxBuffer: 4 * 1024 * 1024, cwd: root || undefined })
      const parsed = JSON.parse(stdout)
      if (parsed?.ok) currentLinear = parsed.result?.issue?.identifier ?? null
    } catch { /* no linked issue */ }
    const list = {
      stories,
      currentLinear,
      currentFile: (stories.find(st => st.linear === currentLinear) || {}).file ?? null,
      skipped,
      fetchedAt: new Date().toISOString()
    }
    await orca.host.call('storage.set', { key: 'story.list', value: list })
    return { ok: true, count: stories.length, currentLinear }
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

// Load a story from a canonical .wakii file (mindmaps/). Structure IS the
// file; Linear only enriches states. planMarkdown: null — panel renders the doc.
async function loadFromWakiiFile(orca, fileName) {
  try {
    // guard như write path — read không được escape workspace qua fileName
    if (typeof fileName !== 'string' || !fileName.endsWith('.wakii')
        || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { ok: false, error: 'tên file .wakii không hợp lệ: ' + String(fileName) }
    }
    let full = null
    for (const r of await storyScanRoots()) {
      const cand = join(r, 'docs', 'superpowers', 'mindmaps', fileName)
      try { await readFile(cand, 'utf8'); full = cand; break } catch { continue }
    }
    if (!full) return { ok: false, error: 'wakii file not found: ' + fileName }
    const text = await readFile(full, 'utf8')
    const meta = parseWakiiMeta(text, fileName)
    if (!meta) return { ok: false, error: 'wakii file malformed: ' + fileName }
    // Fetch epic + children states from Linear (fail-open như bracket path)
    let children = []
    let storyUrl = null
    try {
      const lf = await linearChildrenFull(meta.linear)
      children = lf.children || []
      storyUrl = lf.url
    } catch (linErr) {
      orca.log('linear fetch in load-by-wakii failed: ' + (linErr instanceof Error ? linErr.message : String(linErr)))
    }
    const snapshot = {
      story: { id: null, identifier: meta.linear, title: meta.title, url: storyUrl },
      children,
      planMarkdown: null,
      wakiiFile: fileName,
      fetchedAt: new Date().toISOString()
    }
    await orca.host.call('storage.set', { key: 'story.snapshot', value: snapshot })
    orca.log('story snapshot (wakii): ' + meta.linear + ' · ' + children.length + ' children')
    return { ok: true, identifier: meta.linear, children: children.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('story load-by-wakii failed: ' + message)
    return { ok: false, error: message }
  }
}

// Story Load: read the active worktree's linked Linear issue (+children full),
// persist a snapshot for the panel's bracket view. Vertical-bracket data source.
async function loadStorySnapshot(orca, args) {
  try {
    // Arg precedence: explicit story FILE (.wakii canonical, .md legacy) > issue ID > focused worktree
    const wantFile = typeof args?.file === 'string' && (args.file.endsWith('.md') || args.file.endsWith('.wakii')) ? args.file : null
    if (wantFile?.endsWith('.wakii')) return loadFromWakiiFile(orca, wantFile)
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

const KIT_BIN = join(homeDir(), '.claude', 'bin')

// ---- Guard advisory nhãn nguồn + reject-reason log (issue #22) -------------
// camel: mọi item bị chặn phải để lại log lý do đọc được (reason ≤200 ký tự,
// không phình log). deepseek-harness: guard NHẮC không chặn — reminder phải có
// nhãn nguồn, không veto, không đổi kết quả call. Sink do activate gắn vào
// orca.log; harness gắn mock riêng.
let guardLogSink = null
export function setKitGuardLogger(fn) { guardLogSink = typeof fn === 'function' ? fn : null }
function guardLog(line) { try { guardLogSink?.(line) } catch { /* log không được chặn caller */ } }

const GUARD_REASON_MAX = 200
function truncateReason(s, max = GUARD_REASON_MAX) {
  const t = String(s ?? '')
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

// Repeat-guard: đếm chuỗi gọi TRÙNG (bin + args) LIÊN TIẾP trong runKit; chạm
// ngưỡng → advisory return field, không đụng blocked/ok. State giữ trong module.
const REPEAT_THRESHOLDS = [3, 5, 8]
let repeatState = { key: null, count: 0 }
export function resetKitRepeatGuard() { repeatState = { key: null, count: 0 } }
function recordKitRepeat(bin, args) {
  let key
  try { key = `${bin} ${JSON.stringify(args ?? null)}` } catch { key = `${bin} (args không tuần tự hoá được)` }
  if (repeatState.key === key) repeatState.count++
  else repeatState = { key, count: 1 }
  if (!REPEAT_THRESHOLDS.includes(repeatState.count)) return null
  guardLog(`[guard:repeat-tool-reminder] gọi trùng lần ${repeatState.count} — đây là guard nhắc, không phải lệnh mới (${truncateReason(key, 80)})`)
  return { guard: 'repeat-tool-reminder', repeat: repeatState.count, note: 'guard nhắc, không phải lệnh mới — kết quả call giữ nguyên' }
}

// Capability catalog: provides[] bin của kit.json. Không đọc được → null
// (dispatch pass-through — install path đã fail-loud riêng lúc activate).
export function kitBinCatalog(kitRoot = KIT_ROOT) {
  try {
    const manifest = JSON.parse(readFileSync(join(kitRoot, 'kit.json'), 'utf8'))
    if (!manifest || !Array.isArray(manifest.provides)) return null
    return new Set(manifest.provides
      .filter(e => e && typeof e === 'object' && e.type === 'bin' && typeof e.name === 'string')
      .map(e => e.name))
  } catch { return null }
}

// Hash cây kit/ — chặn drift "đổi file mà không bump": marker skip-copy theo
// version-only từng để ~/.claude stale (2.10.1-era); rehash thiếu từng vỡ
// launch-content 1.4.203. Sort path + sha256 16 hex, deterministic cross-platform.
// kit.json loại khỏi hash (tự chứa hash đó).
export function computeKitHash(kitRoot = KIT_ROOT) {
  const h = createHash('sha256')
  for (const rel of kitTreeFiles(kitRoot)) {
    h.update(rel); h.update('\0'); h.update(readFileSync(join(kitRoot, rel))); h.update('\0')
  }
  return h.digest('hex').slice(0, 16)
}

// Danh sách file kit (skills/ + agents/ + bin/ — phần được cài vào ~/.claude).
// CHỈ 3 dirs này — contract với installKit copy scope + installedKitIntact.
// Walk cả root làm self-heal thành dead code + recopy đè edit user MỌI activation
// (bug 2.16.2). Root files (bracket-template, permission-matrix…) KHÔNG cài →
// không vào hash/intact (drift guard kit-verify cũng chỉ so 3 dirs + kit.json).
// Dùng chung cho computeKitHash + installedKitIntact.
const KIT_INSTALLED_DIRS = ['skills', 'agents', 'bin']
function kitTreeFiles(kitRoot) {
  const skip = new Set(['__pycache__', '.git', 'node_modules'])
  const files = []
  for (const dir of KIT_INSTALLED_DIRS) {
    const stack = ['']
    while (stack.length) {
      const rel = stack.pop()
      for (const ent of readdirSync(join(kitRoot, dir, rel), { withFileTypes: true })) {
        if (skip.has(ent.name) || ent.name.endsWith('.pyc') || ent.name === '.DS_Store') continue
        if (ent.isDirectory()) stack.push(rel ? `${rel}/${ent.name}` : ent.name)
        else if (ent.isFile()) files.push(`${dir}/${rel ? rel + '/' : ''}${ent.name}`)
      }
    }
  }
  return files.sort()
}

// Bản cài ở ~/.claude còn nguyên vẹn không: mỗi file kit phải tồn tại và giống
// bytes. Bắt case marker khớp nhưng user xoá tay/file hỏng — tự hồi phục bằng
// re-copy. Bỏ qua file dư (skill user cài thêm ngoài kit).
export function installedKitIntact(claude, kitRoot = KIT_ROOT) {
  try {
    for (const rel of kitTreeFiles(kitRoot)) {
      const dst = join(claude, rel)
      if (!existsSync(dst)) return false
      if (!readFileSync(dst).equals(readFileSync(join(kitRoot, rel)))) return false
    }
    return true
  } catch {
    return false
  }
}

// Neovim lsp._unsupported_method: lỗi chỉ đích danh capability thiếu, chặn
// TRƯỚC dispatch — không ENOENT vô tên giữa đường. catalog vắng → không cấm.
export function assertCapability(name, catalog = kitBinCatalog()) {
  if (!catalog || catalog.has(name)) return { ok: true }
  return { ok: false, blocked: 'capability',
    error: `capability '${name}' không có trong kit.json provides[] (bin) — không dispatch. Kit cũ/thiếu entry: sửa manifest + cài lại kit.` }
}

// Windows không exec được shebang script (extensionless → ENOENT). `bash <file>`
// cũng KHÔNG được: bash interpret file, shebang thành comment → JS/python vỡ
// (thật: "line 2: syntax error near '('"). Sniff shebang, ghép đúng interpreter:
// node/python → thẳng interpreter; bash/sh → Git bash (fallback Program Files).
let winBashCache = null
function winBashBin() {
  if (winBashCache) return winBashCache
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files'
  const cand = join(pf, 'Git', 'bin', 'bash.exe')
  winBashCache = existsSync(cand) ? cand : 'bash'
  return winBashCache
}
function kitSpawnArgv(binPath, args) {
  if (process.platform !== 'win32') return [binPath, args]
  if (extname(binPath)) return [binPath, args]
  let first = ''
  try { first = readFileSync(binPath, 'utf8').split('\n', 1)[0] || '' } catch { return [binPath, args] }
  const m = first.match(/^#!\s*\S*?(?:env\s+)?(node|python3?|bash|sh)\b/)
  if (!m) return [binPath, args]
  if (m[1] === 'bash' || m[1] === 'sh') return [winBashBin(), [binPath, ...args]]
  return [m[1], [binPath, ...args]] // node/python3 — resolve qua PATH
}

export async function runKit(bin, args, { kitRoot } = {}) {
  const advisory = recordKitRepeat(bin, args)
  const cap = assertCapability(bin, kitBinCatalog(kitRoot))
  if (!cap.ok) {
    // camel reject-reason: MỖI lần chặn để lại 1 dòng log lý do — block giữ nguyên
    guardLog(`[guard:capability-check] blocked '${bin}' — ${truncateReason(cap.error)}`)
    return advisory ? { ...cap, advisory } : cap
  }
  try {
    const [spawnBin, spawnArgs] = kitSpawnArgv(join(KIT_BIN, bin), args)
    const { stdout } = await execFileAsync(spawnBin, spawnArgs,
      { timeout: 90000, maxBuffer: 2 * 1024 * 1024 })
    return advisory ? { ok: true, stdout, advisory } : { ok: true, stdout }
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err)
    // stdout của bin exit != 0 (vd wakii-validate FAIL JSON) phải lộ vào error —
    // không thì panel chỉ thấy "Command failed" mất fails[]
    const so = typeof err?.stdout === 'string' && err.stdout.trim() ? '\n' + err.stdout.slice(0, 1000) : ''
    const error = base + so
    return advisory ? { ok: false, error, advisory } : { ok: false, error }
  }
}

// ---- Wakii save (panel → canonical mindmaps/*.wakii) -----------------------
// Ghi doc .wakii từ panel qua ops 'wakii-save'. Fail-closed: nội dung phải pass
// wakii-validate trước khi đụng file đích. Merge machine-owned state khi disk
// tiến trước panel (absorb story-mindmap --update-state); disk có sf id lạ
// (file bị regenerate dưới chân panel) → 'stale-doc' để panel reload.
const WAKII_SAVE_MAX_BYTES = 200 * 1024 // storage cap 256KB trừ JSON-escape
// overhead của pretty-print doc (mỗi newline/quote escape phình 10-25%)
const WAKII_STATE_ENUM = new Set(['pending', 'in-progress', 'blocked', 'done', 'complete'])

export async function saveWakiiStory(orca, fileName, content, baseGeneratedAt, deletedIds, deps = {}) {
  try {
    if (typeof fileName !== 'string' || !fileName.endsWith('.wakii')
        || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { ok: false, error: 'tên file .wakii không hợp lệ: ' + String(fileName) }
    }
    if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'content rỗng' }
    if (Buffer.byteLength(content, 'utf8') > WAKII_SAVE_MAX_BYTES) {
      return { ok: false, error: 'wakii doc vượt transport cap 200KB (storage 256KB trừ JSON-escape overhead) — không round-trip qua panel được' }
    }
    const delSet = new Set(Array.isArray(deletedIds) ? deletedIds.filter(x => typeof x === 'string') : [])
    let incoming = null
    try { incoming = JSON.parse(content) } catch { return { ok: false, error: 'content không phải JSON' } }
    if (!incoming || incoming.wakiiMindmap !== 1 || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
      return { ok: false, error: 'content không phải wakii doc schema v1' }
    }
    // deps injection cho test hermetic (roots: scan roots; runKit: validator)
    const scanRoots = Array.isArray(deps.roots) ? async () => deps.roots : storyScanRoots
    const runValidator = deps.runKit || runKit

    // Locate target: file sẵn có theo storyScanRoots; chưa có → focused/first root
    let target = null
    for (const r of await scanRoots()) {
      const p = join(r, 'docs', 'superpowers', 'mindmaps', fileName)
      try { accessSync(p); target = p; break } catch { continue }
    }
    if (!target) {
      const base = deps.roots ? deps.roots[0] : ((await focusedWorktreePath()) || (await storyScanRoots())[0])
      if (!base) return { ok: false, error: 'không có workspace root để ghi: ' + fileName }
      target = join(base, 'docs', 'superpowers', 'mindmaps', fileName)
      mkdirSync(dirname(target), { recursive: true })
    }

    // Validate fail-closed: tmp cùng dir → wakii-validate --json (exit 1 FAIL / 2 usage)
    const tmp = join(dirname(target), '.' + basename(target) + '.tmp-' + process.pid)
    await writeFile(tmp, content, 'utf8')
    try {
      const val = await runValidator('wakii-validate', [tmp, '--json'])
      if (!val.ok) {
        return { ok: false, error: 'wakii-validate FAIL — không ghi: ' + truncateReason(val.error || 'exit != 0', 800) }
      }
    } finally {
      await unlink(tmp).catch(() => {})
    }

    // State-race merge: disk tiến trước panel (baseGeneratedAt lệch) → copy
    // state machine-owned của sf/epic cùng id từ disk (panel không edit state)
    let disk = null
    try { disk = JSON.parse(await readFile(target, 'utf8')) } catch { /* missing/corrupt → new file */ }
    let merged = incoming
    let stateMerged = false
    if (disk?.wakiiMindmap === 1 && baseGeneratedAt && disk.meta?.generatedAt !== baseGeneratedAt) {
      merged = structuredClone(incoming)
      const diskStates = new Map((disk.nodes || [])
        .filter(n => n && (n.kind === 'sf' || n.kind === 'epic')
                     && typeof n.state === 'string' && WAKII_STATE_ENUM.has(n.state))
        .map(n => [n.id, n.state]))
      for (const n of merged.nodes || []) {
        if (n && (n.kind === 'sf' || n.kind === 'epic') && diskStates.has(n.id) && n.state !== diskStates.get(n.id)) {
          n.state = diskStates.get(n.id); stateMerged = true
        }
      }
    }
    // Stale guard: disk có sf id không có trong incoming lẫn deletedIds → file
    // bị regenerate dưới chân panel — không đoán merge, bảo panel reload
    if (disk && Array.isArray(disk.nodes)) {
      const inIds = new Set((merged.nodes || []).map(n => n?.id))
      const stale = disk.nodes.filter(n => n?.kind === 'sf' && !inIds.has(n.id) && !delSet.has(n.id))
      if (stale.length) return { ok: false, error: 'stale-doc', staleSfs: stale.map(n => n.id).slice(0, 10) }
    }

    // Idempotent: payload giống disk (bỏ generatedAt) → không write, không bump
    const stripGen = (d) => { const c = structuredClone(d); if (c?.meta) delete c.meta.generatedAt; return stableJson(c) }
    if (disk && stripGen(disk) === stripGen(merged)) {
      return { ok: true, stdout: 'unchanged: ' + fileName }
    }
    // Atomic write: tmp cùng dir + rename (mirror story-mindmap writeAtomic)
    const tmpW = join(dirname(target), '.' + basename(target) + '.w-' + process.pid)
    writeFileSync(tmpW, JSON.stringify(merged, null, 2) + '\n', 'utf8')
    renameSync(tmpW, target)
    return { ok: true, stdout: 'saved wakii: ' + target + (stateMerged ? ' (merge state từ disk)' : '') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    orca.log('wakii save failed: ' + message)
    return { ok: false, error: message }
  }
}

// Chuỗi hoá ổn định thứ tự key — so sánh payload không phụ thuộc key order
function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}'
  }
  return JSON.stringify(v) ?? 'null'
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
          try { for (const r of await readdir(join(homeDir(), 'orca', 'workspaces'))) {
            try { await readFile(join(homeDir(), 'orca', 'workspaces', r, sf, '.git'), 'utf8'); repo = r; break } catch {}
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
    out.complete = []
    try {
      const keyFile = join(homeDir(), '.claude', '.linear-key')
      let key = process.env.LINEAR_API_KEY || ''
      if (!key) { try { key = (await readFile(keyFile, 'utf8')).split('\n')[0].trim() } catch {} }
      if (key) {
        // candidates {epic, file} — mindmaps canonical first, brackets shadowed
        const cands = new Map()
        for (const r of await storyScanRoots()) {
          for (const w of await scanWakiiDir(r)) {
            if (w.linear && !cands.has(w.linear)) cands.set(w.linear, w.file)
          }
          let ents = []
          try { ents = await readdir(join(r, 'docs', 'superpowers', 'brackets')) } catch { continue }
          for (const f of ents.filter(x => x.endsWith('.md'))) {
            let text = ''
            try { text = await readFile(join(r, 'docs', 'superpowers', 'brackets', f), 'utf8') } catch { continue }
            const hm = text.match(/^# Story:\s*([A-Za-z]+-\d+)/m)
            if (hm && !cands.has(hm[1])) cands.set(hm[1], f)
          }
        }
        for (const [epic, file] of cands) {
          const gq = `query{issue(id:"${epic}"){state{name} title comments(first:50){nodes{body createdAt}} children(first:20){nodes{state{name}}}}}`
          const rr = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gq }) })
          const jj = await rr.json()
          const iss = jj?.data?.issue
          if (!iss || iss.state?.name === 'Done') continue
          const ch = iss.children?.nodes || []
          if (ch.length && ch.every(c => c.state?.name === 'Done')) {
            out.complete.push({ epic, title: (iss.title || file).slice(0, 40) })
          }
          const cs = iss.comments?.nodes || []
          const answered = cs.some(c => /^\s*GAP-ANSWER/m.test(c.body || ''))
          for (const c of cs) {
            const b = c.body || ''
            const gm = b.match(/REQUIREMENT-GAP[:：][^\n]{0,160}/)
            if (gm && !answered) out.gaps.push({ epic, file: file.replace(/\.(wakii|md)$/, ''), snippet: gm[0].slice(0, 140), at: c.createdAt })
          }
        }
      }
    } catch { /* gap queue optional */ }

    // heartbeat: commit cuối + dirty per SF (worktree git — kiểu story-top)
    for (const row of out.sfs) {
      try {
        const wt = join(homeDir(), 'orca', 'workspaces', row.repo || '', row.sf)
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
    const keyFile = join(homeDir(), '.claude', '.linear-key')
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
    const keyFile = join(homeDir(), '.claude', '.linear-key')
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

// ---- Kit manifest pre-flight (fail-loud) ----
// Zero-dep (không ajv): schema tay + two-way provides ↔ đĩa. Chạy MỖI lần
// activate, TRƯỚC marker early-return — kit hỏng phải được biết ngay, không
// chết lặng lẽ. Trả mảng problems (rỗng = hợp lệ).
const KIT_ENTRY_TYPES = ['skill', 'agent', 'bin']

function kitEntryLabel(e) {
  if (e && typeof e === 'object' && typeof e.name === 'string') return e.name
  return JSON.stringify(e)?.slice(0, 40) || '(entry rỗng)'
}

// Đĩa→predicate: skills/ = dir có SKILL.md; agents/ = file *.md; bin/ = file thường.
function kitDiskEntry(kitRoot, type, name) {
  try {
    if (type === 'skill') {
      return statSync(join(kitRoot, 'skills', name)).isDirectory()
        && statSync(join(kitRoot, 'skills', name, 'SKILL.md')).isFile()
    }
    if (type === 'agent') return statSync(join(kitRoot, 'agents', `${name}.md`)).isFile()
    if (type === 'bin') return statSync(join(kitRoot, 'bin', name)).isFile()
  } catch { /* không tồn tại */ }
  return false
}

// Toàn bộ entry mà đĩa cung cấp — dotfiles + bracket-template.md ngoài scope manifest.
function kitDiskEntries(kitRoot) {
  const found = new Set()
  try {
    for (const d of readdirSync(join(kitRoot, 'skills'), { withFileTypes: true })) {
      if (d.name.startsWith('.') || !d.isDirectory()) continue
      try { if (statSync(join(kitRoot, 'skills', d.name, 'SKILL.md')).isFile()) found.add(`skill:${d.name}`) } catch { /* không SKILL.md */ }
    }
  } catch { /* không có skills/ */ }
  try {
    for (const f of readdirSync(join(kitRoot, 'agents'), { withFileTypes: true })) {
      if (f.name.startsWith('.') || !f.isFile() || !f.name.endsWith('.md') || f.name === 'bracket-template.md') continue
      found.add(`agent:${f.name.replace(/\.md$/, '')}`)
    }
  } catch { /* không có agents/ */ }
  try {
    for (const f of readdirSync(join(kitRoot, 'bin'), { withFileTypes: true })) {
      if (f.name.startsWith('.') || !f.isFile()) continue
      found.add(`bin:${f.name}`)
    }
  } catch { /* không có bin/ */ }
  return found
}

function validateKitManifest(manifest, kitRoot) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['kit.json không phải object']
  }
  const problems = []
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) problems.push('kit.json thiếu version')
  if (manifest.kitHash !== undefined && !/^[0-9a-f]{8,64}$/.test(String(manifest.kitHash).trim())) {
    problems.push('kit.json kitHash phải là hex 8-64 ký tự (computeKitHash)')
  }
  if (!Array.isArray(manifest.provides)) return problems.concat(['kit.json thiếu provides[] (mảng)'])
  const declared = new Set()
  for (const e of manifest.provides) {
    const label = kitEntryLabel(e)
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      problems.push(`provides entry không hợp lệ: ${label}`)
      continue
    }
    if (typeof e.name !== 'string' || !e.name.trim()) problems.push(`entry ${label}: thiếu name`)
    if (!KIT_ENTRY_TYPES.includes(e.type)) problems.push(`entry ${label}: type phải thuộc skill|agent|bin (nhận ${JSON.stringify(e.type ?? null)})`)
    if ((e.type === 'skill' || e.type === 'agent')) {
      if (!Array.isArray(e.inputs) || e.inputs.length === 0 || !e.inputs.every(x => typeof x === 'string' && x.trim())) {
        problems.push(`entry ${label} (${e.type}): thiếu inputs[] (mảng string)`)
      }
      if (typeof e.outputs !== 'string' || !e.outputs.trim()) problems.push(`entry ${label} (${e.type}): thiếu outputs (string)`)
      if (typeof e.owner !== 'string' || !e.owner.trim()) problems.push(`entry ${label} (${e.type}): thiếu owner`)
    } else if (e.type === 'bin' && (typeof e.description !== 'string' || !e.description.trim())) {
      problems.push(`entry ${label} (bin): thiếu description`)
    }
    if (typeof e.name === 'string' && e.name && KIT_ENTRY_TYPES.includes(e.type)) declared.add(`${e.type}:${e.name}`)
  }
  // Trùng id WITHIN provides[] — học Qwen-Agent register_tool: fail ngay, liệt kê
  // entry, không ghi đè im lặng (flat theo name — trùng name khác type cũng mơ hồ).
  const byName = new Map()
  for (const [i, e] of manifest.provides.entries()) {
    if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !e.name.trim()) continue
    if (!byName.has(e.name)) byName.set(e.name, [])
    byName.get(e.name).push(`#${i} (${e.type ?? 'không type'})`)
  }
  for (const [name, at] of byName) {
    if (at.length > 1) problems.push(`provides trùng name '${name}': ${at.join(' + ')} — id catalog phải unique`)
  }
  for (const e of manifest.provides) {
    if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !KIT_ENTRY_TYPES.includes(e.type)) continue
    if (!kitDiskEntry(kitRoot, e.type, e.name)) problems.push(`entry ${e.name} (${e.type}): không thấy trên đĩa`)
  }
  for (const key of kitDiskEntries(kitRoot)) {
    if (!declared.has(key)) problems.push(`trên đĩa nhưng không có entry provides: ${key}`)
  }
  return problems
}

// Fail path dùng chung: toast fire-and-forget + 1 dòng log nhãn [guard:kit-manifest]
// (camel reject-reason — pre-flight fail không biến mất im lặng). KHÔNG throw
// (activate phải sống); block-all do caller return false.
function notifyKitBlocked(orca, summary) {
  guardLog(`[guard:kit-manifest] install blocked — ${truncateReason(summary)}`)
  const full = `story-team-kit install blocked: ${summary} — không copy, marker giữ nguyên. Sửa kit rồi restart.`
  const body = full.length > 400 ? `${full.slice(0, 397)}…` : full
  Promise.resolve()
    .then(() => orca.host.call('notifications.show', { title: 'story-team-kit', body }))
    .catch(() => { if (!guardLogSink) { try { orca.log(body) } catch { /* không còn kênh nào */ } } })
}

// ---- Story hooks auto-install (SF-2 GH-26) --------------------------------
// Merge ĐÚNG 3 hook entries vào <root>/settings.json: PostToolUse (matcher
// Bash → checkpoint record), SessionStart (→ fact-pack), Stop (wrapper no-op,
// logic thật SF-3 thay sau) + các group từ manifests kit/hooks/*.json (GH-87
// SF-1, PreToolUse guards). Detection theo ĐÚNG command path (normalized) của
// kit — KHÔNG prefix-match `story-` (entry legacy story-compact-recovery và
// claude-hook.cmd của Orca phải nguyên vẹn). Idempotent: chỉ ghi khi nội dung
// đổi (chạy lần 2 → file byte-for-byte không đổi). Atomic: temp cùng dir +
// rename. Malformed settings.json → KHÔNG BAO GIỜ ghi đè (return ok:false).
const STORY_HOOK_WRAPPERS = {
  PostToolUse: { file: 'hook-post-tool-use', matcher: 'Bash' },
  SessionStart: { file: 'hook-session-start', matcher: null },
  Stop: { file: 'hook-stop', matcher: null }
}
const STORY_HOOK_TIMEOUT = 10

const normCmdPath = (s) => String(s || '').replace(/\\/g, '/')

// Canonical groups cho 1 event — command = đường dẫn wrapper đã cài (forward
// slash, chạy được cả Git Bash lẫn POSIX). Tách hàm để test so DeepEqual.
export function buildStoryHookGroups(claudeDir) {
  const binDir = normCmdPath(join(claudeDir, 'bin'))
  const out = {}
  for (const [event, w] of Object.entries(STORY_HOOK_WRAPPERS)) {
    const hook = { type: 'command', command: `${binDir}/${w.file}`, timeout: STORY_HOOK_TIMEOUT }
    out[event] = w.matcher ? { matcher: w.matcher, hooks: [hook] } : { hooks: [hook] }
  }
  // PreToolUse guards — đọc CÙNG nguồn với bin story-hooks-install (kit/hooks/*.json,
  // sorted, {KIT_BIN} → bin dir). Lockstep: bin và Node diverge = hooks-factpack đỏ.
  try {
    const hooksDir = join(KIT_ROOT, 'hooks')
    const groups = []
    for (const name of readdirSync(hooksDir).sort()) {
      if (!name.endsWith('.json')) continue
      let manifest
      try {
        manifest = JSON.parse(readFileSync(join(hooksDir, name), 'utf8'))
      } catch { continue } // manifest hỏng — skip như bin
      for (const group of manifest?.hooks?.PreToolUse || []) {
        const g = JSON.parse(JSON.stringify(group))
        for (const h of g.hooks || []) {
          h.command = String(h.command || '').replaceAll('{KIT_BIN}', binDir)
        }
        groups.push(g)
      }
    }
    if (groups.length) out.PreToolUse = groups // array → merge loop flatten
  } catch { /* không có kit/hooks (plugin chạy riêng) — bỏ qua như bin */ }
  return out
}

// Pure merge — settings hiện tại + canonical groups → settings mới. Group chứa
// ĐÚNG command của kit (và không trộn lệnh lạ) → thay nguyên group; chưa có →
// append. Group trộn command kit + lệnh lạ → không đụng, append canonical riêng.
// kitDir đưa vào → group từ manifests kit/hooks/*.json (GH-87 SF-1) merge CÙNG
// semantics với bin story-hooks-install: {KIT_BIN} → <claudeDir>/bin, event đã
// có command kết thúc /<bin-name> → skip (idempotent).
function eventHasHookCmd(hooks, event, needle) {
  for (const group of (hooks[event] || [])) {
    if (!group || typeof group !== 'object') continue
    for (const h of (group.hooks || [])) {
      if (normCmdPath(h?.command).includes(needle)) return true
    }
  }
  return false
}

function upsertHookGroup(hooks, event, group, kitCmds) {
  const arr = Array.isArray(hooks[event]) ? [...hooks[event]] : []
  const want = normCmdPath(group.hooks[0].command)
  let replaced = false
  for (let i = 0; i < arr.length; i++) {
    const ent = arr[i]
    if (!ent || typeof ent !== 'object' || !Array.isArray(ent.hooks)) continue
    const cmds = ent.hooks.map(h => normCmdPath(h?.command))
    if (!cmds.includes(want)) continue
    const hasForeign = cmds.some(c => c && !kitCmds.has(c))
    if (hasForeign) continue // mixed — giữ nguyên, append canonical riêng bên dưới
    arr[i] = JSON.parse(JSON.stringify(group))
    replaced = true
    break
  }
  if (!replaced) arr.push(JSON.parse(JSON.stringify(group)))
  hooks[event] = arr
}

// Đọc manifests kit/hooks/*.json → [{name, event, group}] đã thay {KIT_BIN}.
// Manifest hỏng/thiếu → skip im lặng (fail-open như bin story-hooks-install).
export function readKitHookManifests(kitDir, claudeDir) {
  const out = []
  let files = []
  try { files = readdirSync(join(kitDir, 'hooks')).sort() } catch { return out }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const manifest = JSON.parse(readFileSync(join(kitDir, 'hooks', f), 'utf8'))
      for (const raw of manifest.hooks.PreToolUse) {
        const group = JSON.parse(JSON.stringify(raw))
        for (const h of group.hooks || []) {
          if (typeof h?.command === 'string' && h.command.includes('{KIT_BIN}')) {
            h.command = h.command.replaceAll('{KIT_BIN}', normCmdPath(join(claudeDir, 'bin')))
          }
        }
        out.push({ name: f.replace(/\.json$/, ''), event: 'PreToolUse', group })
      }
    } catch { /* manifest hỏng — skip cả file như bin */ }
  }
  return out
}

export function mergeStoryHookSettings(settings, claudeDir, kitDir) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const canon = buildStoryHookGroups(claudeDir)
  // canon value có thể là 1 group (wrappers) hoặc array groups (PreToolUse guards)
  const canonList = Object.entries(canon).flatMap(([event, g]) =>
    (Array.isArray(g) ? g : [g]).map(gg => [event, gg]))
  const kitCmds = new Set(canonList.map(([, g]) => normCmdPath(g.hooks[0].command)))
  const next = { ...settings }
  const hooks = { ...(next.hooks && typeof next.hooks === 'object' && !Array.isArray(next.hooks) ? next.hooks : {}) }
  for (const [event, group] of canonList) {
    upsertHookGroup(hooks, event, group, kitCmds)
  }
  for (const { name, event, group } of readKitHookManifests(kitDir || KIT_ROOT, claudeDir)) {
    const firstCmd = (group.hooks || []).map(h => normCmdPath(h?.command)).find(c => c.includes('/'))
    const binName = firstCmd ? firstCmd.split('/').pop() : name
    if (eventHasHookCmd(hooks, event, `/${binName}`)) continue // đã wired — idempotent
    upsertHookGroup(hooks, event, group, kitCmds)
  }
  next.hooks = hooks
  return next
}

// RMW lên đĩa — fail-open phía caller (không throw). changed=false khi nội dung
// đã đúng (không đụng mtime → idempotent byte-for-byte).
export function mergeStoryHooks(claudeDir, kitDir) {
  try {
    const settingsPath = join(claudeDir, 'settings.json')
    let current = {}
    let currentText = null
    if (existsSync(settingsPath)) {
      currentText = readFileSync(settingsPath, 'utf8')
      try {
        current = JSON.parse(currentText)
      } catch (err) {
        return { ok: false, changed: false, error: `settings.json malformed — không ghi đè: ${err.message}` }
      }
    }
    const merged = mergeStoryHookSettings(current, claudeDir, kitDir)
    if (!merged) return { ok: false, changed: false, error: 'settings.json không phải object' }
    const nextText = JSON.stringify(merged, null, 2) + '\n'
    if (currentText !== null && currentText === nextText) return { ok: true, changed: false }
    const tmp = join(claudeDir, `.settings.json.tmp-${process.pid}`)
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(tmp, nextText)
    renameSync(tmp, settingsPath)
    return { ok: true, changed: true }
  } catch (err) {
    return { ok: false, changed: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---- Kit self-install (bundle built-in Wakii) ----
// sync-kit.sh vendor story-team-kit vào kit/ cạnh main.mjs. Khi worker kích
// hoạt, chép skills/agents/bin vào ~/.claude/ — build Wakii xong là full chức
// năng, không cần chạy install.sh tay. Idempotent: skip khi đúng version đã
// cài (marker file). Chỉ đụng thư mục kit sở hữu — skill/CLI của người dùng
// ngoài kit KHÔNG bị đè.
// Testability: named export + injectable seams — `root` (destination, default
// ~/.claude) và `kitRoot` (nguồn bundle) để negative harness chạy trên temp
// dirs, KHÔNG BAO GIỜ chạm HOME thật. Trả true = cài/đã-cứu/skip, false = blocked.
const KIT_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'kit')

// Skills đã retire khỏi kit nhưng còn nằm lại ~/.claude/skills từ các bản cài
// cũ — installKit dọn theo danh sách biết trước này. KHÔNG tự xoá skill ngoài
// danh sách (huashu-design, issue-fix-loop... là skill của user/khác, không
// thuộc kit). Bổ sung vào đây mỗi khi retire skill (2.15.0: 5 skills đầu tiên).
// 2.15.0 retire 5 + 2.16.0 Phase-1 retire 6 (moved vào kênh skills/ của repo) —
// BỔ SUNG VÀO ĐÂY MỖI KHI RETIRE (chỉ dẫn trong 2.16.1 từng bị bỏ qua cho 2.16.0)
const RETIRED_SKILL_DIRS = [
  'brainstorm', 'bridge-router', 'execute-plan', 'graph-engineering', 'gpt-taste',
  'design-taste-frontend', 'figma-orientation', 'frontend-design', 'image-to-code',
  'prompt-master', 'web-design-guidelines',
]

export function installKit(orca, { root, kitRoot: kitRootOverride } = {}) {
  try {
    const kitRoot = kitRootOverride || KIT_ROOT
    const manifestPath = join(kitRoot, 'kit.json')
    if (!existsSync(manifestPath)) return true // không bundle kit — silent no-op (plugin chạy riêng vẫn OK)
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      notifyKitBlocked(orca, `kit.json malformed: ${err.message}`)
      return false
    }
    // Pre-flight TRƯỚC marker early-return: validate mỗi activate, marker chỉ skip copy.
    const problems = validateKitManifest(manifest, kitRoot)
    if (problems.length) {
      notifyKitBlocked(orca, problems.join(' | '))
      return false
    }
    const claude = root || join(homeDir(), '.claude')
    const marker = join(claude, '.story-team-kit-version')
    // Marker `version[:kitHash]` — hash lệch (đổi kit mà không bump version) cũng
    // phải recopy, không skip. kitHash vắng (kit cũ) → so version như trước.
    const kitHash = typeof manifest.kitHash === 'string' ? manifest.kitHash.trim() : ''
    const expectedMarker = kitHash ? `${manifest.version}:${kitHash}` : String(manifest.version)
    // Dọn orphan retired — chạy MỌI activate (kể cả khi marker khớp, non-fatal).
    for (const name of RETIRED_SKILL_DIRS) {
      try {
        rmSync(join(claude, 'skills', name), { recursive: true, force: true })
      } catch { /* dọn được cái nào hay cái đó */ }
    }
    // Sidecar install-coverage (LOCAL-5 SF-1): story-doctor chạy từ vị trí CÀI
    // không có kit.json — ghi provides/srcKitRoot/kitHash VÔ ĐIỀU KIỆN TRƯỚC
    // early-return để refresh mỗi activate, kể cả marker khớp. Atomic tmp+rename.
    try {
      const binDir = join(claude, 'bin')
      mkdirSync(binDir, { recursive: true })
      const sidecar = {
        provides: (manifest.provides || [])
          .filter(e => e && typeof e === 'object' && e.type === 'bin' && typeof e.name === 'string')
          .map(e => e.name).sort(),
        srcKitRoot: resolve(kitRoot),
        kitHash,
      }
      const scPath = join(binDir, '.kit-provides.json')
      const scTmp = scPath + '.tmp'
      writeFileSync(scTmp, JSON.stringify(sidecar, null, 2) + '\n')
      renameSync(scTmp, scPath)
    } catch { /* sidecar chỉ phục vụ story-doctor — không chặn install */ }
    if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === expectedMarker && installedKitIntact(claude, kitRoot)) return true
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
    writeFileSync(marker, expectedMarker)
    // Hooks auto-install (SF-2 + GH-87 SF-1): merge 3 wrapper entries + guard
    // manifests vào settings.json trong Node (KHÔNG spawn bash bin từ worker —
    // runProcess seam risk trên Windows). CÙNG semantics với bin — negative
    // harness cross-check 2 đường deep-equal. Fail không chặn install: bin đã
    // copy, hook wrapper tự nuốt missing-bin.
    const merged = mergeStoryHooks(claude, kitRoot)
    if (merged.ok) orca.log(`story-team-kit v${manifest.version}: hooks ${merged.changed ? 'merged' : 'up-to-date'}`)
    else orca.log(`story-team-kit v${manifest.version}: hooks merge skip — ${merged.error}`)
    // Verify gates config (FI-380 review plan): seed mặc định lần đầu —
    // evidence/realMode/checklist ON, smoke OFF (cần infra). Panel toggle
    // đè qua op verify-config; bins fail-open dùng default nếu file lỗi.
    const vcfgPath = join(claude, 'story-kit.json')
    if (!existsSync(vcfgPath)) {
      writeFileSync(vcfgPath, JSON.stringify({ verify: {
        evidenceGate: true, realModeRule: true, reviewerChecklist: true, runtimeSmoke: false, tddMode: true } }, null, 2) + '\n')
      orca.log('story-team-kit: verify config seeded (story-kit.json)')
    }
    orca.log('story-team-kit self-installed: v' + manifest.version)
    return true
  } catch (err) {
    // lỗi bất ngờ (đĩa/permission) — cũng fail-loud, KHÔNG throw trong activate
    notifyKitBlocked(orca, `self-install failed: ${err.message}`)
    return false
  }
}

export default function activate(orca) {
  setKitGuardLogger((line) => orca.log(line))
  installKit(orca)

  // ── Commands (manifest declares team.chat / team.doctor) ────────────────
  // Command invoke là trigger đánh thức worker này (worker lazy-start);
  // activate() mới là nơi poller chat sống. Không có action declarative
  // "open panel" nên team.chat báo qua notification + trả trạng thái bus.
  orca.commands.register('panelWake', async () => ({ ok: true }))
  orca.commands.register('team.chat', async () => {
    const tail = await readTail(5)
    await orca.host.call('notifications.show', {
      title: 'Wakii Team Chat',
      body: `Chat bus đang chạy — mở panel Team Chat ở sidebar phải. ${tail.length} tin mới nhất trên bus.`
    })
    return { ok: true, recent: tail.length }
  })
  orca.commands.register('team.doctor', async () => {
    await orca.host.call('notifications.show', {
      title: 'Wakii Team Doctor',
      body: 'Chạy `story-doctor` trong terminal để kiểm tra toolbox (kit bins + guards).'
    })
    return { ok: true }
  })

  // ── Team Chat bus (HOI-16): log JSONL là nguồn sự thật duy nhất ──────────
  // ~/.claude/chat/team-chat.jsonl — mọi thành viên ghi/đọc cùng format:
  //   {"at":<ms>,"from":"<tên>","role":"captain|worker|owner|system","channel":"<kênh>","text":"..."}
  // Panel → storage 'team.chat.send' (single slot) → poller append file + xoá slot.
  // CLI (Captain/workers) → bin team-chat append thẳng file.
  // Outbound: poller refresh storage 'team.chat.tail' (200 tin cuối) mỗi 2s cho panel.
  const chatDir = join(homeDir(), '.claude', 'chat')
  const chatLog = join(chatDir, 'team-chat.jsonl')

  const readTail = async (limit = 200) => {
    try {
      const raw = await readFile(chatLog, 'utf8')
      return raw.split('\n').filter((l) => l.trim()).slice(-limit)
    } catch {
      return []
    }
  }

  const appendLine = async (msg) => {
    await mkdir(chatDir, { recursive: true })
    const line = JSON.stringify({
      at: Date.now(),
      from: String(msg.from || 'unknown').slice(0, 40),
      role: String(msg.role || 'system').slice(0, 12),
      channel: String(msg.channel || 'general').slice(0, 32),
      text: String(msg.text || '').slice(0, 4000)
    })
    await appendFile(chatLog, line + '\n')
  }

  let lastSendAt = 0
  let lastTailLen = -1
  // Captain luôn online (CEO ruling 1/11): poller là router — mọi tin của
  // Owner/@captain được ACK ngay vào room + chuyển tiếp vào terminal Captain
  // (claude thật) nếu đã cấu hình storage 'team.captain.terminal' = handle.
  // Mirror roster + settings (panel settings ghi storage) ra file cho
  // Captain/bins/CLI đọc: ~/.claude/chat/roster.json {ceo, concurrency, members}
  let rosterMirror = ''
  const mirrorRoster = async () => {
    try {
      const [nm, ro, st] = await Promise.all([
        orca.host.call('storage.get', { key: 'team.chat.name' }).catch(() => null),
        orca.host.call('storage.get', { key: 'team.chat.roster' }).catch(() => null),
        orca.host.call('storage.get', { key: 'team.chat.settings' }).catch(() => null)
      ])
      const data = {
        ceo: (nm && nm.value) || 'CEO',
        concurrency: (st && st.value && st.value.concurrency) || 3,
        members: (ro && Array.isArray(ro.value)) ? ro.value : []
      }
      const s = JSON.stringify(data)
      if (s !== rosterMirror) {
        rosterMirror = s
        await writeFile(join(chatDir, 'roster.json'), s + '\n')
      }
    } catch { /* mirror best-effort */ }
  }
  let lastRoomCmdAt = 0
  let lastCaptainCmdAt = 0
  let captainSeenAt = Date.now()
  const ackedAt = new Set() // dedup: 1 tin chỉ ACK 1 lần (bug thấy thật 1/11 01:32)
  let lastOwnerCommandAt = 0
  let stalledNotified = false
  const captainAck = async (msg) => {
    if (ackedAt.has(msg.at)) return
    ackedAt.add(msg.at)
    const preview = String(msg.text || '').slice(0, 60)
    await appendLine({
      from: 'captain', role: 'captain', channel: msg.channel || 'general',
      text: `📡 Captain đã nhận: "${preview}" — đang xử lý.`
    }).catch(() => {})
    await orca.host.call('notifications.show', {
      title: 'Wakii Team — lệnh mới từ CEO',
      body: String(msg.text || '').slice(0, 120)
    }).catch(() => {})
  }
  let lastCaptainSig = ''
  let roomListSeen = []
  // ── Captain room-scoped: mỗi room = 1 worktree + 1 captain trực ──
  let aliveCache = { at: 0, panes: new Set() }
  const livePanes = async () => {
    if (Date.now() - aliveCache.at < 20000) return aliveCache.panes
    let panes = new Set()
    try {
      const orcaBin = process.env.ORCA_BIN || 'orca'
      const out = await new Promise((res) => execFileCb(orcaBin, ['terminal', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (out) for (const t of JSON.parse(out).result.terminals) panes.add(t.handle)
    } catch { /* list fail → rỗng để wake */ }
    aliveCache = { at: Date.now(), panes }
    return panes
  }
  const captainEntries = async () => {
    try {
      const reg = JSON.parse(await readFile(join(homeDir(), '.claude', 'chat', '.workers.json'), 'utf8'))
      return Object.entries(reg)
        .filter(([, e]) => e && e.name === 'captain')
        .map(([pane, e]) => ({ pane, room: e.room || null, worktree: e.worktree || '' }))
    } catch { return [] }
  }
  const resolveRoomWorktree = async (room) => {
    try {
      const reg = JSON.parse(await readFile(join(chatDir, '.workers.json'), 'utf8'))
      const wt = Object.values(reg).find((e) => e && e.room === room && e.worktree && e.name !== 'captain')?.worktree
      if (wt) return wt
    } catch { /* chưa có registration */ }
    try {
      const rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
      const repo = rooms[room] && rooms[room].repo
      const orcaBin = process.env.ORCA_BIN || 'orca'
      const out = await new Promise((res) => execFileCb(orcaBin, ['worktree', 'list', '--json'], { timeout: 15000 }, (e, o) => res(e ? '' : o)))
      if (!out) return ''
      const wts = JSON.parse(out).result.worktrees.map((w) => w.path)
      return wts.find((p) => repo && p.endsWith('/' + repo)) || wts.find((p) => repo && p.includes(repo)) || wts[0] || ''
    } catch { return '' }
  }
  const forwardTo = async (handle, msg) => {
    await orca.host.call('terminal.sendText', {
      terminalId: handle,
      text: `[CEO→captain|#${msg.channel || 'general'}] ${msg.from}: ${msg.text}\n(trả lời vào ĐÚNG room: ~/.claude/bin/team-chat send "..." --from captain --role captain --channel ${msg.channel || 'general'})\n`,
      enter: true
    })
  }
  const wakingRooms = new Set()
  const wakeCaptainFor = async (room) => {
    if (wakingRooms.has(room)) return
    wakingRooms.add(room)
    try {
      const spawnBin = join(homeDir(), '.claude', 'bin', 'team-captain-spawn')
      const wt = await resolveRoomWorktree(room)
      const args = ['--room', room].concat(wt ? ['--repo', 'path:' + wt] : [])
      await new Promise((res) => execFileCb('bash', [spawnBin].concat(args), { timeout: 120000 }, () => res()))
      aliveCache = { at: 0, panes: new Set() }
    } catch { /* wake best-effort */ } finally { wakingRooms.delete(room) }
  }
  const captainRoute = async (msg) => {
    try {
      const room = msg.channel || 'general'
      const entries = await captainEntries()
      const live = await livePanes()
      // Captain TRỰC ROOM: ưu tiên entry khớp room; fallback captain toàn cục
      const pick = entries.find((c) => c.room === room && live.has(c.pane))
             || entries.find((c) => !c.room && live.has(c.pane))
      if (pick) { await forwardTo(pick.pane, msg); return }
      appendLine({ from: 'system', role: 'system', channel: room,
        text: '💤 Captain#' + room + ' đang offline — tự đánh thức (gắn worktree room)…' }).catch(() => {})
      void (async () => {
        try {
          await wakeCaptainFor(room)
          await new Promise((r) => setTimeout(r, 12000)) // chờ Captain nhận brief (script gửi ở giây 8)
          const after = await captainEntries()
          const live2 = await livePanes()
          const ok2 = after.find((c) => c.room === room && live2.has(c.pane)) || after.find((c) => !c.room && live2.has(c.pane))
          if (ok2) await forwardTo(ok2.pane, msg)
        } catch { /* bỏ qua */ }
      })()
    } catch { /* route best-effort — ACK đã khẳng định presence */ }
  }
  const tick = async () => {
    try {
      const stored = await orca.host.call('storage.get', { key: 'team.chat.send' })
      const req = stored?.value?.value !== undefined ? stored.value.value : stored?.value
      if (req && typeof req === 'object' && typeof req.at === 'number' && req.at !== lastSendAt
          && typeof req.text === 'string' && req.text.trim()) {
        lastSendAt = req.at
        await appendLine({ from: req.from, role: req.role, channel: req.channel, text: req.text })
        await orca.host.call('storage.set', { key: 'team.chat.send', value: null }).catch(() => {})
      }
      // Wake Captain từ panel settings: spawn terminal claude gắn worktree của room.
      // Worker không có API tạo terminal nhưng CÓ child_process + ORCA_BIN (app
      // inject) → chạy bin team-captain-spawn của kit.
      const cc = await orca.host.call('storage.get', { key: 'team.chat.captainCmd' }).catch(() => null)
      const ccReq = cc && cc.value
      if (ccReq && typeof ccReq === 'object' && ccReq.at && ccReq.at !== lastCaptainCmdAt && ccReq.action === 'wake') {
        lastCaptainCmdAt = ccReq.at
        const room = ccReq.room || 'general'
        orca.log('[wake] nhận lệnh wake room=' + room)
        void (async () => {
          try {
            // Worktree của room: (1) registration worker của room → (2) repo trong
            // rooms.json khớp path worktree list → (3) worktree đầu tiên.
            let wt = ''
            try {
              const reg = JSON.parse(await readFile(join(chatDir, '.workers.json'), 'utf8'))
              wt = Object.values(reg).find((e) => e && e.room === room && e.worktree && e.name !== 'captain')?.worktree || ''
            } catch { /* chưa có registration */ }
            const orcaBin = process.env.ORCA_BIN || 'orca'
            if (!wt) {
              try {
                const rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
                const repo = rooms[room] && rooms[room].repo
                const out = await new Promise((res) => execFileCb(orcaBin, ['worktree', 'list', '--json'], (e, o) => res(e ? '' : o)))
                const wts = JSON.parse(out).result.worktrees.map((w) => w.path)
                wt = wts.find((p) => repo && p.endsWith('/' + repo)) || wts.find((p) => repo && p.includes(repo)) || wts[0] || ''
              } catch { /* list fail → fallback dưới */ }
            }
            orca.log('[wake] worktree=' + (wt || '(trống)'))
            if (!wt) {
              await orca.host.call('notifications.show', { title: 'Wakii Team — wake Captain thất bại', body: 'Không tìm thấy worktree nào cho room #' + room }).catch(() => {})
              return
            }
            const spawnBin = join(homeDir(), '.claude', 'bin', 'team-captain-spawn')
            orca.log('[wake] chạy ' + spawnBin + ' ORCA_BIN=' + (process.env.ORCA_BIN || '(không có)'))
            await new Promise((res) => execFileCb('bash', [spawnBin, '--repo', 'path:' + wt], { timeout: 120000 }, (e, so, se) => { orca.log('[wake] spawn xong err=' + (e && e.message || 'null') + ' out=' + String(so).slice(0, 120)); res() }))
            await orca.host.call('notifications.show', {
              title: 'Wakii Team — Captain đã online',
              body: 'Terminal Captain gắn worktree ' + wt + ' (room #' + room + '). Kéo tab vào floating workspace nếu muốn — router theo handle.'
            }).catch(() => {})
          } catch { /* wake best-effort */ }
        })()
        await orca.host.call('storage.set', { key: 'team.chat.captainCmd', value: null }).catch(() => {})
      }
      // Room commands từ panel settings: close (🔒 giữ lịch sử) / delete (xoá tab + purge tin)
      const rc = await orca.host.call('storage.get', { key: 'team.chat.roomCmd' }).catch(() => null)
      const rcReq = rc && rc.value
      if (rcReq && typeof rcReq === 'object' && rcReq.at && rcReq.at !== lastRoomCmdAt && rcReq.room) {
        lastRoomCmdAt = rcReq.at
        try {
          const roomsPath = join(chatDir, 'rooms.json')
          let rooms = {}
          try { rooms = JSON.parse(await readFile(roomsPath, 'utf8')) } catch { /* chưa có */ }
          if (rcReq.action === 'close' || rcReq.action === 'open') {
            if (rooms[rcReq.room]) rooms[rcReq.room].status = rcReq.action === 'close' ? 'closed' : 'open'
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
          } else if (rcReq.action === 'delete') {
            delete rooms[rcReq.room]
            await writeFile(roomsPath, JSON.stringify(rooms, null, 1))
            const raw = await readFile(chatLog, 'utf8').catch(() => '')
            const kept = raw.split('\n').filter((l) => {
              if (!l.trim()) return false
              try { return (JSON.parse(l).channel || 'general') !== rcReq.room } catch { return true }
            })
            await writeFile(chatLog, kept.map((l) => l + '\n').join(''))
            lastTailLen = -1 // buộc publish lại tail + rooms
          }
        } catch { /* room cmd best-effort */ }
        // Luôn ép publish lại tail+rooms — close/open không đổi độ dài tail nên
        // không được ràng vào điều kiện đó (bug 'nút không phản hồi' CEO bắt).
        lastTailLen = -1
        await orca.host.call('storage.set', { key: 'team.chat.roomCmd', value: null }).catch(() => {})
      }
      const tail = await readTail()
      if (tail.length !== lastTailLen) {
        lastTailLen = tail.length
        await orca.host.call('storage.set', { key: 'team.chat.tail', value: tail }).catch(() => {})
        // Room list cho panel tabs: registry (rooms.json) + mọi channel từng
        // xuất hiện trong tail (room tự phát vẫn hiện tab).
        let rooms = {}
        try {
          rooms = JSON.parse(await readFile(join(chatDir, 'rooms.json'), 'utf8'))
        } catch { /* chưa có registry */ }
        const seen = new Map()
        for (const line of tail) {
          try {
            const m = JSON.parse(line)
            if (m.channel) seen.set(m.channel, (seen.get(m.channel) || 0) + 1)
          } catch { /* skip dòng hỏng */ }
        }
        const list = [...new Set(['general', ...Object.keys(rooms), ...seen.keys()])]
          .map((c) => ({
            id: c,
            status: rooms[c] ? rooms[c].status : (c === 'general' ? 'open' : 'open'),
            feature: rooms[c] ? rooms[c].feature : null,
            run: rooms[c] ? rooms[c].run : null,
            msgs: seen.get(c) || 0,
            lastAt: Math.max(...tail.filter((l) => { try { return JSON.parse(l).channel === c } catch { return false } }).map((l) => { try { return JSON.parse(l).at } catch { return 0 } }), 0)
          }))
          .sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : b.lastAt - a.lastAt))
        await orca.host.call('storage.set', { key: 'team.chat.rooms', value: list }).catch(() => {})
      }
      // Captain status cho settings panel: theo TỪNG room (room = worktree + captain trực).
      try {
        const entries = await captainEntries()
        const live = await livePanes()
        const byRoom = {}
        for (const r of new Set(['general', ...roomListSeen])) {
          const hit = entries.find((c) => c.room === r && live.has(c.pane)) || entries.find((c) => !c.room && live.has(c.pane))
          byRoom[r] = hit ? { online: true, pane: hit.pane, worktree: hit.worktree } : { online: false }
        }
        const sig = JSON.stringify(byRoom)
        if (sig !== lastCaptainSig) { lastCaptainSig = sig; await orca.host.call('storage.set', { key: 'team.chat.captain', value: byRoom }).catch(() => {}) }
      } catch (e) { orca.log('[captain-status] lỗi: ' + (e && e.message || e)) }
      void mirrorRoster()
      // Router Captain: quét tin mới từ outside (owner/@captain) kể từ lần trước.
      for (const line of tail) {
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (typeof m.at !== 'number' || m.at <= captainSeenAt) continue
        if (m.from === 'captain') {
          captainSeenAt = m.at
          if (!m.text.startsWith('📡')) { lastOwnerCommandAt = 0; stalledNotified = false }
          continue
        }
        if (m.role === 'owner' || /@captain/i.test(String(m.text || ''))) {
          captainSeenAt = m.at
          await captainAck(m)
          await captainRoute(m)
          lastOwnerCommandAt = m.at
          stalledNotified = false
        }
      }
      // Watchman mini: lệnh CEO > 10 phút không thấy captain trả lời thật → cảnh báo CEO 1 lần.
      if (lastOwnerCommandAt && Date.now() - lastOwnerCommandAt > 10 * 60 * 1000 && !stalledNotified) {
        stalledNotified = true
        await orca.host.call('notifications.show', {
          title: 'Wakii Team — Captain im lặng >10 phút',
          body: 'Có lệnh CEO chưa được Captain trả lời. Kiểm tra terminal Captain (có thể kẹt turn dài).'
        }).catch(() => {})
      }
    } catch { /* chat là best-effort — không chặn activate */ }
  }
  void tick()
  const chatTimer = setInterval(() => { void tick() }, 2000)

  orca.log('wakii.team-chat v1.0.0: chat bus sẵn sàng — ' + chatLog)
  return () => clearInterval(chatTimer)
}
