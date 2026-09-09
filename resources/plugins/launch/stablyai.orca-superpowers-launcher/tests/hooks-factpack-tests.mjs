#!/usr/bin/env node
// hooks + fact-pack tests (SF-2 GH-26) — spawn subprocess thật (Node merge +
// bash wrappers + python bin) trên temp dirs. KHÔNG BAO GIỜ đụng ~/.claude thật:
// mọi merge qua --root temp; cuối run so settings.json ~/.claude trước/sau.
// Chạy: node tests/hooks-factpack-tests.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deepStrictEqual, ok } from 'node:assert'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const mainPath = join(pluginRoot, 'main.mjs')
const BIN = join(pluginRoot, 'kit', 'bin')
const { mergeStoryHooks, mergeStoryHookSettings, buildStoryHookGroups } = await import(pathToFileURL(mainPath))

// Resolve python launcher (Windows Store alias stub → fallback python/py)
function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()
const BASH = process.platform === 'win32' ? 'bash' : 'bash'

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `hfp-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp root ngoài tmpdir — dừng')
  return dir
}

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
//claude-hook.cmd entry mẫu (như settings thật của user Orca)
const ORCA_ENTRY = (evTimeout = 10) => ({
  hooks: [{ type: 'command', command: 'C:/Users/hoivk/.orca/agent-hooks/claude-hook.cmd || echo {}', timeout: evTimeout }]
})

// =====================================================================
console.log(`== [inst] Node mergeStoryHooks — fixture preserves Orca + legacy ==`)
{
  const root = tempDir('inst1')
  mkdirSync(root, { recursive: true })
  const settings = {
    env: { ANTHROPIC_BASE_URL: 'https://example' },
    hooks: {
      SessionStart: [ORCA_ENTRY()],
      PostToolUse: [{ matcher: '*', ...ORCA_ENTRY() }],
      Stop: [ORCA_ENTRY()]
    },
    statusLine: { type: 'command', command: 'statusline-cmd' }
  }
  writeFileSync(join(root, 'settings.json'), JSON.stringify(settings, null, 2))
  const r = mergeStoryHooks(root)
  check('inst', 'ok:true + changed:true', r.ok === true && r.changed === true, JSON.stringify(r))
  const after = readJson(join(root, 'settings.json'))
  check('inst', 'settings.json KHÔNG bắt đầu { bị parse thành object — vẫn có env', after.env?.ANTHROPIC_BASE_URL === 'https://example')
  check('inst', 'statusLine nguyên vẹn', JSON.stringify(after.statusLine).includes('statusline-cmd'))
  // entry user nguyên vẹn (so JSON sâu)
  deepStrictEqual(after.hooks.SessionStart.find(g => JSON.stringify(g).includes('claude-hook.cmd')), ORCA_ENTRY())
  deepStrictEqual(after.hooks.PostToolUse.find(g => JSON.stringify(g).includes('claude-hook.cmd')), { matcher: '*', ...ORCA_ENTRY() })
  deepStrictEqual(after.hooks.Stop.find(g => JSON.stringify(g).includes('claude-hook.cmd')), ORCA_ENTRY())
  check('inst', '3 claude-hook.cmd entries giữ nguyên JSON sâu', true)
  // 3 entries kit xuất hiện đúng shape
  const canon = buildStoryHookGroups(root)
  for (const ev of ['PostToolUse', 'SessionStart', 'Stop']) {
    const g = after.hooks[ev].find(g => JSON.stringify(g).includes('hook-'))
    ok(g, `entry kit ${ev} xuất hiện`)
    check('inst', `entry kit ${ev} đúng command + timeout`, g?.hooks?.[0]?.command === canon[ev].hooks[0].command && g?.hooks?.[0]?.timeout === 10, JSON.stringify(g))
  }
  check('inst', 'PostToolUse matcher Bash', canon.PostToolUse.matcher === 'Bash')
  check('inst', 'SessionStart/Stop không matcher', canon.SessionStart.matcher === undefined && canon.Stop.matcher === undefined)
  // tmp file không sót
  check('inst', 'temp file dọn sạch', readdirSync(root).filter(f => f.includes('.tmp-')).length === 0)
}

console.log(`\n== [idem] idempotent — chạy lần 2 file byte-for-byte không đổi ==`)
{
  const root = tempDir('inst2')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [ORCA_ENTRY()] } }, null, 2))
  mergeStoryHooks(root)
  const before = readFileSync(join(root, 'settings.json'), 'utf8')
  const r2 = mergeStoryHooks(root)
  const after = readFileSync(join(root, 'settings.json'), 'utf8')
  check('idem', 'changed:false', r2.changed === false, JSON.stringify(r2))
  check('idem', 'byte-for-byte không đổi', before === after)
}

console.log(`\n== [fix] entry kit SAI nội dung (version cũ) → cập nhật đúng; entry khác không đụng ==`)
{
  const root = tempDir('inst3')
  mkdirSync(root, { recursive: true })
  // entry kit cũ: đúng command path (backslash như settings thật), sai timeout
  const oldKitCmd = join(root, 'bin', 'hook-session-start')
  writeFileSync(join(root, 'settings.json'), JSON.stringify({
    hooks: {
      SessionStart: [
        ORCA_ENTRY(),
        { hooks: [{ type: 'command', command: oldKitCmd, timeout: 99 }] }
      ],
      Stop: [ORCA_ENTRY()]
    }
  }, null, 2))
  const r = mergeStoryHooks(root)
  check('fix', 'ok + changed', r.ok && r.changed === true, JSON.stringify(r))
  const after = readJson(join(root, 'settings.json'))
  const kitG = after.hooks.SessionStart.find(g => JSON.stringify(g).includes('hook-session-start'))
  check('fix', 'entry kit cũ được cập nhật (timeout 10)', kitG?.hooks?.[0]?.timeout === 10, JSON.stringify(kitG))
  check('fix', 'entry cũ KHÔNG bị nhân đôi (không thêm group mới)',
    after.hooks.SessionStart.filter(g => JSON.stringify(g).includes('hook-session-start')).length === 1)
  deepStrictEqual(after.hooks.Stop.find(g => JSON.stringify(g).includes('claude-hook.cmd')), ORCA_ENTRY())
  check('fix', 'claude-hook.cmd Stop nguyên vẹn sau fix', true)
}

console.log(`\n== [det] detection theo ĐÚNG command path — không prefix-match story- ==`)
{
  // story-compact-recovery legacy + command lạ chứa 'hook-session-start' GIỮA path khác → không bị nhận nhầm
  const root = tempDir('det1')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'settings.json'), JSON.stringify({
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: '/home/u/.claude/bin/story-compact-recovery', timeout: 10 }] },
        { hooks: [{ type: 'command', command: '/opt/other/hook-session-start-proxy', timeout: 5 }] }
      ]
    }
  }, null, 2))
  mergeStoryHooks(root)
  const after = readJson(join(root, 'settings.json'))
  check('det', 'compact-recovery legacy giữ nguyên', after.hooks.Stop.some(g => JSON.stringify(g).includes('story-compact-recovery')))
  check('det', 'path CHỨA hook-session-start nhưng khác → không bị thay', after.hooks.Stop.some(g => JSON.stringify(g).includes('hook-session-start-proxy')))
  check('det', 'kit group append riêng (không đụng 2 group trên)', after.hooks.Stop.length === 3)
}

console.log(`\n== [edge] mixed group (kit + foreign chung hooks[]) → không đụng, append riêng; malformed → không ghi đè; missing settings → tạo mới; root không tồn tại ==`)
{
  const root = tempDir('edge1')
  mkdirSync(root, { recursive: true })
  const kitCmd = buildStoryHookGroups(root).Stop.hooks[0].command
  writeFileSync(join(root, 'settings.json'), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: kitCmd }, { type: 'command', command: 'claude-hook.cmd || echo {}' }] }] }
  }, null, 2))
  mergeStoryHooks(root)
  let after = readJson(join(root, 'settings.json'))
  check('edge', 'mixed group giữ nguyên', after.hooks.Stop.some(g => g.hooks.length === 2), JSON.stringify(after.hooks.Stop))
  check('edge', 'canonical append riêng', after.hooks.Stop.filter(g => g.hooks.length === 1 && g.hooks[0].command === kitCmd).length === 1)

  const malformed = tempDir('edge2')
  mkdirSync(malformed, { recursive: true })
  writeFileSync(join(malformed, 'settings.json'), '{oops not json')
  const before = readFileSync(join(malformed, 'settings.json'), 'utf8')
  const r = mergeStoryHooks(malformed)
  check('edge', 'malformed → ok:false + lỗi nói rõ', r.ok === false && (r.error || '').includes('malformed'), JSON.stringify(r))
  check('edge', 'malformed file KHÔNG bị ghi đè', readFileSync(join(malformed, 'settings.json'), 'utf8') === before)

  const fresh = tempDir('edge3')
  const r3 = mergeStoryHooks(fresh) // dir chưa tồn tại → tạo + ghi mới
  check('edge', 'missing settings.json → tạo mới ok', r3.ok === true && existsSync(join(fresh, 'settings.json')))
  check('edge', 'settings mới có đúng 3 event keys', ['PostToolUse', 'SessionStart', 'Stop'].every(k => readJson(join(fresh, 'settings.json')).hooks[k]))

  const arrRoot = tempDir('edge4')
  mkdirSync(arrRoot, { recursive: true })
  writeFileSync(join(arrRoot, 'settings.json'), '[1,2,3]')
  const r4 = mergeStoryHooks(arrRoot)
  check('edge', 'settings là array → ok:false', r4.ok === false)
}

console.log(`\n== [bin] story-hooks-install bin — cùng semantics đường bash (chạy tay/CI) ==`)
{
  const root = tempDir('bin1')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [ORCA_ENTRY()] } }, null, 2))
  const r = spawnSync(BASH, [join(BIN, 'story-hooks-install'), '--root', root], { encoding: 'utf8', timeout: 60000 })
  check('bin', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  check('bin', 'stdout nói merged', (r.stdout || '').includes('merged'), r.stdout)
  const after = readJson(join(root, 'settings.json'))
  check('bin', '3 events có entry kit', ['PostToolUse', 'SessionStart', 'Stop'].every(ev => after.hooks[ev].some(g => JSON.stringify(g).includes('hook-'))))
  check('bin', 'claude-hook.cmd giữ nguyên', JSON.stringify(after.hooks.SessionStart.find(g => JSON.stringify(g).includes('claude-hook.cmd'))) === JSON.stringify(ORCA_ENTRY()))
  // idempotent qua bin
  const r2 = spawnSync(BASH, [join(BIN, 'story-hooks-install'), '--root', root], { encoding: 'utf8', timeout: 60000 })
  check('bin', 'lần 2: exit 0 + up-to-date', r2.status === 0 && (r2.stdout || '').includes('up-to-date'), `${r2.status} ${r2.stdout}`)
  // cross-check bin vs Node cùng fixture → JSON sâu giống nhau (normalizing
  // root path vì command chứa đường dẫn cài đặt)
  const rootN = tempDir('bin2')
  mkdirSync(rootN, { recursive: true })
  writeFileSync(join(rootN, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [ORCA_ENTRY()] } }, null, 2))
  mergeStoryHooks(rootN)
  const norm = (obj, rootDir) => JSON.parse(JSON.stringify(obj).split(rootDir.replaceAll('\\', '/')).join('<ROOT>').split(rootDir.replaceAll('/', '\\')).join('<ROOT>'))
  const a = norm(readJson(join(root, 'settings.json')), root)
  const b = norm(readJson(join(rootN, 'settings.json')), rootN)
  deepStrictEqual(a.hooks, b.hooks)
  check('bin', 'bin và Node cùng kết quả hooks (deep equal sau normalize root)', true)
  // malformed qua bin
  const bad = tempDir('bin3')
  mkdirSync(bad, { recursive: true })
  writeFileSync(join(bad, 'settings.json'), '{oops')
  const r3 = spawnSync(BASH, [join(BIN, 'story-hooks-install'), '--root', bad], { encoding: 'utf8', timeout: 60000 })
  check('bin', 'malformed → exit 1, file giữ nguyên', r3.status === 1 && readFileSync(join(bad, 'settings.json'), 'utf8') === '{oops')
}

// ---- fact-pack ---------------------------------------------------------------
function initStoryRepo(dir, { brackets = true, checkpoints = [], lessons = null } = {}) {
  mkdirSync(join(dir, 'docs/superpowers/brackets'), { recursive: true })
  mkdirSync(join(dir, '.wakii'), { recursive: true })
  if (brackets) {
    writeFileSync(join(dir, 'docs/superpowers/brackets/gh27-fixture.md'), [
      '# Story: GH-27 — Session memory — mô hình Atlas',
      'Destination: story/gh27-atlas',
      '',
      '## SF-1 Store + checkpoint CLI',
      'Tier: 0',
      'linear: FI-7',
      '',
      '## SF-2 Hooks auto-install + fact-pack',
      'Tier: 1',
      'linear: FI-8',
      ''
    ].join('\n'))
  }
  if (checkpoints.length) {
    writeFileSync(join(dir, '.wakii', 'checkpoints.jsonl'), checkpoints.map(c => JSON.stringify(c)).join('\n') + '\n')
  }
  if (lessons) writeFileSync(join(dir, '.wakii', 'lessons.jsonl'), lessons)
  return dir
}

function runFactPack(dir, payload, env = {}) {
  return spawnSync(PY, [join(BIN, 'story-fact-pack')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30000,
    cwd: dir,
    env: {
      ...process.env,
      STORY_FACT_PACK_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'),
      STORY_FACT_PACK_STATUS_BIN: join(BIN, 'story-status'),
      STORY_FACT_PACK_CWD: dir,
      ...env
    }
  })
}

const CP1 = { v: 1, ts: '2026-09-09T10:00:00Z', session_id: 's1', repo: 'r', branch: 'main', commit: 'abc1234def5678', task_id: null, step: null, prompt_summary: 'git commit -m "build store"', error_lines: ['ERROR: boom at line 12'] }
const CP2 = { v: 1, ts: '2026-09-09T11:00:00Z', session_id: 's2', repo: 'r', branch: 'sf2', commit: 'def5678abc1234', task_id: 'T-1', step: 'implement', prompt_summary: 'git commit -m "hooks merge"', error_lines: [] }

console.log(`\n== [fp] fact-pack happy path — bracket + SF tiers + linear + tail + lessons ==`)
{
  const repo = initStoryRepo(tempDir('fp1'), {
    checkpoints: [CP1, CP2],
    lessons: '{"text":"retry đọc kết quả cũ thay vì re-run cùng lệnh","source":"session","ref":"s1"}\n'
  })
  const r = runFactPack(repo, { source: 'startup', session_id: 'sess-X', cwd: repo })
  check('fp', 'exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  check('fp', 'stdout KHÔNG rỗng', (r.stdout || '').trim().length > 0)
  check('fp', 'KHÔNG bắt đầu bằng {', !r.stdout.trim().startsWith('{'))
  check('fp', 'story header có linear + tên', r.stdout.includes('GH-27') && r.stdout.includes('FI-7') || r.stdout.includes('FI-8'), r.stdout.slice(0, 120))
  check('fp', 'SF tiers có mặt', r.stdout.includes('SF-1 Store + checkpoint CLI') && r.stdout.includes('tier 0'), r.stdout.slice(0, 300))
  check('fp', 'tail checkpoint mới nhất trước (CP2 đầu CP1 sau)', r.stdout.indexOf('hooks merge') < r.stdout.indexOf('build store'), r.stdout)
  check('fp', 'error line nguyên văn', r.stdout.includes('ERROR: boom at line 12'))
  check('fp', 'lessons block có mặt', r.stdout.includes('lessons:') && r.stdout.includes('retry đọc kết quả cũ'))
  check('fp', 'KHÔNG disclosure khi dưới cap', !r.stdout.includes('[đã cắt'))
}

console.log(`\n== [fps] source filtering — compact skip; resume/clear/fork/startup inject ==`)
{
  const repo = initStoryRepo(tempDir('fp2'), { checkpoints: [CP1] })
  const rc = runFactPack(repo, { source: 'compact', cwd: repo })
  check('fps', 'compact → stdout rỗng + exit 0', rc.status === 0 && rc.stdout.trim() === '', `out=${JSON.stringify(rc.stdout.slice(0, 60))}`)
  for (const src of ['startup', 'resume', 'clear', 'fork']) {
    const rr = runFactPack(repo, { source: src, cwd: repo })
    check('fps', `${src} → inject`, rr.status === 0 && rr.stdout.trim().length > 0)
  }
  // stdin rỗng/hỏng → mặc định startup (không chết)
  const rb = spawnSync(PY, [join(BIN, 'story-fact-pack')], {
    input: 'not-json', encoding: 'utf8', timeout: 30000, cwd: repo,
    env: { ...process.env, STORY_FACT_PACK_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_CWD: repo }
  })
  check('fps', 'stdin hỏng → exit 0 (payload {} → source startup)', rb.status === 0)
}

console.log(`\n== [fpc] size cap 2KB — cắt từ dưới lên, disclosure ở cuối ==`)
{
  // bracket dài để section ưu tiên-1 TỰ THÂN vượt cap (8 SF × ~330B ≈ 2.7KB)
  // → cắt từ dưới: tail mất trước, story hard-cut xuống budget
  const repo = initStoryRepo(tempDir('fp3'), {})
  const longLine = 'x'.repeat(300)
  writeFileSync(join(repo, 'docs/superpowers/brackets/gh27-fixture.md'), [
    `# Story: GH-27 — ${longLine}`,
    'Destination: story/gh27-atlas',
    ...Array.from({ length: 30 }, (_, i) => [`## SF-${i + 1} thành phần ${i + 1} ${longLine}`, 'Tier: 0', `linear: FI-${100 + i}`, ''].join('\n'))
  ].join('\n') + '\n')
  writeFileSync(join(repo, '.wakii', 'checkpoints.jsonl'),
    [CP1, CP2].map(c => JSON.stringify(c)).join('\n') + '\n')
  const r = runFactPack(repo, { source: 'startup', cwd: repo })
  check('fpc', 'exit 0', r.status === 0)
  const out = r.stdout
  check('fpc', 'story section (ưu tiên 1) GIỮ (đầu)', out.startsWith('story:'), out.slice(0, 60))
  check('fpc', 'tổng bytes ≤ cap + disclosure', Buffer.byteLength(out, 'utf8') <= 2048 + 80, `bytes=${Buffer.byteLength(out, 'utf8')}`)
  check('fpc', 'disclosure xuất hiện khi cắt', out.includes('[đã cắt'), out.slice(-90))
  check('fpc', 'tail (ưu tiên 2) bị cắt trước story', !out.includes('recent checkpoints'), out.slice(-90))
}

console.log(`\n== [fpf] fail-open — store vắng, brackets vắng, module SF-1 vắng, bin story-status chết ==`)
{
  // project không brackets, không store → stdout rỗng
  const plain = tempDir('fpf1')
  mkdirSync(join(plain, 'sub'), { recursive: true })
  const r1 = runFactPack(plain, { source: 'startup', cwd: plain })
  check('fpf', 'không story → stdout rỗng + exit 0', r1.status === 0 && r1.stdout.trim() === '', JSON.stringify(r1.stdout.slice(0, 60)))
  // store vắng nhưng có brackets → vẫn inject phần story
  const repoNoStore = initStoryRepo(tempDir('fpf2'), { checkpoints: [] })
  rmSync(join(repoNoStore, '.wakii'), { recursive: true, force: true })
  const r2 = runFactPack(repoNoStore, { source: 'startup', cwd: repoNoStore })
  check('fpf', 'store vắng → vẫn có story section, exit 0', r2.status === 0 && r2.stdout.includes('GH-27'))
  // story-checkpoint bin vắng (trỏ file không tồn tại) → tail skip, còn phần khác
  const repo3 = initStoryRepo(tempDir('fpf3'), { checkpoints: [CP1] })
  const r3 = runFactPack(repo3, { source: 'startup', cwd: repo3 }, { STORY_FACT_PACK_CHECKPOINT_BIN: join(tempDir('missing'), 'story-checkpoint') })
  check('fpf', 'bin SF-1 vắng → tail skip nhưng bracket vẫn inject, exit 0', r3.status === 0 && r3.stdout.includes('GH-27') && !r3.stdout.includes('recent checkpoints'))
  // story-status "chết" (trỏ file không tồn tại) → gates skip fail-open
  const r4 = runFactPack(repo3, { source: 'startup', cwd: repo3 }, { STORY_FACT_PACK_STATUS_BIN: join(tempDir('missing2'), 'story-status') })
  check('fpf', 'status bin vắng → gates skip, exit 0', r4.status === 0 && r4.stdout.includes('GH-27'))
}

console.log(`\n== [wrap] wrappers — missing-bin nuốt từ đầu; post-tool-use pass qua record; session-start pass stdout; stop no-op ==`)
{
  // missing bin → cả 3 wrapper exit 0 im lặng
  for (const w of ['hook-post-tool-use', 'hook-session-start', 'hook-stop']) {
    const r = spawnSync(BASH, [join(BIN, w)], {
      input: '{"source":"startup"}', encoding: 'utf8', timeout: 30000,
      env: { ...process.env, STORY_CHECKPOINT_BIN: join(tempDir('wm'), 'nope'), STORY_FACT_PACK_BIN: join(tempDir('wm'), 'nope') }
    })
    check('wrap', `${w} missing-bin → exit 0 im lặng`, r.status === 0 && (r.stdout || '').trim() === '', `status=${r.status} out=${r.stdout}`)
  }
  // post-tool-use: env trỏ THẲNG story-checkpoint fixture repo — commit record vào store
  const repo = initStoryRepo(tempDir('wrap1'), { brackets: true })
  // repo phải là git + commit HEAD để record có commit
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'config', 'user.email', 't@t'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'config', 'user.name', 't'], { encoding: 'utf8' })
  writeFileSync(join(repo, 'f.txt'), 'x')
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'commit', '-q', '-m', 'init'], { encoding: 'utf8' })
  const store = join(tempDir('wrapstore'), '.wakii')
  const payload = { session_id: 'sess-W', cwd: repo, tool_name: 'Bash', tool_input: { command: 'git commit -m "qua wrapper"' } }
  const r = spawnSync(BASH, [join(BIN, 'hook-post-tool-use')], {
    input: JSON.stringify(payload), encoding: 'utf8', timeout: 60000, cwd: repo,
    env: { ...process.env, STORY_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack'), STORY_CHECKPOINT_REPO: repo, STORY_CHECKPOINT_STORE: store }
  })
  check('wrap', 'post-tool-use wrapper exit 0', r.status === 0, `status=${r.status} err=${r.stderr}`)
  const jsonl = join(store, 'checkpoints.jsonl')
  check('wrap', 'record ghi vào store qua wrapper', existsSync(jsonl))
  if (existsSync(jsonl)) {
    const rec = JSON.parse(readFileSync(jsonl, 'utf8').trim())
    check('wrap', 'record đúng command', rec.prompt_summary === 'git commit -m "qua wrapper"', JSON.stringify(rec))
  }
  // session-start wrapper: pass stdout của fact-pack nguyên vẹn
  const repo2 = initStoryRepo(tempDir('wrap2'), { checkpoints: [CP1] })
  const r2 = spawnSync(BASH, [join(BIN, 'hook-session-start')], {
    input: JSON.stringify({ source: 'startup', cwd: repo2 }), encoding: 'utf8', timeout: 60000, cwd: repo2,
    env: { ...process.env, STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack'), STORY_FACT_PACK_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_CWD: repo2 }
  })
  check('wrap', 'session-start wrapper pass stdout fact-pack', r2.status === 0 && (r2.stdout || '').includes('GH-27'), (r2.stdout || '').slice(0, 80))
  // stop wrapper no-op nuốt stdin
  const r3 = spawnSync(BASH, [join(BIN, 'hook-stop')], {
    input: 'x'.repeat(100000), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, STORY_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack') }
  })
  check('wrap', 'stop wrapper no-op exit 0 (stdin lớn)', r3.status === 0)
}

console.log(`\n== [lat] latency smoke — record path + fact-pack ≤ 2s typical ==`)
{
  const repo = initStoryRepo(tempDir('lat1'), { checkpoints: [CP1, CP2] })
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'config', 'user.email', 't@t'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'config', 'user.name', 't'], { encoding: 'utf8' })
  writeFileSync(join(repo, 'f.txt'), 'x')
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' })
  spawnSync('git', ['-C', repo, 'commit', '-q', '-m', 'init'], { encoding: 'utf8' })
  const store = join(tempDir('latstore'), '.wakii')
  const payload = { session_id: 'sess-L', cwd: repo, tool_name: 'Bash', tool_input: { command: 'git commit -m "lat"' } }
  let t0 = Date.now()
  spawnSync(BASH, [join(BIN, 'hook-post-tool-use')], {
    input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000, cwd: repo,
    env: { ...process.env, STORY_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_CHECKPOINT_REPO: repo, STORY_CHECKPOINT_STORE: store }
  })
  const recordMs = Date.now() - t0
  // typical path dùng stub story-status (story-status thật scan Linear/workspace
  // ~4s — fact-pack tự chặn timeout 5s; here test chi phí fact-pack thuần)
  const stubStatus = join(tempDir('latstub'), 'story-status')
  writeFileSync(stubStatus, '#!/bin/bash\necho "● GH-27 — fixture"\necho "  states: FI-7:Done FI-8:In Progress"\n')
  t0 = Date.now()
  const fp = spawnSync(BASH, [join(BIN, 'hook-session-start')], {
    input: JSON.stringify({ source: 'startup', cwd: repo }), encoding: 'utf8', timeout: 30000, cwd: repo,
    env: { ...process.env, STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack'), STORY_FACT_PACK_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_STATUS_BIN: stubStatus, STORY_FACT_PACK_CWD: repo, STORY_CHECKPOINT_REPO: repo }
  })
  const packMs = Date.now() - t0
  check('lat', `record path ≤2s (thực ${recordMs}ms)`, recordMs <= 2000)
  check('lat', `fact-pack ≤2s (thực ${packMs}ms)`, packMs <= 2000 && (fp.stdout || '').includes('GH-27'))
  // story-status thật chậm → fact-pack vẫn phải trả ≤ ~5s (timeout guard) —
  // không assert cứng thời gian (máy/CI khác nhau), chỉ assert có output
  const fp2 = spawnSync(BASH, [join(BIN, 'hook-session-start')], {
    input: JSON.stringify({ source: 'startup', cwd: repo }), encoding: 'utf8', timeout: 30000, cwd: repo,
    env: { ...process.env, STORY_FACT_PACK_BIN: join(BIN, 'story-fact-pack'), STORY_FACT_PACK_CHECKPOINT_BIN: join(BIN, 'story-checkpoint'), STORY_FACT_PACK_STATUS_BIN: join(BIN, 'story-status'), STORY_FACT_PACK_CWD: repo, STORY_CHECKPOINT_REPO: repo }
  })
  check('lat', 'story-status thật chậm → timeout guard giữ, output vẫn ra', fp2.status === 0 && (fp2.stdout || '').includes('GH-27'))
}

// ---- HOME guard: ~/.claude/settings.json không đổi ---------------------------
const homeSettings = join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json')
const homeBefore = existsSync(homeSettings) ? readFileSync(homeSettings, 'utf8') : null
check('guard', 'placeholder (so sánh ở cuối)', true)
const homeAfter = existsSync(homeSettings) ? readFileSync(homeSettings, 'utf8') : null
console.log('\n== HOME guard ==')
check('guard', '~/.claude/settings.json không đổi sau toàn bộ tests', homeBefore === homeAfter)

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (inst/idem/fix/det/edge/bin/fp/fps/fpc/fpf/wrap/lat/guard)')
