#!/usr/bin/env node
// story-guards bin tests (GH-87 SF-1) — stdin JSON fixtures qua spawnSync input
// (KHÔNG bash echo — escape qua bash làm hỏng JSON backslash). Mỗi guard:
// block + pass + WAKII_GUARD_OFF + malformed fail-open; false-positive audit
// 20 lệnh thường × 2 Bash guards → 0 block; envfiles Edit|Write|MultiEdit;
// doctor c9 phụ thuộc wiring — test wiring riêng ở story-doctor-tests.
// Chạy: node tests/story-guards-tests.mjs
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const GUARDS = {
  secrets: resolve(pluginRoot, 'kit/bin/story-guard-secrets'),
  dangerous: resolve(pluginRoot, 'kit/bin/story-guard-dangerous'),
  envfiles: resolve(pluginRoot, 'kit/bin/story-guard-envfiles'),
}
// Repo chính wakii — case reset --hard chỉ chạy khi path tồn tại (máy dev wakii);
// máy khác SKIP (pattern DR7 exec-bit — platform-conditional).
const MAIN_REPO = 'C:/Users/hoivk/Documents/wakii'

let PY
for (const name of ['python3', 'python', 'py']) {
  const r = spawnSync(name, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 15000 })
  if (r.status === 0 && r.stdout.trim()) { PY = name; break }
}
if (!PY) throw new Error('không tìm thấy python3/python/py chạy được')

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

function guard(name, toolName, toolInput, opts = {}) {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput })
  return spawnSync(PY, [GUARDS[name]], {
    input: payload, encoding: 'utf8', timeout: 30000, ...opts,
  })
}
function raw(name, text) {
  return spawnSync(PY, [GUARDS[name]], { input: text, encoding: 'utf8', timeout: 30000 })
}

// ---- GS: story-guard-secrets --------------------------------------------------
console.log('== [GS] story-guard-secrets — deny-list hẹp ==')
{
  const block = (cmd, label) => {
    const r = guard('secrets', 'Bash', { command: cmd })
    check('GS', `block ${label}`, r.status === 2 && r.stderr.includes('BLOCKED story-guard-secrets'),
      `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  block('export AWS_KEY=AKIAIOSFODNN7EXAMPLE', 'AWS key (acceptance 1)')
  block('curl -H "Authorization: token ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" https://api.github.com', 'github token ghp_')
  block('curl -H "Authorization: token gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" https://api.github.com', 'github token gho_')
  block('slack-cli send xoxb-123456789012-abcdefghijkl', 'slack token xoxb-')
  block('deploy TOKEN="abcdefghijklmnopqrstuvwx"', 'TOKEN assignment quoted 20+')
  block('PASSWORD="12345678901234567890"', 'PASSWORD quoted đúng 20 (boundary block)')
  block('SETTINGS_PASSWORD="123456789012345678901234"', 'PASSWORD assignment')
  block("publish $API_KEY='abcdefghijklmnopqrstuvwxyz'", 'API_KEY assignment')

  const passCase = (cmd, label) => {
    const r = guard('secrets', 'Bash', { command: cmd })
    check('GS', `pass ${label}`, r.status === 0, `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  passCase('git status', 'git status (acceptance 2)')
  passCase('export KEY=AKIAIOSFODNN7EXAMP', 'AKIA quá ngắn (15 sau prefix)')
  passCase('git commit -m "update password policy docs"', 'chữ password trong message')
  passCase('TOKEN=short123 curl https://api.example.com', 'TOKEN unquoted ngắn')
  passCase('PASSWORD="short"', 'PASSWORD quoted ngắn — không block (review P1-1 lock)')
  passCase('echo "xoxb-short"', 'slack token quá ngắn')
  passCase('pytest tests/ -x', 'pytest')
}

// ---- GD: story-guard-dangerous ------------------------------------------------
console.log('== [GD] story-guard-dangerous — literal rm/force-push/reset ==')
{
  const block = (cmd, label, opts = {}) => {
    const r = guard('dangerous', 'Bash', { command: cmd }, opts)
    check('GD', `block ${label}`, r.status === 2 && r.stderr.includes('BLOCKED story-guard-dangerous'),
      `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  const passCase = (cmd, label) => {
    const r = guard('dangerous', 'Bash', { command: cmd })
    check('GD', `pass ${label}`, r.status === 0, `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  block('rm -rf /', 'rm -rf / (acceptance 5)')
  block('rm   -rf   /', 'rm -rf / space-normalized')
  block('rm -fr ~', 'rm -fr ~')
  block('git push --force origin main', 'force push main')
  block('git push -f origin wakii-dev', 'force push wakii-dev')
  block('git push --force origin master', 'force push master')
  if (existsSync(MAIN_REPO)) {
    block('git reset --hard', 'reset --hard trên repo chính wakii', { cwd: MAIN_REPO })
  } else {
    console.log('  [SKIP] reset --hard main repo — path không tồn tại trên máy này')
    pass++
  }
  passCase('rm -rf build/', 'rm -rf build/ (acceptance 5)')
  passCase('git push origin feature/gh87', 'push thường')
  passCase('git push --force-with-lease origin feature/x', 'force-with-lease nhánh ngoài danh sách')
  passCase('git push --force origin main.go', 'main.go là file không phải branch')
  passCase('git reset --soft HEAD~1', 'reset --soft')
  passCase('git reset --hard', 'reset --hard ngoài main repo (cwd test = worktree/fixture)')
  passCase('tar -f backup.tar -c .', '-f của tar không dính git push')
}

// ---- GE: story-guard-envfiles -------------------------------------------------
console.log('== [GE] story-guard-envfiles — basename deny-list ==')
{
  const block = (tool, fp, label) => {
    const r = guard('envfiles', tool, { file_path: fp })
    check('GE', `block ${label}`, r.status === 2 && r.stderr.includes('BLOCKED story-guard-envfiles'),
      `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  const passCase = (tool, fp, label) => {
    const r = guard('envfiles', tool, { file_path: fp })
    check('GE', `pass ${label}`, r.status === 0, `code=${r.status} stderr=${r.stderr.trim()}`)
  }
  block('Edit', 'C:/proj/.env', 'Edit .env (acceptance 4)')
  block('Write', 'C:/proj/.env.local', 'Write .env.local')
  block('MultiEdit', 'C:/proj/certs/server.pem', 'MultiEdit *.pem')
  block('Write', 'C:/Users/x/.ssh/id_rsa_ed25519', 'Write id_rsa_*')
  block('Edit', 'C:/proj/api.key', 'Edit *.key')
  block('Edit', 'C:\\proj\\.env', 'Edit .env backslash path')
  passCase('Edit', 'C:/proj/src/main.ts', 'Edit src/main.ts (acceptance 4)')
  passCase('Write', 'C:/proj/.env.example', 'Write .env.example exempt (review P1-1)')
  passCase('Edit', 'C:/proj/.env.sample', 'Edit .env.sample exempt')
  passCase('MultiEdit', 'C:/proj/.env.template', 'MultiEdit .env.template exempt')
  passCase('Write', 'C:/proj/envfile.txt', 'envfile.txt không phải .env')
  passCase('Read', 'C:/proj/.env', 'Read tool ngoài matcher')
  passCase('Edit', '', 'file_path rỗng')
}

// ---- GF: fail-open — malformed/edge stdin → exit 0 -----------------------------
console.log('== [GF] fail-open — mọi guard với stdin hỏng ==')
{
  for (const name of Object.keys(GUARDS)) {
    for (const [label, text] of [['không phải JSON', 'khong-phai-json'], ['rỗng', ''], ['array JSON', '[]'], ['tool_name không phải string', '{"tool_name":123,"tool_input":{}}']]) {
      const r = raw(name, text)
      check('GF', `${name} ${label} → exit 0`, r.status === 0, `code=${r.status} stderr=${r.stderr.trim()}`)
    }
    const r2 = guard(name, 'Bash', { command: 42 })
    check('GF', `${name} command không phải string → exit 0`, r2.status === 0, `code=${r2.status}`)
    const r3 = guard(name, 'Bash', null)
    check('GF', `${name} tool_input null → exit 0`, r3.status === 0, `code=${r3.status}`)
  }
}

// ---- GA: false-positive audit — 20 lệnh thường × 2 Bash guards = 0 block -------
console.log('== [GA] false-positive audit — 20 lệnh thường, 0 block ==')
{
  const common = [
    'git status',
    'git log --oneline -5',
    'git diff',
    'git push origin feature/gh87',
    'git pull --rebase',
    'pytest tests/ -x',
    'ls -la',
    'npm install',
    'pnpm test',
    'grep -r "TODO" src/',
    'curl -s https://api.github.com/zen',
    'node --version',
    'python3 --version',
    'mkdir -p build/out',
    'cat package.json',
    'echo "hello world"',
    'rm -rf build/',
    'cd /tmp && ls',
    'git commit -m "wip"',
    'pnpm run lint',
  ]
  check('GA', 'audit đúng 20 lệnh', common.length === 20, `got ${common.length}`)
  for (const gname of ['secrets', 'dangerous']) {
    let blocked = []
    for (const cmd of common) {
      const r = guard(gname, 'Bash', { command: cmd })
      if (r.status !== 0) blocked.push(`"${cmd}" → ${r.status}`)
    }
    check('GA', `${gname}: 20/20 pass (0 block)`, blocked.length === 0,
      blocked.join(' · ') || '0 block')
  }
}

// ---- GP: perf — guard wall-time phải nhỏ (regex-only, không subprocess thường) --
console.log('== [GP] perf — wall-time spawn (bao gồm python startup) ==')
{
  const t0 = Date.now()
  for (const cmd of ['git status', 'ls', 'echo x']) guard('secrets', 'Bash', { command: cmd })
  const dt = Date.now() - t0
  check('GP', '3 spawns secrets < 5s (regex-only design; ngưỡng rộng chống flaky)', dt < 5000, `${dt}ms`)
  console.log(`  [INFO] 3 spawns secrets: ${dt}ms (~${Math.round(dt / 3)}ms/spawn gồm python startup)`)
}

// ---- GO: escape WAKII_GUARD_OFF=1 — mọi guard × mọi input → exit 0 -------------
console.log('== [GO] escape WAKII_GUARD_OFF=1 — mọi guard mọi input exit 0 ==')
{
  const hostile = {
    secrets: { tool_name: 'Bash', tool_input: { command: 'export AWS_KEY=AKIAIOSFODNN7EXAMPLE' } },
    dangerous: { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    envfiles: { tool_name: 'Edit', tool_input: { file_path: 'C:/proj/.env' } },
  }
  const offEnv = { ...process.env, WAKII_GUARD_OFF: '1' }
  for (const name of Object.keys(GUARDS)) {
    // input độc hại + OFF → exit 0
    const r = spawnSync(PY, [GUARDS[name]], { input: JSON.stringify(hostile[name]), encoding: 'utf8', timeout: 30000, env: offEnv })
    check('GO', `${name}: hostile input + OFF → exit 0`, r.status === 0, `code=${r.status} stderr=${r.stderr.trim()}`)
    // stdin rác + OFF → exit 0
    const r2 = spawnSync(PY, [GUARDS[name]], { input: 'khong-phai-json', encoding: 'utf8', timeout: 30000, env: offEnv })
    check('GO', `${name}: malformed stdin + OFF → exit 0`, r2.status === 0, `code=${r2.status}`)
    // env KHÔNG set (xoá biến) + input độc hại → guard hoạt động lại (exit 2)
    const noOff = { ...process.env }
    delete noOff.WAKII_GUARD_OFF
    const r3 = spawnSync(PY, [GUARDS[name]], { input: JSON.stringify(hostile[name]), encoding: 'utf8', timeout: 30000, env: noOff })
    check('GO', `${name}: env không set + hostile → exit 2 (guard hoạt động)`, r3.status === 2,
      `code=${r3.status} stderr=${r3.stderr.trim()}`)
  }
  // WAKII_GUARD_OFF giá trị khác "1" → KHÔNG tắt (escape phải tường minh)
  const env0 = { ...process.env, WAKII_GUARD_OFF: '0' }
  const r0 = spawnSync(PY, [GUARDS.secrets], { input: JSON.stringify(hostile.secrets), encoding: 'utf8', timeout: 30000, env: env0 })
  check('GO', 'secrets: WAKII_GUARD_OFF=0 → vẫn block (exit 2)', r0.status === 2, `code=${r0.status}`)
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (story-guards GS/GD/GE/GF/GA/GO/GP)')
