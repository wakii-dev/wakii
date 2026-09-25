#!/usr/bin/env node
// story-doctor bin tests (GH-85 SF-1) — fixture install root qua --root temp
// (KHÔNG đụng ~/.claude thật): khoẻ PASS, marker sai → FAIL c1, hash sai → FAIL
// c2, thiếu bin → FAIL c3, python/node không chạy → FAIL c4 (mock PATH), settings
// malformed/thiếu hook → FAIL c5, KB vắng → WARN, orphan → WARN, agents/skills
// thiếu → FAIL c8, --json parse được. Chạy: node tests/story-doctor-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync, statSync, rmSync, chmodSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const BIN = resolve(pluginRoot, 'kit/bin/story-doctor')
const KIT_ROOT = resolve(pluginRoot, 'kit')
const kitJson = JSON.parse(readFileSync(join(KIT_ROOT, 'kit.json'), 'utf8'))
const VER = kitJson.version
const HASH = kitJson.kitHash

// Resolve python launcher + absolute path (Windows Store stub 'python3' 9009 →
// fallback 'python' rồi 'py' — pattern kb-tests; absolute path cần cho case
// PATH-rỗng vì spawn theo tên sẽ chết trước khi tới story-doctor).
let PY, PY_ABS
for (const name of ['python3', 'python', 'py']) {
  const r = spawnSync(name, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 15000 })
  if (r.status === 0 && r.stdout.trim()) { PY = name; PY_ABS = r.stdout.trim(); break }
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

function run(args, opts = {}) {
  return spawnSync(PY, [BIN, ...args], { encoding: 'utf8', timeout: 60000, ...opts })
}

// ---- Fixture: lắp install root từ kit tree thật ------------------------------
// Copy bin/agents/skills (bỏ __pycache__/.pyc) + ghi marker + settings.json
// hooks. story-doctor spawn từ KIT source (kit.json sibling = repo) trừ case
// fxSized (kit root = chính fixture, kit.json mutated).
function copyTree(src, dst) {
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    if (ent.name === '__pycache__' || ent.name === '.DS_Store' || ent.name.endsWith('.pyc')) continue
    const from = join(src, ent.name)
    const to = join(dst, ent.name)
    if (ent.isDirectory()) { mkdirSync(to, { recursive: true }); copyTree(from, to) }
    else { cpSync(from, to); if (process.platform !== 'win32') chmodSync(to, 0o755) }
  }
}

function hookSettings(root) {
  const binDir = join(root, 'bin')
  const hook = f => ({ type: 'command', command: join(binDir, f), timeout: 10 })
  return JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [hook('hook-session-start')] }],
      PostToolUse: [{ matcher: 'Bash', hooks: [hook('hook-post-tool-use')] }],
      Stop: [{ hooks: [hook('hook-stop')] }],
      // c9 (GH-87): guards wired — command chứa /story-guard-* mà doctor quét
      PreToolUse: [
        { matcher: 'Bash', hooks: [hook('story-guard-secrets')] },
        { matcher: 'Bash', hooks: [hook('story-guard-dangerous')] },
        { matcher: 'Edit|Write|MultiEdit', hooks: [hook('story-guard-envfiles')] },
      ],
    },
  }, null, 2)
}

function makeFixture({ marker = `${VER}:${HASH}`, settings = hookSettings, extraBins = [] } = {}) {
  const fx = mkdtempSync(join(tmpdir(), 'doctor-tests-'))
  for (const sub of ['bin', 'agents', 'skills']) {
    mkdirSync(join(fx, sub), { recursive: true })
    copyTree(join(KIT_ROOT, sub), join(fx, sub))
  }
  for (const name of extraBins) writeFileSync(join(fx, 'bin', name), '#!/bin/sh\nlegacy\n')
  if (marker !== null) writeFileSync(join(fx, '.story-team-kit-version'), marker)
  if (settings !== null) writeFileSync(join(fx, 'settings.json'), settings(fx))
  return fx
}

// KB vắng: cwd trống không-git + xoá WAKII_KB_DIR — không dính KB thật.
const emptyCwd = mkdtempSync(join(tmpdir(), 'doctor-tests-cwd-'))
const noKbEnv = { ...process.env }
delete noKbEnv.WAKII_KB_DIR

// ---- DR1: khoẻ — mọi check PASS trừ KB WARN, exit 0 ---------------------------
console.log('== [DR1] khoẻ — full fixture, exit 0, --json parse ==')
{
  const fx = makeFixture()
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR1', 'exit 0', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  let out = null
  try { out = JSON.parse(r.stdout) } catch (e) { check('DR1', 'json parse', false, String(e)) }
  if (out) {
    check('DR1', '9 checks', Array.isArray(out.checks) && out.checks.length === 9, `got ${out.checks && out.checks.length}`)
    check('DR1', 'exit field ok', out.exit === 'ok', `got ${JSON.stringify(out.exit)}`)
    const by = Object.fromEntries((out.checks || []).map(c => [c.name, c]))
    for (const name of ['marker', 'kit-hash', 'bins', 'deps', 'hooks', 'kb', 'orphans', 'agents-skills', 'hooks-manifests'])
      check('DR1', `check ${name} hiện diện`, !!by[name])
    for (const name of ['marker', 'kit-hash', 'bins', 'deps', 'hooks', 'orphans', 'agents-skills', 'hooks-manifests'])
      check('DR1', `${name} PASS`, by[name] && by[name].status === 'pass', by[name] && by[name].status + ': ' + by[name].detail)
    check('DR1', 'kb WARN (KB chưa config)', by.kb && by.kb.status === 'warn', by.kb && by.kb.status)
    for (const c of out.checks || [])
      check('DR1', `${c.name} schema name/status/detail/fix`, typeof c.name === 'string' && typeof c.status === 'string' && typeof c.detail === 'string' && 'fix' in c)
    // kit-hash PASS trên kit source = thuật toán python khớp computeKitHash node
    check('DR1', 'kit-hash khớp hash node (computeKitHash parity)', by['kit-hash'] && by['kit-hash'].status === 'pass', by['kit-hash'] && by['kit-hash'].detail)
  }
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR2: text mode readable + exit 0 -----------------------------------------
console.log('== [DR2] text mode — [PASS]/[WARN] prefix + tổng kết ==')
{
  const fx = makeFixture()
  const r = run(['--root', fx], { cwd: emptyCwd, env: noKbEnv })
  check('DR2', 'exit 0', r.status === 0, `code=${r.status}`)
  check('DR2', '[PASS] marker:', r.stdout.includes('[PASS] marker:'), r.stdout)
  check('DR2', '[WARN] kb:', r.stdout.includes('[WARN] kb:'), r.stdout)
  check('DR2', 'tổng kết PASS/WARN/FAIL', /== \d+ PASS \/ \d+ WARN \/ \d+ FAIL ==/.test(r.stdout), r.stdout)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR3: marker sai version → FAIL c1, exit 1 --------------------------------
console.log('== [DR3] marker sai version → FAIL marker ==')
{
  const fx = makeFixture({ marker: '9.9.9:' + HASH })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR3', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'marker')
  check('DR3', 'marker FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR3', 'detail nêu version lệch', c && c.detail.includes('9.9.9'), c && c.detail)
  check('DR3', 'có fix hint', c && typeof c.fix === 'string' && c.fix.length > 0)
  check('DR3', 'exit field fail', out.exit === 'fail')
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR4: marker format hỏng → FAIL c1 ----------------------------------------
console.log('== [DR4] marker rác → FAIL marker ==')
{
  const fx = makeFixture({ marker: 'khong-phai-version' })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR4', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'marker')
  check('DR4', 'marker FAIL sai format', c && c.status === 'fail' && c.detail.includes('format'), c && JSON.stringify(c))
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR5: kitHash khai sai (fixture kit-root riêng) → FAIL c2 -----------------
console.log('== [DR5] kit.json kitHash lệch tree → FAIL kit-hash ==')
{
  const fx = makeFixture()
  // story-doctor + kit.json mutated trong CHÍNH fixture → kit root = fixture
  cpSync(BIN, join(fx, 'bin', 'story-doctor'))
  writeFileSync(join(fx, 'kit.json'), JSON.stringify({ ...kitJson, kitHash: 'deadbeefdeadbeef' }, null, 2))
  // kit root = fixture → spawn bin TRONG fixture (run() tự gắn BIN repo — sai)
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR5', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'kit-hash')
  check('DR5', 'kit-hash FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR5', 'detail nêu declared vs actual', c && c.detail.includes('deadbeef'), c && c.detail)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR6: thiếu 1 bin → FAIL c3, exit 1 ---------------------------------------
console.log('== [DR6] thiếu bin story-kb → FAIL bins ==')
{
  const fx = makeFixture()
  rmSync(join(fx, 'bin', 'story-kb'))
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR6', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'bins')
  check('DR6', 'bins FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR6', 'detail nêu tên thiếu', c && c.detail.includes('story-kb'), c && c.detail)
  check('DR6', 'fix hint gợi ý copy từ kit', c && c.fix && c.fix.includes('bin'), c && c.fix)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR7: exec-bit mất (POSIX only) → FAIL c3 ---------------------------------
console.log('== [DR7] exec-bit (POSIX only) ==')
{
  const fx = makeFixture()
  if (process.platform === 'win32') {
    console.log('  [SKIP] Windows NTFS không represent exec-bit')
    pass++
  } else {
    chmodSync(join(fx, 'bin', 'story-kb'), 0o644)
    const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
    check('DR7', 'exit 1', r.status === 1, `code=${r.status}`)
    const out = JSON.parse(r.stdout)
    const c = out.checks.find(x => x.name === 'bins')
    check('DR7', 'bins FAIL non-exec', c && c.status === 'fail' && c.detail.includes('story-kb'), c && JSON.stringify(c))
  }
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR8: python/node không chạy được (PATH rỗng) → FAIL c4 -------------------
console.log('== [DR8] deps — PATH rỗng → FAIL deps ==')
{
  const fx = makeFixture()
  // spawn bằng ABS path (PATH='' làm spawnSync theo tên ENOENT trước khi vào bin)
  const r = spawnSync(PY_ABS, [BIN, '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: { ...noKbEnv, PATH: '' } })
  check('DR8', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'deps')
  check('DR8', 'deps FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  // Windows CreateProcess search app-dir của python.exe → python sống sót dù
  // PATH='' — chỉ POSIX là cả hai chết.
  if (process.platform === 'win32') {
    check('DR8', 'detail nêu node chết', c && c.detail.toLowerCase().includes('node'), c && c.detail)
  } else {
    check('DR8', 'detail nhắc python', c && c.detail.toLowerCase().includes('python'), c && c.detail)
  }
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR9: settings.json malformed / thiếu hooks → FAIL c5 ---------------------
console.log('== [DR9] settings.json hỏng → FAIL hooks ==')
{
  const fx = makeFixture({ settings: () => '{khong-phai-json' })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR9', 'exit 1 (malformed)', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'hooks')
  check('DR9', 'hooks FAIL malformed', c && c.status === 'fail' && c.detail.includes('JSON'), c && JSON.stringify(c))
  rmSync(fx, { recursive: true, force: true })

  const fx2 = makeFixture({ settings: () => '{}' })
  const r2 = run(['--root', fx2, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR9', 'exit 1 (thiếu entries)', r2.status === 1, `code=${r2.status}`)
  const out2 = JSON.parse(r2.stdout)
  const c2 = out2.checks.find(x => x.name === 'hooks')
  check('DR9', 'hooks FAIL liệt kê event thiếu', c2 && c2.status === 'fail'
    && c2.detail.includes('SessionStart') && c2.detail.includes('Stop'), c2 && JSON.stringify(c2))
  rmSync(fx2, { recursive: true, force: true })
}

// ---- DR10: KB vắng → WARN, exit 0; --kb-dir override → PASS -------------------
console.log('== [DR10] KB fail-open WARN + --kb-dir ==')
{
  const fx = makeFixture()
  const r = run(['--root', fx], { cwd: emptyCwd, env: noKbEnv })
  check('DR10', 'exit 0 (WARN không FAIL)', r.status === 0, `code=${r.status}`)
  check('DR10', '[WARN] kb: not configured', r.stdout.includes('[WARN] kb:') && r.stdout.includes('not configured'), r.stdout)
  // --kb-dir trỏ fixture KB nhỏ → PASS
  const kbFx = mkdtempSync(join(tmpdir(), 'doctor-tests-kb-'))
  mkdirSync(join(kbFx, 'adr'), { recursive: true })
  writeFileSync(join(kbFx, 'adr', '0001-x.md'), '# x\n')
  const r2 = run(['--root', fx, '--kb-dir', kbFx], { cwd: emptyCwd, env: noKbEnv })
  check('DR10', '--kb-dir → [PASS] kb configured', r2.stdout.includes('[PASS] kb:') && r2.stdout.includes(kbFx), r2.stdout)
  // --kb-dir trỏ dir KHÔNG marker → WARN (không PASS false-healthy — review P1,
  // par story-kb:75 is_kb_dir)
  const junkFx = mkdtempSync(join(tmpdir(), 'doctor-tests-kb-junk-'))
  const r3 = run(['--root', fx, '--kb-dir', junkFx], { cwd: emptyCwd, env: noKbEnv })
  check('DR10', '--kb-dir dir-rác → [WARN] kb (không PASS)', r3.stdout.includes('[WARN] kb:') && !r3.stdout.includes('[PASS] kb:'), r3.stdout)
  check('DR10', 'dir-rác exit vẫn 0', r3.status === 0, `code=${r3.status}`)
  rmSync(junkFx, { recursive: true, force: true })
  rmSync(fx, { recursive: true, force: true })
  rmSync(kbFx, { recursive: true, force: true })
}

// ---- DR11: orphan file → WARN c7, exit 0 --------------------------------------
console.log('== [DR11] orphan bin → WARN orphans ==')
{
  const fx = makeFixture({ extraBins: ['zzz-legacy-orphan'] })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR11', 'exit 0 (orphan chỉ WARN)', r.status === 0, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'orphans')
  check('DR11', 'orphans WARN', c && c.status === 'warn', c && JSON.stringify(c))
  check('DR11', 'detail nêu tên orphan', c && c.detail.includes('zzz-legacy-orphan'), c && c.detail)
  check('DR11', 'fix gợi ý xoá', c && c.fix && c.fix.toLowerCase().includes('xoá'), c && c.fix)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR12: thiếu agent file → FAIL c8 -----------------------------------------
console.log('== [DR12] agents/skills thiếu → FAIL agents-skills ==')
{
  const fx = makeFixture()
  rmSync(join(fx, 'agents', 'verifier.md'))
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR12', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'agents-skills')
  check('DR12', 'agents-skills FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR12', 'detail nêu agent thiếu', c && c.detail.includes('verifier'), c && c.detail)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR13: marker vắng hoàn toàn → FAIL c1 (chưa cài) --------------------------
console.log('== [DR13] chưa cài (marker vắng) → FAIL marker ==')
{
  const fx = makeFixture({ marker: null })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR13', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'marker')
  check('DR13', 'marker FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR13', 'fix gợi ý cài lại', c && c.fix && c.fix.length > 0)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR14: usage errors --------------------------------------------------------
console.log('== [DR14] usage ==')
{
  const r = run(['--root'])
  check('DR14', '--root thiếu value → exit 2', r.status === 2, `code=${r.status}`)
  const r2 = run(['--root', emptyCwd, '--kb-dir'])
  check('DR14', '--kb-dir thiếu value → exit 2', r2.status === 2, `code=${r2.status}`)
}

rmSync(emptyCwd, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (story-doctor 14 DR)')
