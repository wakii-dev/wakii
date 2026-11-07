// Kit install: đồng bộ kit/ ra ~/.claude (bins/skills/agents) + hooks + manifest
// validation + kitHash/intact check. Layer L3: kit-bins + kit-manifest + story-hooks ← kit-install.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, rmSync, chmodSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { KIT_ROOT, computeKitHash, installedKitIntact } from './kit-bins.mjs'
import { validateKitManifest, kitDiskEntries, notifyKitBlocked } from './kit-manifest.mjs'
import { mergeStoryHooks } from './story-hooks.mjs'
import { homeDir } from './bus.mjs'


// Skills đã retire khỏi kit nhưng còn nằm lại ~/.claude/skills từ các bản cài
// cũ — installKit dọn theo danh sách biết trước này. KHÔNG tự xoá skill ngoài
// danh sách (huashu-design, issue-fix-loop... là skill của user/khác, không
// thuộc kit). Bổ sung vào đây mỗi khi retire skill (2.15.0: 5 skills đầu tiên).
// 2.15.0 retire 5 + 2.16.0 Phase-1 retire 6 (moved vào kênh skills/ của repo) —
// BỔ SUNG VÀO ĐÂY MỖI KHI RETIRE (chỉ dẫn trong 2.16.1 từng bị bỏ qua cho 2.16.0)
const RETIRED_SKILL_DIRS = [
  'brainstorm', 'bridge-router', 'execute-plan', 'graph-engineering', 'gpt-taste',
  'design-taste-frontend', 'figma-orientation', 'frontend-design', 'image-to-code',
  'web-design-guidelines',
]

// Multi-home phân phối kit skills (CEO): kit skills vào homes của MỌI agent CLI
// phát hiện trên máy — format SKILL.md là chuẩn chung, mapping global path theo
// skills.sh (vercel-labs/skills docs/agents.md). Claude home đã cài ở copy loop
// chính. Detect home không tồn tại → skip im lặng; lỗi 1 home không chặn home khác.
export function agentSkillsHomeTargets(userHome) {
  return [
    { detect: join(userHome, '.codex'), target: join(userHome, '.agents', 'skills') }, // Codex/Zed/Cline/Pi dùng chung ~/.agents
    { detect: join(userHome, '.agents'), target: join(userHome, '.agents', 'skills') },
    { detect: join(userHome, '.gemini'), target: join(userHome, '.gemini', 'skills') },
    { detect: join(userHome, '.gemini', 'config'), target: join(userHome, '.gemini', 'config', 'skills') }, // Antigravity
    { detect: join(userHome, '.cursor'), target: join(userHome, '.cursor', 'skills') },
    { detect: join(userHome, '.copilot'), target: join(userHome, '.copilot', 'skills') },
    { detect: join(userHome, '.kiro'), target: join(userHome, '.kiro', 'skills') },
    { detect: join(userHome, '.config', 'opencode'), target: join(userHome, '.config', 'opencode', 'skills') },
    { detect: join(userHome, '.codeium', 'windsurf'), target: join(userHome, '.codeium', 'windsurf', 'skills') },
    { detect: join(userHome, '.config', 'agents'), target: join(userHome, '.config', 'agents', 'skills') }, // Universal/Amp/Replit
  ]
}

export function installKitSkillsToAgentHomes(userHome, kitRoot, log = () => {}) {
  const src = join(kitRoot, 'skills')
  if (!existsSync(src)) return []
  const done = []
  const seen = new Set()
  for (const { detect, target } of agentSkillsHomeTargets(userHome)) {
    if (!existsSync(detect) || seen.has(target)) continue
    seen.add(target)
    try {
      mkdirSync(target, { recursive: true })
      for (const ent of readdirSync(src, { withFileTypes: true })) {
        const to = join(target, ent.name)
        rmSync(to, { recursive: true, force: true })
        cpSync(join(src, ent.name), to, { recursive: true })
      }
      done.push(target)
    } catch (e) {
      log(`story-team-kit: agent home ${target} install skip — ${e && e.message}`)
    }
  }
  return done
}

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
    // Multi-home kit skills (CEO multi-home): chạy MỖI activate trước early-return
    // — home bị xoá/tạo mới vẫn được refresh. root override (test harness temp
    // dir) → KHÔNG đụng home thật của user.
    if (!root) {
      const homes = installKitSkillsToAgentHomes(homeDir(), kitRoot, (m) => orca.log(m))
      if (homes.length) orca.log(`story-team-kit: kit skills đa home → ${homes.length} agent home`)
    }
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

// ── Crash diagnostics (CEO ruling 1/11: 'thêm log') — mọi lỗi chết worker phải
// để lại stack trong log app trước khi supervisor thấy 'Stopped after an error'.
process.on('uncaughtException', (e) => {
  try { console.error('[wakii.team-chat] UNCAUGHT:', e && e.stack || e) } catch {}
})
process.on('unhandledRejection', (e) => {
  try { console.error('[wakii.team-chat] UNHANDLED:', (e && e.stack) || e) } catch {}
})

