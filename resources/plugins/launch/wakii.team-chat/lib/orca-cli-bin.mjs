// Resolve binary CLI (orca + bash Git trên Windows) — lớp đáy, không deps nội bộ.
import { accessSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Resolve the PRODUCTION orca binary explicitly. Why: when running inside the
// dev app's plugin worker, PATH puts the DEV wrapper script first
// (~/Documents/orca/out/bin/orca) which breaks outside its module context
// ("Cannot find module ..."). The production binary is self-contained.
export function orcaBin() {
  // Env override trước (baseline closures đọc `process.env.ORCA_BIN || 'orca'` —
  // refactor FI-98 phải giữ semantics, review tasks-2-5 P1).
  if (process.env.ORCA_BIN) return process.env.ORCA_BIN
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

let winBashCache = null
export function winBashBin() {
  if (winBashCache) return winBashCache
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files'
  const cand = join(pf, 'Git', 'bin', 'bash.exe')
  winBashCache = existsSync(cand) ? cand : 'bash'
  return winBashCache
}
