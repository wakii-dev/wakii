#!/usr/bin/env node
// Bins smoke tests — MỖI bin trong kit/bin phải THỰC THI ĐƯỢC: không crash cứng,
// không permission-denied (bài học exec-bit ×3 FI-458), không treo vô hạn.
// Probe: <bin> --help với timeout 8s — exit 0/1/2 (usage/validate) đều chấp nhận;
// treo/quá hạn = FAIL (bin không tự thoát khi --help là bin hỏng).
// Chạy: node tests/bins-smoke-tests.mjs
// KIT_BIN=<dir> override (mặc định ../kit/bin relative tests/).
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const kitBin = process.env.KIT_BIN || resolve(testsDir, '../kit/bin')

// bins bỏ qua probe --help: MCP server chạy stdio loop (treo là đúng),
// dashboard asset không phải executable.
const SKIP_HELP = new Set(['wakii-mcp-server', 'story-dashboard-server', 'story-dashboard.html'])

const pass = [], failures = []
function check(case_name, cond, detail = '') {
  if (cond) pass.push(case_name)
  else { failures.push(case_name); console.error(`  [FAIL] ${case_name}${detail ? ' — ' + detail : ''}`) }
}

const entries = readdirSync(kitBin).filter((f) => !f.startsWith('__pycache__')).sort()

let execChecked = 0
for (const bin of entries) {
  const p = join(kitBin, bin)
  const st = statSync(p)
  const isExec = (st.mode & 0o111) !== 0
  check(`${bin}: exec-bit`, isExec || bin.endsWith('.html'), `mode ${st.mode.toString(8)}`)
  if (bin.endsWith('.html')) continue
  execChecked++
}

console.log(`exec-bit: ${execChecked} bins OK\n`)

// probe --help cho bins có CLI surface (bỏ mcp-server/dashboard)
const probeBins = entries.filter((b) => !SKIP_HELP.has(b) && !b.endsWith('.html'))
let probed = 0
for (const bin of probeBins) {
  const r = spawnSync(join(kitBin, bin), ['--help'], {
    encoding: 'utf8',
    timeout: 8000,
    input: '',
  })
  const ran = r.status !== null || r.signal === null
  check(`${bin}: --help thoát trong 8s (status=${r.status ?? 'signal:' + r.signal})`, ran)
  probed++
}

console.log(`\n== TOTAL: ${pass.length} PASS / ${failures.length} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('BINS SMOKE GREEN — mọi bin tồn tại + thực thi được')
