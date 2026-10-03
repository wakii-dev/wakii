#!/usr/bin/env node
// story-doctor bin tests (GH-85 SF-1) — fixture install root qua --root temp
// (KHÔNG đụng ~/.claude thật): khoẻ PASS, marker sai → FAIL c1, hash sai → FAIL
// c2, thiếu bin → FAIL c3, python/node không chạy → FAIL c4 (mock PATH), settings
// malformed/thiếu hook → FAIL c5, KB vắng → WARN, orphan → WARN, agents/skills
// thiếu → FAIL c8, --json parse được. ECC-6: --repair chữa marker drift +
// exec-bit + orphan (không clobber settings.json), --uninstall PLAN/--yes xoá
// đúng provides + marker (giữ file user), root trống không crash.
// Chạy: node tests/story-doctor-tests.mjs
// LƯU Ý: suite assert kit.json kitHash khớp kit/ tree (DR1 parity) — sau khi sửa
// kit/ phải rehash kit.json trước thì DR1/DR16 mới xanh (rehash do coordinator).
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
  return JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [mkHook(binDir, 'hook-session-start')] }],
      PostToolUse: [{ matcher: 'Bash', hooks: [mkHook(binDir, 'hook-post-tool-use')] }],
      Stop: [{ hooks: [mkHook(binDir, 'hook-stop')] }],
      // c9 (GH-87): guards wired — command chứa /story-guard-* mà doctor quét
      PreToolUse: [
        { matcher: 'Bash', hooks: [mkHook(binDir, 'story-guard-secrets')] },
        { matcher: 'Bash', hooks: [mkHook(binDir, 'story-guard-dangerous')] },
        { matcher: 'Edit|Write|MultiEdit', hooks: [mkHook(binDir, 'story-guard-envfiles')] },
      ],
    },
  }, null, 2)
}

const mkHook = (binDir, f) => ({ type: 'command', command: join(binDir, f), timeout: 10 })

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

// ---- DR15: c9 hooks-manifests — WARN thiếu wiring · skip kit/hooks vắng · manifest hỏng
console.log('== [DR15] c9 hooks-manifests ==')
{
  // 15a: settings không wiring guards (kit root = KIT source có manifests) → WARN + fix hint
  const fx = makeFixture({
    settings: root => JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: join(root, 'bin', 'hook-session-start'), timeout: 10 }] }],
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: join(root, 'bin', 'hook-post-tool-use'), timeout: 10 }] }],
        Stop: [{ hooks: [{ type: 'command', command: join(root, 'bin', 'hook-stop'), timeout: 10 }] }],
      },
    }),
  })
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR15', '15a exit 0 (WARN không FAIL)', r.status === 0, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'hooks-manifests')
  check('DR15', '15a WARN thiếu wiring', c && c.status === 'warn' && c.detail.includes('story-guard-secrets'), c && JSON.stringify(c))
  check('DR15', '15a fix hint chạy story-hooks-install', c && c.fix && c.fix.includes('story-hooks-install'), c && c.fix)
  rmSync(fx, { recursive: true, force: true })

  // 15b: kit root riêng KHÔNG hooks/ → skip im lặng (check không xuất hiện)
  const fx2 = makeFixture()
  cpSync(BIN, join(fx2, 'bin', 'story-doctor'))
  writeFileSync(join(fx2, 'kit.json'), JSON.stringify(kitJson, null, 2))
  const r2 = spawnSync(PY, [join(fx2, 'bin', 'story-doctor'), '--root', fx2, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  const out2 = JSON.parse(r2.stdout)
  check('DR15', '15b kit/hooks vắng → skip im lặng',
    !out2.checks.some(x => x.name === 'hooks-manifests'),
    JSON.stringify(out2.checks.map(x => x.name)))
  check('DR15', '15b 8 checks (không c9)', out2.checks.length === 8, `got ${out2.checks.length}`)
  rmSync(fx2, { recursive: true, force: true })

  // 15c: manifest JSON hỏng trong kit root riêng → WARN manifest hỏng
  const fx3 = makeFixture()
  cpSync(BIN, join(fx3, 'bin', 'story-doctor'))
  writeFileSync(join(fx3, 'kit.json'), JSON.stringify(kitJson, null, 2))
  mkdirSync(join(fx3, 'hooks'), { recursive: true })
  cpSync(join(KIT_ROOT, 'hooks', 'story-guard-secrets.json'), join(fx3, 'hooks', 'story-guard-secrets.json'))
  writeFileSync(join(fx3, 'hooks', 'story-guard-broken.json'), '{hong')
  const r3 = spawnSync(PY, [join(fx3, 'bin', 'story-doctor'), '--root', fx3, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  const out3 = JSON.parse(r3.stdout)
  const c3 = out3.checks.find(x => x.name === 'hooks-manifests')
  check('DR15', '15c manifest hỏng → WARN broken (wired hợp lệ vẫn đếm)', c3 && c3.status === 'warn' && c3.detail.includes('story-guard-broken'), c3 && JSON.stringify(c3))
  rmSync(fx3, { recursive: true, force: true })
}

// ---- DR16: --repair chữa marker drift + exec-bit + orphan → re-check PASS -----
console.log('== [DR16] --repair — marker drift + exec-bit + orphan ==')
{
  const fx = makeFixture({ marker: '9.9.9:' + HASH, extraBins: ['zzz-legacy-orphan'] })
  // retired skill dir (RETIRED_SKILL_DIRS trong main.mjs) — installKit phải dọn
  mkdirSync(join(fx, 'skills', 'gpt-taste'), { recursive: true })
  writeFileSync(join(fx, 'skills', 'gpt-taste', 'SKILL.md'), 'retired orphan')
  if (process.platform !== 'win32') chmodSync(join(fx, 'bin', 'story-kb'), 0o644)
  const r = run(['--root', fx, '--repair'], { cwd: emptyCwd, env: noKbEnv, timeout: 120000 })
  check('DR16', 'exit 0 (hết FAIL)', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  check('DR16', 'log action installKit', r.stdout.includes('installKit OK'), r.stdout)
  check('DR16', 'bảng before/after có marker FAIL → PASS', /marker\s+FAIL\s+→\s+PASS/.test(r.stdout), r.stdout)
  const markerAfter = existsSync(join(fx, '.story-team-kit-version'))
    ? readFileSync(join(fx, '.story-team-kit-version'), 'utf8').trim() : null
  check('DR16', 'marker ghi lại VER:HASH', markerAfter === `${VER}:${HASH}`, String(markerAfter))
  check('DR16', 'orphan bin bị xoá', !existsSync(join(fx, 'bin', 'zzz-legacy-orphan')))
  check('DR16', 'retired skill dir bị dọn (installKit)', !existsSync(join(fx, 'skills', 'gpt-taste')))
  if (process.platform !== 'win32') {
    const mode = statSync(join(fx, 'bin', 'story-kb')).mode & 0o777
    check('DR16', 'exec-bit khôi phục 755', (mode & 0o111) === 0o111, mode.toString(8))
  }
  // re-check độc lập bằng chế độ check thường
  const r2 = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  check('DR16', 're-check exit 0', r2.status === 0, `code=${r2.status}`)
  const out2 = JSON.parse(r2.stdout)
  for (const name of ['marker', 'bins', 'orphans', 'agents-skills']) {
    const c = (out2.checks || []).find(x => x.name === name)
    check('DR16', `re-check ${name} PASS`, c && c.status === 'pass', c && JSON.stringify(c))
  }
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR17: --repair KHÔNG clobber settings.json (foreign hooks sống sót) ------
console.log('== [DR17] --repair giữ settings.json của user ==')
{
  const foreignCmd = '/usr/local/bin/user-own-hook --x 1'
  const fx = makeFixture({
    marker: '9.9.9:' + HASH, // drift → repair chạy installKit (có merge hooks)
    settings: root => JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [mkHook(join(root, 'bin'), 'hook-session-start')] },
          { hooks: [{ type: 'command', command: foreignCmd, timeout: 10 }] },
        ],
        PostToolUse: [{ matcher: 'Bash', hooks: [mkHook(join(root, 'bin'), 'hook-post-tool-use')] }],
        Stop: [{ hooks: [mkHook(join(root, 'bin'), 'hook-stop')] }],
      },
    }),
  })
  const r = run(['--root', fx, '--repair'], { cwd: emptyCwd, env: noKbEnv, timeout: 120000 })
  check('DR17', 'exit 0', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  const afterText = readFileSync(join(fx, 'settings.json'), 'utf8')
  let after = null
  try { after = JSON.parse(afterText) } catch { /* để assert dưới bắt */ }
  check('DR17', 'settings.json vẫn parse được JSON', !!after)
  check('DR17', 'foreign hook command còn nguyên', afterText.includes(foreignCmd))
  check('DR17', 'kit hook vẫn wired', after?.hooks?.SessionStart?.some(g =>
    (g.hooks || []).some(h => String(h.command).includes('hook-session-start'))), afterText)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR18: --uninstall KHÔNG --yes → PLAN, exit 2, không xoá gì ----------------
console.log('== [DR18] --uninstall không --yes → PLAN exit 2 ==')
{
  const fx = makeFixture()
  const r = run(['--root', fx, '--uninstall'], { cwd: emptyCwd, env: noKbEnv })
  check('DR18', 'exit 2 (PLAN chờ --yes)', r.status === 2, `code=${r.status}`)
  check('DR18', 'stdout nêu PLAN', r.stdout.includes('PLAN'), r.stdout)
  check('DR18', 'marker còn', existsSync(join(fx, '.story-team-kit-version')))
  check('DR18', 'bin còn', existsSync(join(fx, 'bin', 'story-doctor')))
  check('DR18', 'skill còn', existsSync(join(fx, 'skills', 'story-workflow', 'SKILL.md')))
  check('DR18', 'agent còn', existsSync(join(fx, 'agents', 'verifier.md')))
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR19: --uninstall --yes → xoá đúng provides + marker, giữ file user -------
console.log('== [DR19] --uninstall --yes — xoá provides, giữ user file, hướng dẫn hooks ==')
{
  const fx = makeFixture({ extraBins: ['user-own-tool'] })
  mkdirSync(join(fx, 'skills', 'user-own-skill'), { recursive: true })
  writeFileSync(join(fx, 'skills', 'user-own-skill', 'SKILL.md'), 'skill của user')
  const r = run(['--root', fx, '--uninstall', '--yes'], { cwd: emptyCwd, env: noKbEnv })
  check('DR19', 'exit 0', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  for (const s of kitJson.provides.filter(e => e.type === 'skill').map(e => e.name))
    check('DR19', `skill ${s} biến mất`, !existsSync(join(fx, 'skills', s)))
  for (const a of kitJson.provides.filter(e => e.type === 'agent').map(e => e.name))
    check('DR19', `agent ${a}.md biến mất`, !existsSync(join(fx, 'agents', `${a}.md`)))
  for (const b of ['story-doctor', 'story-kb', 'hook-session-start'])
    check('DR19', `bin ${b} biến mất`, !existsSync(join(fx, 'bin', b)))
  check('DR19', 'marker biến mất', !existsSync(join(fx, '.story-team-kit-version')))
  check('DR19', 'foreign bin user giữ nguyên', existsSync(join(fx, 'bin', 'user-own-tool')))
  check('DR19', 'foreign skill user giữ nguyên', existsSync(join(fx, 'skills', 'user-own-skill', 'SKILL.md')))
  check('DR19', 'settings.json KHÔNG bị xoá', existsSync(join(fx, 'settings.json')))
  check('DR19', 'in hướng dẫn xoá hooks thủ công', r.stdout.includes('settings.json')
    && r.stdout.includes('hook-session-start'), r.stdout)
  check('DR19', 'in đường dẫn KB để user tự quyết', r.stdout.includes('KHÔNG đụng KB'), r.stdout)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR20: --uninstall trên root trống → không crash, exit 0 -------------------
console.log('== [DR20] --uninstall root trống ==')
{
  const fx = mkdtempSync(join(tmpdir(), 'doctor-tests-empty-'))
  const r = run(['--root', fx, '--uninstall', '--yes'], { cwd: emptyCwd, env: noKbEnv })
  check('DR20', 'exit 0 không crash', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  check('DR20', 'báo không còn gì', r.stdout.includes('không còn gì'), r.stdout)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR21: usage tổ hợp mode + uninstall thiếu kit.json ------------------------
console.log('== [DR21] usage mode + uninstall thiếu kit.json ==')
{
  const r = run(['--root', emptyCwd, '--repair', '--uninstall'])
  check('DR21', '--repair + --uninstall → exit 2', r.status === 2, `code=${r.status}`)
  const r2 = run(['--root', emptyCwd, '--yes'])
  check('DR21', '--yes không --uninstall → exit 2', r2.status === 2, `code=${r2.status}`)
  // kitRoot không có kit.json (spawn bin trong fixture) → exit 1, KHÔNG xoá mù
  const fx = makeFixture()
  const r3 = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--uninstall', '--yes'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR21', 'uninstall thiếu kit.json → exit 1', r3.status === 1, `code=${r3.status}`)
  check('DR21', 'marker vẫn còn (không xoá mù)', existsSync(join(fx, '.story-team-kit-version')))
  rmSync(fx, { recursive: true, force: true })
}

rmSync(emptyCwd, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (story-doctor 21 DR)')
