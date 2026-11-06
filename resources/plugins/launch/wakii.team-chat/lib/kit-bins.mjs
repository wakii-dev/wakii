// Kit runtime: guard logger + repeat-guard, catalog/hash/intact, capability
// check, spawn-argv heuristics, runKit. Layer L1: cli-bin + bus ← kit-bins.
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { winBashBin } from './orca-cli-bin.mjs'
import { homeDir } from './bus.mjs'

const KIT_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'kit')

const execFileAsync = promisify(execFileCb)

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

export { guardLog, truncateReason, KIT_ROOT, KIT_BIN }
