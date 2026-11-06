#!/usr/bin/env node
/* eslint-disable curly, no-control-regex, no-unused-vars, prefer-template, no-useless-escape */ // one-shot rebrand tooling
// Rebrand Wakii Tier 2 — acceptance verifier (mason).
// RED hôm nay (baseline còn brand Orca) → GREEN khi rebrand xong.
// Chạy độc lập, node thuần: `node scripts/rebrand-verify.mjs` → exit 0 = GREEN, exit 1 = RED.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const LOCALES_DIR = join(ROOT, 'src', 'renderer', 'src', 'i18n', 'locales')
const MAIN_DIR = join(ROOT, 'src', 'main')
const BUILDER_CONFIG = join(ROOT, 'config', 'electron-builder.config.cjs')
const README = join(ROOT, 'README.md')
const SELF = join(ROOT, 'scripts', 'rebrand-verify.mjs')

// Never-touch allowlist (đồng bộ AGENTS.md "Rebrand Wakii — never-touch list"):
// các pattern bị LOẠI trước khi match /orca/i, theo thứ tự áp dụng.
const ALLOW_PATTERNS = [
  /https?:\/\/[^\s"'`,;()[\]]*stablyai[^\s"'`,;()[\]]*/gi, // feed/update domain stablyai
  /[^\s"'`,;()[\]]*stablyai[^\s"'`,;()[\]]*/gi, // token còn lại chứa stablyai (appId, repo path)
  /orca:\/\//g, // protocol passthrough — GIỮ NGUYÊN list (mindmap Tier 2)
  /\bORCA_[A-Z_]*/g, // env vars (kể cả prefix trần)
  /@orca\/[\w.\-/]*/g, // package imports
  /[\w.-]*onorca\.dev[\w./…-]*/gi, // first-party product domain (updater feed, cloud auth, artifacts)
  // --- Formalized never-touch classes (Q5, 03/11 — mirror AGENTS.md) ---
  /X-Orca-Agent-Hook-Token/gi, // wire header (server chi nhan x-orca, khong fallback)
  /X-Orca-Agent-Hook-Meta(?:-Encoding)?/gi, // wire header metadata
  /GNOME\s+Orca/gi, // external product (GNOME screen reader)
  /[\w.-]*orcad[\w.-]*/gi, // orcad family: daemon identifiers, ORCAD_* env, .orcad paths
  /['"`]orca['"`]/g, // quoted bare 'orca' — protocol values (provider, clientInfo, enums)
  /\/orca(?![\w.-])/g, // path segment /orca (bin/orca, ~/.cache/orca, /usr/local/bin/orca)
  /\.orca(?![a-z])/g, // data/config dir .orca (~/.orca, .orca/, .orca\)
  /\borca\.ya?ml\b/gi, // SSH remote config filename
  /\borca\.(?:cmd|exe|sh|json|d\.ts|local)\b/gi, // CLI binary/dev-domain filenames
  /\borca[\w-]*\.(?:json|ya?ml)\b/gi, // config/manifest filenames (orca-plugin.json, orca-marketplace.json)
  /\borca-[a-z][\w-]*/gi, // hyphenated orca compounds (orca-linear, orca-notes, orca-ide, orca-shell)
  /[\w]+-orca\b/gi, // trailing-hyphen enum values (opened-in-orca, repo-orca)
  /\borca_[\w-]*/gi, // underscore compounds (orca_telemetry_disabled, orca_ session prefix)
  /[\w]+_orca\b/gi, // trailing underscore identifiers (app_starred_orca, coordinator_orca)
  /\borca(?::[\w.-]+)+/g, // colon channel names (orca:daemon-audit:incarnation:v1)
  /Get-Orca\w+/g, // PowerShell Verb-OrcaNoun helpers
  /\borca\/[\w-]+/g, // slash tokens (orca/feat-mobile-page sample content)
  /(?<=\w)orca(?=\w)/gi, // orca as internal substring of a word (EditorCaret, errorcapture) — false-positive keys
  /[\w.-]*app\.orca\.dev[\w./…-]*/gi, // skills-share/dev domain
  /\borca\s+(?:cli|emulator|emulador|émulateur|first|primero|premier|zuerst)\b/gi, // CLI search-term hints
  /\b(?:comandos|commandes|commands|Befehle|lệnh)\s+orca\b/gi, // CLI mentions (trailing word order)
  /\b(?:bare )?orca dispatcher\b/gi, // CLI prose (reverted per Q2 — binary still orca)
  /\bOrca launcher\b/gi, // CLI prose
  /\buse Orca from\b/gi, // CLI prose
  /\bmanaged by Orca\b/gi, // CLI prose
  /\bnon-Orca command\b/gi, // CLI prose
  /\borca terminal\b/gi, // CLI command name
  /ORCA\s+(?:skills|serve|account|worktree|terminal|orchestration|plugin|profile|environment|browser|status|commands?)\b/g, // uppercase CLI invocations (skill text; \n literal phá \b)
  /\borca(?=\s+(?:--|-[a-z]))/g, // CLI invocations với flags
  /\borca\s+(?:serve|account|worktree|terminal|orchestration|plugin|profile|environment|browser|status|computer|vm|command|commands|comandos|commandes|Befehle|lệnh)\b/gi, // CLI invocations & 'orca command(s)' prose
  /\borca(?:\.[\w-]+)+/g, // dotted CLI globals & channels (orca.panels.handle, orca:serve-ready)
  /# (?:BEGIN|END) ORCA AGENT STATUS HOOKS/g, // legacy profile block markers
  /[\w.-]*orca\.localhost[^\s"'`,;()[\]]*/gi, // dev localhost label domains
  /@orca\.local\b/gi, // dev email domain
  /com\.orca\.[\w-]+/g, // native messaging host names
  /[A-Za-z]:(?:\\\\|\\)Orca\\/g, // Windows install dir C:\Orca\
  /(?<![\w-])orca(?![\w-])/g // lowercase standalone orca = CLI refs (brand luôn viết hoa Orca/Wakii) — ĐẶT CUỐI
]

const stripAllowlisted = (line) => ALLOW_PATTERNS.reduce((s, p) => s.replace(p, ''), line)

const violations = []
const scanLine = (rel, lineNo, raw) => {
  if (/orca/i.test(stripAllowlisted(raw))) {
    const excerpt = raw.trim().slice(0, 200)
    violations.push(`${rel}:${lineNo}: ${excerpt}`)
  }
}

// Surface src/main: chỉ tính orca trong STRING LITERALS ('...' / "..." / `...`),
// bỏ match trong identifier/tên biến-hàm (__orca_has_feature, isOrcaOwnedZshWrapperDir…).
const stringContentsOf = (line) => {
  const out = []
  let quote = null
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\') {
        cur += c + (line[i + 1] ?? '')
        i++
      } else if (c === quote) {
        out.push(cur)
        quote = null
        cur = ''
      } else {
        cur += c
      }
    } else if (c === "'" || c === '"' || c === '`') {
      // Apostrophe sau word char = contraction/possessive (Electron's, Orca's) — không mở string span
      if (c === "'" && i > 0 && /[\w)\]]/.test(line[i - 1])) {
        continue
      }
      quote = c
      cur = ''
    }
  }
  if (quote) {
    out.push(cur)
  } // literal chưa đóng (multi-line template) — vẫn soi phần đã thấy
  return out
}
// Identifier-shape tokens chứa orca trong strings (shell markers, camelCase nội bộ) = never-touch:
const IDENT_ORCA_PATTERNS = [
  /\b\w*[a-z]Orca\w*\b/g, // camelCase nhúng (isOrcaOwnedZshWrapperDir, exploreOrca)
  /\b_+\w*orca\w*/gi, // leading-underscore shell identifiers (__orca_has_feature, _orca_shell_features)
  /\borca[_$-]\w+/gi, // orca-prefixed compound (orca-shell-start)
  /\borca[a-z]{2,}\b/gi // lowercase compound liền chữ (orcaCloud) — CLI/prose 'orca' đơn vẫn bị giữ
]
const scanMainLine = (rel, lineNo, raw) => {
  const inStrings = stringContentsOf(raw).some((s) => {
    // bare 'orca' là TOÀN BỘ content = protocol value / CLI constant (quotes là delimiter) — never-touch
    if (s.trim() === 'orca') {
      return false
    }
    let t = stripAllowlisted(s)
    t = IDENT_ORCA_PATTERNS.reduce((x, p) => x.replace(p, ''), t)
    return /orca/i.test(t)
  })
  if (inStrings) {
    const excerpt = raw.trim().slice(0, 200)
    violations.push(`${rel}:${lineNo}: ${excerpt}`)
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git', 'docs', 'tests', '__tests__'])
const isTestFile = (name) => /(^|[.\-_])test[.\-_]|\.spec\.|(^|[.\-_])mock[.\-_]/i.test(name)

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walk(full)
      }
    } else if (full !== SELF) {
      yield full
    }
  }
}

// a) i18n locale files
let localeFiles = 0
if (existsSync(LOCALES_DIR)) {
  for (const f of walk(LOCALES_DIR)) {
    if (!f.endsWith('.json')) {
      continue
    }
    localeFiles++
    const rel = relative(ROOT, f)
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => scanLine(rel, i + 1, line))
  }
} else {
  violations.push(`${relative(ROOT, LOCALES_DIR)}: MISSING — locale dir không tồn tại`)
}

// b) src/main brand strings trong string literals (non-test)
const MAIN_EXT = new Set(['.ts', '.tsx', '.mts', '.cts'])
let mainFiles = 0
if (existsSync(MAIN_DIR)) {
  for (const f of walk(MAIN_DIR)) {
    if (!MAIN_EXT.has(f.slice(f.lastIndexOf('.')))) {
      continue
    }
    if (isTestFile(f.split(sep).pop())) {
      continue
    }
    mainFiles++
    const rel = relative(ROOT, f)
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => scanMainLine(rel, i + 1, line))
  }
} else {
  violations.push(`${relative(ROOT, MAIN_DIR)}: MISSING — src/main không tồn tại`)
}

// c) electron-builder productName
let productName = null
let productNameLine = 0
if (existsSync(BUILDER_CONFIG)) {
  const lines = readFileSync(BUILDER_CONFIG, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (productName === null) {
      const m = line.match(/\bproductName:\s*(['"])(.*?)\1/)
      if (m) {
        productName = m[2]
        productNameLine = i + 1
      }
    }
  })
}

// d) README team-workflow markers (Tier 2C hero sections)
const MARKERS = ['team workflow', 'pipeline', 'roster', 'skills', 'quickstart']
const readmeText = existsSync(README) ? readFileSync(README, 'utf8') : ''
const missingMarkers = MARKERS.filter(
  (m) => !new RegExp(m.replace(/ /g, '\\s+'), 'i').test(readmeText)
)

// --- Report ---
const countBy = { locale: 0, main: 0 }
for (const v of violations) {
  if (v.includes(': MISSING')) {
    continue
  }
  countBy[v.startsWith('src/renderer/src/i18n/locales') ? 'locale' : 'main']++
}
const missing = violations.filter((v) => v.includes(': MISSING'))

console.log('=== Rebrand Wakii Tier 2 — mason acceptance verifier ===\n')
console.log(
  `a) i18n locales (${localeFiles} files, ${relative(ROOT, LOCALES_DIR)}): ${countBy.locale} vi phạm /orca/i (sau allowlist)`
)
console.log(
  `b) src/main non-test (${mainFiles} files): ${countBy.main} vi phạm orca trong string literals (sau allowlist)`
)
console.log(
  `c) productName (config/electron-builder.config.cjs:${productNameLine}): ${JSON.stringify(productName)} — yêu cầu === "Wakii"`
)
console.log(
  `d) README markers: thiếu ${missingMarkers.length}/5${missingMarkers.length ? ` → ${missingMarkers.join(', ')}` : ' — đủ 5 marker'}`
)
if (missing.length) {
  console.log(`   MISSING: ${missing.join(' | ')}`)
}
console.log('')
if (violations.length) {
  console.log(`--- Vi phạm chi tiết (${violations.length} mục) ---`)
  for (const v of violations) {
    console.log('  ' + v)
  }
  console.log('')
}
const green = violations.length === 0 && productName === 'Wakii' && missingMarkers.length === 0
console.log(
  green
    ? 'SUMMARY: GREEN — 0 vi phạm, productName = Wakii, README đủ 5 marker.'
    : `SUMMARY: RED — locale=${countBy.locale}, main=${countBy.main}, productName=${JSON.stringify(productName)} (cần "Wakii"), README thiếu ${missingMarkers.length}/5 marker${missing.length ? `, missing-dir=${missing.length}` : ''}.`
)
process.exit(green ? 0 : 1)
