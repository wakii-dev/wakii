// Story hooks install/merge vào ~/.claude/settings.json (+ per-hook manifests,
// học GH-87). Layer L2: kit-bins ← story-hooks.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { KIT_BIN, KIT_ROOT } from './kit-bins.mjs'

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

