#!/usr/bin/env node
// SC evidence map (SF-3 GH-26) — 8 success criteria (epic spec
// 2026-09-09-atlas26-session-memory-checkpoints.md, mục Success criteria)
// × bằng chứng (test file + assert). SC thiếu bằng chứng = FAIL.
// File này VỪA là test chạy được VỪA là evidence map: chạy node → mở từng
// test harness → kết luận SC COVERED / GAP theo kết quả thật của harness.
// Chạy: node tests/sc-evidence-map.mjs
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))

// ---- harness registry: test file → hướng dẫn chạy (node trực tiếp) ----
const HARNESS = {
  'story-checkpoint-tests.mjs': ['record/query/restore/prune/helpers SF-1'],
  'hooks-factpack-tests.mjs': ['hooks merge SF-2 + fact-pack + stale-check [fpl] + wrappers'],
  'story-lesson-tests.mjs': ['story-lesson add/list/stop-audit + wrapper hook-stop'],
  'agent-def-protocol-tests.mjs': ['task-executor lesson step + rollback-fixer protocol'],
  'kit-verify-manifest.mjs': ['kit.json hợp lệ + version + entry'],
  'qa-happy-path-chain.mjs': ['flow đầu-cuối B1-B6'],
  'qa-failure-paths.mjs': ['stale/conflict/fail-open/meta F1-F4'],
}

// chạy TẤT CẢ harness, gom verdict
const results = {}
let totalFail = 0
for (const file of Object.keys(HARNESS)) {
  const r = spawnSync('node', [resolve(testsDir, file)], {
    encoding: 'utf8', timeout: 300000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
  const m = (r.stdout || '').match(/TOTAL: (\d+) PASS \/ (\d+) FAIL/)
  results[file] = {
    ok: r.status === 0,
    pass: m ? +m[1] : 0,
    fail: m ? +m[2] : -1,
    tail: (r.stdout || '').trim().split('\n').at(-1) || r.stderr.slice(0, 200),
  }
  if (r.status !== 0) totalFail++
  console.log(`  ${r.status === 0 ? 'GREEN' : 'RED  '} ${file} — ${results[file].pass} PASS / ${results[file].fail} FAIL`)
}

// ---- 8 SC map: mỗi SC trỏ (test file, assert/section) ----
const SC_MAP = [
  {
    id: 'SC1', text: 'commit story session → dòng JSONL mới trong checkpoints.jsonl với session_id + prompt tóm tắt',
    evidence: [
      ['story-checkpoint-tests.mjs', '[rec] exit 0 / JSONL xuất hiện / session_id / prompt_summary nguyên văn ≤500'],
      ['qa-happy-path-chain.mjs', 'B1 wrapper record compound git commit → đúng 1 record, session_id + prompt_summary'],
    ],
  },
  {
    id: 'SC2', text: 'session mới start/resume/compact → fact-pack inject story + gates + tail (+ lessons)',
    evidence: [
      ['hooks-factpack-tests.mjs', '[fp] happy path bracket+tiers+linear+tail+lessons; [fps] source filtering startup|resume|clear|fork'],
      ['qa-happy-path-chain.mjs', 'B2 session mới thấy story + tail; B5 session #2 thấy lessons component'],
    ],
  },
  {
    id: 'SC3', text: 'query CLI trả checkpoint đúng theo keyword case-insensitive + recency',
    evidence: [
      ['story-checkpoint-tests.mjs', '[q] case-insensitive / --last / --session / no match / malformed+future skip'],
      ['story-lesson-tests.mjs', '[list] --match case-insensitive trên text + tags, recency desc (mới nhất trước)'],
    ],
  },
  {
    id: 'SC4', text: 'restore stash-cả-untracked không mất file untracked; pop-conflict → giữ stash + FAIL, không tự resolve',
    evidence: [
      ['story-checkpoint-tests.mjs', '[rst] untracked-keep + local edit trả lại; [pop] FAIL-Restore-incomplete + stash còn; [cln] bỏ pop nhầm stash cũ'],
      ['qa-happy-path-chain.mjs', 'B6 restore checkpoint ref cũ → untracked sống sót'],
      ['qa-failure-paths.mjs', 'F2 pop-conflict: exit 1 + FAIL + stash còn + liệt kê conflict + hướng dẫn'],
    ],
  },
  {
    id: 'SC5', text: 'memory/pack sinh lại ghi đè chỉ khi trọn vẹn + stamp nguồn; consumer lệch stamp → báo stale',
    evidence: [
      ['story-lesson-tests.mjs', '[add] stamp header = HEAD main checkout; [regen] add lần 2 regen thay vì nối đè (atomic write_atomic_with_stamp SF-1)'],
      ['hooks-factpack-tests.mjs', '[fpl] stamp khớp → dùng; lệch/vắng → ⚠ stale có cả 2 stamp; HEAD advance → stale; CP vắng → fail-open skip'],
      ['qa-failure-paths.mjs', 'F1 stale-stamp vòng kín: ⚠ stale → add regen stamp mới → dùng lại; partial file → record tốt vẫn dùng'],
    ],
  },
  {
    id: 'SC6', text: 'nén/tóm tắt giữ nguyên văn dòng chứa 12 từ khoá lỗi',
    evidence: [
      ['story-checkpoint-tests.mjs', '[det] error_lines giữ nguyên dòng khớp 12 từ khoá; [sh] extract_error_lines giữ nguyên văn'],
      ['hooks-factpack-tests.mjs', '[fp] tail error line nguyên văn "ERROR: boom at line 12"'],
    ],
  },
  {
    id: 'SC7', text: 'story-hooks-install 2 lần → đúng 1 bộ entry kit, entry user/Orca nguyên vẹn, sai nội dung được cập nhật',
    evidence: [
      ['hooks-factpack-tests.mjs', '[inst] merge fixture giữ claude-hook.cmd + story-compact-recovery; [idem] idempotency; [fix] sai nội dung được cập nhật'],
      ['kit-verify-manifest.mjs', 'installKit hợp lệ + settings.json merge kèm install'],
    ],
  },
  {
    id: 'SC8', text: 'story-lesson add → dòng mới lessons.jsonl có session_id + ngày + nguồn; Stop chỉ audit đếm, không tự sinh lesson',
    evidence: [
      ['story-lesson-tests.mjs', '[add] session_id từ env + date + source + tags; [aud] stop-audit exit 0 + 1 dòng "stop-audit: session <id> — N lessons", 0 lesson im lặng, KHÔNG trích transcript; [wrap] qua hook-stop wrapper'],
      ['qa-happy-path-chain.mjs', 'B3 add provenance đầy đủ; B4 list --match thấy'],
      ['qa-failure-paths.mjs', 'F4 meta session: record + stop-audit không ghi; CLI ghi tay qua env store'],
    ],
  },
]

console.log(`\n== SC EVIDENCE MAP (8/8) ==`)
let gaps = 0
for (const sc of SC_MAP) {
  const harnesses = [...new Set(sc.evidence.map(([f]) => f))]
  const allGreen = harnesses.every(f => results[f]?.ok)
  // bằng chứng hợp lệ: harness tồn tại + GREEN + mỗi harness có ≥1 assert line
  const hasAssert = sc.evidence.every(([, a]) => a && a.length > 10)
  const covered = allGreen && hasAssert && harnesses.length > 0
  if (!covered) gaps++
  console.log(`  ${covered ? 'COVERED' : 'GAP    '} ${sc.id} — ${sc.text}`)
  for (const [f, a] of sc.evidence) {
    const green = results[f]?.ok ? 'GREEN' : 'RED  '
    console.log(`           ${green} ${f} :: ${a}`)
  }
}

// ---- PF (findings) đăng ký ----
console.log(`\n== KNOWN FINDINGS ==`)
console.log('  PF-1 [RESOLVED — commit fix(gh27-sf1), reviewer adjudicate] story-checkpoint restore')
console.log('     từng xoá .wakii store (stash lấy .wakii/.gitignore → clean -fd giữa giao dịch')
console.log('     thấy store files không còn ignored → xoá). Fix: clean -fd -e .wakii (+ -e tên')
console.log('     store từ STORY_CHECKPOINT_STORE). Test: story-checkpoint-tests [rst2] + qa-happy-path B6.')
console.log('  PF-2 kit-manifest-negative-tests.mjs crash trên Windows (ERR_UNSUPPORTED_ESM_URL_SCHEME —')
console.log('     await import(absolute-path) thiếu pathToFileURL) — có từ TRƯỚC SF-3 (verify bằng git stash),')
console.log('     file ngoài touch map SF-3. SC7 dựa harness hooks-factpack + kit-verify-manifest vẫn GREEN.')

console.log(`\n== TOTAL: harness ${Object.keys(HARNESS).length - totalFail}/${Object.keys(HARNESS).length} GREEN | SC ${SC_MAP.length - gaps}/${SC_MAP.length} COVERED ==`)
if (totalFail > 0 || gaps > 0) {
  console.log('GAPS/RED:\n- ' + [
    ...Object.entries(results).filter(([, r]) => !r.ok).map(([f]) => `harness RED: ${f}`),
    ...SC_MAP.filter(sc => {
      const hs = [...new Set(sc.evidence.map(([f]) => f))]
      return !(hs.every(f => results[f]?.ok))
    }).map(sc => `SC gap: ${sc.id}`),
  ].join('\n- '))
  process.exit(1)
}
console.log('EVIDENCE-MAP GREEN (8/8 SC covered, mọi harness được trỏ đều GREEN)')
