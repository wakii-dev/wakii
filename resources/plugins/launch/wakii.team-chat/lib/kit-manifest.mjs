// Kit manifest validation (kit.json schema + entries phải tồn tại trên disk)
// + notify kit-blocked. Layer L2: kit-bins ← story-prompts ← kit-manifest.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { computeKitHash, guardLog, truncateReason } from './kit-bins.mjs'
import { SKILL } from './story-prompts.mjs'

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

export { validateKitManifest, kitDiskEntries, kitEntryLabel, kitDiskEntry, notifyKitBlocked }
