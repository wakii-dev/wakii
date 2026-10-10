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
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// ---- LOCAL-5 SF-1: sidecar manifest (.kit-provides.json) — install-coverage ---
// Chế độ install (doctor chạy TỪ BÊN TRONG install root: kit_root==root,
// kit.json vắng) — hết PASS tautology: provides đọc từ sidecar do installKit ghi.
const SIDECAR = '.kit-provides.json'
const binNames = kitJson.provides.filter(e => e.type === 'bin').map(e => e.name).sort()
const sidecarJson = (srcRoot, hash) => JSON.stringify(
  { provides: binNames, srcKitRoot: srcRoot, kitHash: hash }, null, 2)

// ---- DR22: tautology + sidecar + thiếu 1 provides-bin → FAIL nêu đúng tên ------
console.log('== [DR22] install-mode sidecar — thiếu bin → FAIL (hết tautology) ==')
{
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  rmSync(join(fx, 'bin', 'story-kb'))
  // doctor BÊN TRONG fixture → kit_root = fx (kit.json vắng) → sidecar mode
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR22', 'exit 1', r.status === 1, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'bins')
  check('DR22', 'bins FAIL', c && c.status === 'fail', c && JSON.stringify(c))
  check('DR22', 'detail nêu đúng tên thiếu', c && c.detail.includes('story-kb'), c && c.detail)
  check('DR22', 'fix nêu cài lại + copy tay từ srcKitRoot', c && c.fix && c.fix.includes('cp'), c && c.fix)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR23: install-mode KHÔNG sidecar → WARN fail-open (không PASS) ------------
console.log('== [DR23] install-mode không sidecar → bins WARN fail-open ==')
{
  const fx = makeFixture()
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR23', 'exit 0 (WARN không FAIL)', r.status === 0, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'bins')
  check('DR23', 'bins WARN (không PASS)', c && c.status === 'warn', c && JSON.stringify(c))
  check('DR23', 'detail nhắc sidecar', c && c.detail.includes(SIDECAR), c && c.detail)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR24: sidecar-mode 2 chiều — orphan WARN-only · missing+orphan → FAIL -----
console.log('== [DR24] sidecar-mode orphan (installed ∉ provides) ==')
{
  // 24a: chỉ orphan → WARN-only, exit 0
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  writeFileSync(join(fx, 'bin', 'zzz-legacy-orphan'), '#!/bin/sh\nlegacy\n')
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR24', '24a exit 0 (orphan WARN-only)', r.status === 0, `code=${r.status}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'bins')
  check('DR24', '24a bins WARN nêu orphan', c && c.status === 'warn' && c.detail.includes('zzz-legacy-orphan'), c && JSON.stringify(c))
  rmSync(fx, { recursive: true, force: true })

  // 24b: missing + orphan cùng lúc → FAIL (missing ưu tiên), cả 2 nêu tên
  const fx2 = makeFixture()
  writeFileSync(join(fx2, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  rmSync(join(fx2, 'bin', 'story-kb'))
  writeFileSync(join(fx2, 'bin', 'zzz-legacy-orphan'), '#!/bin/sh\nlegacy\n')
  const r2 = spawnSync(PY, [join(fx2, 'bin', 'story-doctor'), '--root', fx2, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR24', '24b exit 1 (missing FAIL)', r2.status === 1, `code=${r2.status}`)
  const out2 = JSON.parse(r2.stdout)
  const c2 = out2.checks.find(x => x.name === 'bins')
  check('DR24', '24b FAIL nêu cả missing + orphan', c2 && c2.status === 'fail'
    && c2.detail.includes('story-kb') && c2.detail.includes('zzz-legacy-orphan'), c2 && JSON.stringify(c2))
  rmSync(fx2, { recursive: true, force: true })
}

// ---- DR25: installKit ghi sidecar VÔ ĐIỀU KIỆN — cả early-return marker-khớp ---
console.log('== [DR25] installKit ghi sidecar + refresh qua early-return ==')
{
  const fx = mkdtempSync(join(tmpdir(), 'doctor-tests-install-'))
  const code = [
    `import { installKit } from ${JSON.stringify(pathToFileURL(resolve(pluginRoot, 'main.mjs')).href)};`,
    'const orca = { host: { call: async () => ({ ok: true }) }, log: () => {} };',
    `console.log('r1:' + installKit(orca, { root: ${JSON.stringify(fx)} }));`,
    `console.log('r2:' + installKit(orca, { root: ${JSON.stringify(fx)} }));`,
  ].join('\n')
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 120000 })
  check('DR25', 'install 2 lần ok', r.stdout.includes('r1:true') && r.stdout.includes('r2:true'), r.stdout + r.stderr)
  const scPath = join(fx, 'bin', SIDECAR)
  check('DR25', 'sidecar tồn tại sau install 1', existsSync(scPath))
  if (existsSync(scPath)) {
    const sc = JSON.parse(readFileSync(scPath, 'utf8'))
    check('DR25', 'provides = đúng bin names (sorted)', JSON.stringify(sc.provides) === JSON.stringify(binNames), JSON.stringify(sc.provides?.slice(0, 5)))
    check('DR25', 'srcKitRoot = kit source', sc.srcKitRoot === KIT_ROOT, String(sc.srcKitRoot))
    check('DR25', 'kitHash khớp kit.json', sc.kitHash === HASH, String(sc.kitHash))
  }
  // Lần 2 chạy lại với marker đã khớp + sidecar bôi nhọ — chỉ ghi TRƯỚC
  // early-return mới khôi phục được (nếu ghi sau early-return thì kẹt garbage).
  writeFileSync(scPath, 'garbage-khong-phai-json')
  const r2 = spawnSync(process.execPath, ['--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 120000 })
  check('DR25', 'install lại ok (early-return path)', r2.stdout.includes('r1:true'), r2.stdout + r2.stderr)
  check('DR25', 'sidecar được refresh lại đúng (vô điều kiện)', existsSync(scPath)
    && (() => { try { return JSON.parse(readFileSync(scPath, 'utf8')).kitHash === HASH } catch { return false } })(),
    existsSync(scPath) ? readFileSync(scPath, 'utf8').slice(0, 80) : 'mất')
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR26: check_orphans whitelist sidecar (không coi là orphan) ---------------
console.log('== [DR26] orphans whitelist .kit-provides.json ==')
{
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  const r = run(['--root', fx, '--json'], { cwd: emptyCwd, env: noKbEnv })
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'orphans')
  check('DR26', 'orphans PASS (sidecar không bị liệt kê)', c && c.status === 'pass', c && JSON.stringify(c))
  check('DR26', 'không nêu sidecar trong detail', c && !c.detail.includes(SIDECAR), c && c.detail)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR27: --repair srcKitRoot hợp lệ + hash khớp → copy bin thiếu, chmod 755 --
console.log('== [DR27] --repair copy-bins từ srcKitRoot hợp lệ ==')
{
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  rmSync(join(fx, 'bin', 'story-kb'))
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--repair'],
    { encoding: 'utf8', timeout: 120000, cwd: emptyCwd, env: noKbEnv })
  check('DR27', 'exit 0 (hết FAIL)', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  check('DR27', 'log copy bin thiếu', r.stdout.includes('story-kb') && r.stdout.includes('copy'), r.stdout)
  check('DR27', 'bin được copy lại', existsSync(join(fx, 'bin', 'story-kb')))
  if (process.platform !== 'win32' && existsSync(join(fx, 'bin', 'story-kb'))) {
    const mode = statSync(join(fx, 'bin', 'story-kb')).mode & 0o777
    check('DR27', 'chmod 755 SAU copy', (mode & 0o111) === 0o111, mode.toString(8))
  }
  const r2 = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR27', 're-check exit 0', r2.status === 0, `code=${r2.status}`)
  const out2 = JSON.parse(r2.stdout)
  const c2 = out2.checks.find(x => x.name === 'bins')
  check('DR27', 're-check bins PASS theo sidecar', c2 && c2.status === 'pass', c2 && JSON.stringify(c2))
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR28: --repair source mất/hash lệch → FAIL + in lệnh cp hướng dẫn tay -----
console.log('== [DR28] --repair không-source/hash-lệch → FAIL có hướng dẫn ==')
{
  // 28a: srcKitRoot không tồn tại
  const fx = makeFixture()
  const lostSrc = join(fx, 'src-da-mat')
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(lostSrc, HASH))
  rmSync(join(fx, 'bin', 'story-kb'))
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--repair'],
    { encoding: 'utf8', timeout: 120000, cwd: emptyCwd, env: noKbEnv })
  check('DR28', '28a exit 1 (không PASS)', r.status === 1, `code=${r.status}`)
  check('DR28', '28a in lệnh cp hướng dẫn', r.stdout.includes('cp') && r.stdout.includes('story-kb'), r.stdout)
  check('DR28', '28a KHÔNG copy mù', !existsSync(join(fx, 'bin', 'story-kb')))
  rmSync(fx, { recursive: true, force: true })

  // 28b: srcKitRoot tồn tại nhưng tree hash ≠ sidecar.kitHash (source khác bản)
  const srcFx = mkdtempSync(join(tmpdir(), 'doctor-tests-src-'))
  for (const sub of ['bin', 'agents', 'skills']) {
    mkdirSync(join(srcFx, sub), { recursive: true })
    copyTree(join(KIT_ROOT, sub), join(srcFx, sub))
  }
  const kbPath = join(srcFx, 'bin', 'story-kb')
  writeFileSync(kbPath, readFileSync(kbPath, 'utf8') + '\n# drift-local\n') // hash lệch
  const fx2 = makeFixture()
  writeFileSync(join(fx2, 'bin', SIDECAR), sidecarJson(srcFx, HASH))
  rmSync(join(fx2, 'bin', 'story-kb'))
  const r2 = spawnSync(PY, [join(fx2, 'bin', 'story-doctor'), '--root', fx2, '--repair'],
    { encoding: 'utf8', timeout: 120000, cwd: emptyCwd, env: noKbEnv })
  check('DR28', '28b exit 1 (không PASS)', r2.status === 1, `code=${r2.status}`)
  check('DR28', '28b in lệnh cp hướng dẫn', r2.stdout.includes('cp') && r2.stdout.includes('story-kb'), r2.stdout)
  check('DR28', '28b KHÔNG copy từ source lệch hash', !existsSync(join(fx2, 'bin', 'story-kb')))
  rmSync(fx2, { recursive: true, force: true })
  rmSync(srcFx, { recursive: true, force: true })
}

// ---- DR29: --uninstall --yes dọn sidecar ---------------------------------------
console.log('== [DR29] uninstall dọn sidecar ==')
{
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), sidecarJson(KIT_ROOT, HASH))
  const r = run(['--root', fx, '--uninstall', '--yes'], { cwd: emptyCwd, env: noKbEnv })
  check('DR29', 'exit 0', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  check('DR29', 'sidecar biến mất', !existsSync(join(fx, 'bin', SIDECAR)))
  check('DR29', 'PLAN/xoá nêu sidecar', r.stdout.includes(SIDECAR), r.stdout)
  rmSync(fx, { recursive: true, force: true })
}

// ---- DR30: sidecar JSON hỏng → WARN fail-open, không crash ---------------------
console.log('== [DR30] sidecar hỏng → fail-open WARN ==')
{
  const fx = makeFixture()
  writeFileSync(join(fx, 'bin', SIDECAR), '{hong')
  const r = spawnSync(PY, [join(fx, 'bin', 'story-doctor'), '--root', fx, '--json'],
    { encoding: 'utf8', timeout: 60000, cwd: emptyCwd, env: noKbEnv })
  check('DR30', 'exit 0 (không crash, WARN không FAIL)', r.status === 0, `code=${r.status} stderr=${r.stderr}`)
  const out = JSON.parse(r.stdout)
  const c = out.checks.find(x => x.name === 'bins')
  check('DR30', 'bins WARN (không PASS)', c && c.status === 'warn', c && JSON.stringify(c))
  check('DR30', 'detail nhắc sidecar hỏng', c && c.detail.includes(SIDECAR), c && c.detail)
  rmSync(fx, { recursive: true, force: true })
}

rmSync(emptyCwd, { recursive: true, force: true })

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (story-doctor 21 DR)')
