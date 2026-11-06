// Story snapshot scanning/loading (brackets + .wakii dirs) + Linear children
// helpers + sendToTerminal/worktreeRoot. Dead-code island trừ parseWakiiMeta
// (tests dùng) — giữ nguyên theo Principle 2. Layer L2: bus/cli-bin ← story-prompts ← story-snapshot.
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, dirname } from 'node:path'
import { orcaBin, winBashBin } from './orca-cli-bin.mjs'
import { homeDir } from './bus.mjs'
import directives from '../directives.json' with { type: 'json' }

const execFileAsync = promisify(execFileCb)

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

export { scanWakiiDir, focusedWorktreePath, storyScanRoots, listStories, loadStorySnapshot, parseBracketFile }
