// constitution-check — (a) validate spec/plan ngược nguyên tắc bất invariant
// (mượn pattern github/spec-kit, không cần cài Spec Kit).
//
// Nguồn quy tắc: `rules/wakii-overlay.md` + `AGENTS.md` (root repo) — trích
// statement in đậm (line bắt đầu `**` hoặc `- **`) làm danh sách nguyên tắc.
// Mỗi check ánh xạ 1 pattern cấm trong spec (marker regex) → 1 nguyên tắc
// nguồn; spec chứa pattern = violation, {valid: false} = RED.
//
// Output constitutionCheck(path): {
//   valid: bool,                      // false khi có ≥1 violation
//   violations: [{rule, source, evidence}],
//   markers: [{line, detail}],        // **[CHƯA RỐ: …]** chưa CEO trả lời (không RED)
// }
// File spec thiếu → throw Error (caller quyết; test case 3neo hành vi này).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
// kit/lib → root repo (6 mức); dùng làm mặc định cho rules/ + AGENTS.md.
const REPO_ROOT = join(MODULE_DIR, '..', '..', '..', '..', '..', '..')

// Pattern cấm trong spec/plan + từ khóa neo về statement nguyên tắc trong nguồn.
const CHECKS = [
  {
    id: 'ai-commit-trailer',
    pattern: /Co-Authored-By:\s*[^\n]*(Claude|GPT|Copilot|AI)/i,
    anchor: /Co-Authored-By/,
    label: 'Cấm trailer Co-Authored-By AI trong commit',
  },
  {
    id: 'raw-hex-color',
    pattern: /#[0-9a-fA-F]{6}\b/,
    anchor: /UI tokens|giá trị màu|main\.css/,
    label: 'Cấm hex tự bịa — mọi UI work dùng token main.css/STYLEGUIDE',
  },
  {
    id: 'hardcoded-metakey',
    pattern: /\.metaKey\b/,
    anchor: /metaKey|Keyboard shortcuts/,
    label: 'Cấm hardcode e.metaKey — phải chọn qua platform check',
  },
  {
    id: 'shell-true-spawn',
    pattern: /shell:\s*true/,
    anchor: /shell: true|Windows child processes/,
    label: 'Cấm spawn shell:true — dùng runProcess/spawnProcess từ @orca/process-host',
  },
  {
    id: 'child-process-direct',
    pattern: /['"](?:node:)?child_process['"]/,
    anchor: /child_process|Windows child processes/,
    label: 'Cấm child_process trực tiếp — dùng runProcess/spawnProcess từ @orca/process-host',
  },
]

function defaultRead(path) {
  return readFileSync(path, 'utf8')
}

// Trích statement nguyên tắc: line bắt đầu `**` hoặc `- **`.
export function extractImmutableRules(sourceFiles, opts = {}) {
  const read = opts.readFileSync ?? defaultRead
  const rules = []
  for (const file of sourceFiles) {
    const lines = read(file).split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(?:- )?\*\*(.+)$/)
      if (m) rules.push({ rule: lines[i].trim(), source: `${file}:${i + 1}`, line: i + 1 })
    }
  }
  return rules
}

// Quét marker **[CHƯA RỐ: <chi tiết>]** — câu hỏi đánh dấu chờ CEO quyết.
export function scanClarificationMarkers(text) {
  const markers = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\*\*\[CHƯA RỐ:\s*([^\]]+)\]\*\*/)
    if (m) markers.push({ line: i + 1, detail: m[1].trim() })
  }
  return markers
}

export function constitutionCheck(specPath, opts = {}) {
  const read = opts.readFileSync ?? defaultRead
  const rulesDir = opts.rulesDir ?? join(REPO_ROOT, 'rules')
  const agentsPath = opts.agentsPath ?? join(REPO_ROOT, 'AGENTS.md')
  const sources = [
    join(rulesDir, 'wakii-overlay.md'),
    agentsPath,
  ]
  const rules = extractImmutableRules(sources, { readFileSync: read })
  const spec = read(specPath)
  const violations = []
  for (const check of CHECKS) {
    const lines = spec.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (check.pattern.test(lines[i])) {
        // Neo violation về statement nguyên tắc trong nguồn (fallback label).
        const hit = rules.find((r) => check.anchor.test(r.rule))
        violations.push({
          rule: hit?.rule ?? `${check.label} (${check.id})`,
          source: hit?.source ?? sources.join(', '),
          evidence: `spec line ${i + 1}: ${lines[i].trim()}`,
        })
        break // 1 violation/check là đủ để RED
      }
    }
  }
  return { valid: violations.length === 0, violations, markers: scanClarificationMarkers(spec) }
}
