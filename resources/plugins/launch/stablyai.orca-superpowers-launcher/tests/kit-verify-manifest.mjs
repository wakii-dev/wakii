// One-shot verify: kit.json hợp lệ qua validator thật (installKit named
// export) trên temp root — không đụng HOME thật. Chạy: node tests/kit-verify-manifest.mjs
// Version assert đọc từ kit.json (bump hợp lệ không làm test đỏ).
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const kitRoot = join(pluginRoot, 'kit')
const { installKit } = await import(pathToFileURL(join(pluginRoot, 'main.mjs')))

const calls = { notifications: [], logs: [] }
const orca = {
  host: { call: async (action, payload) => { if (action === 'notifications.show') calls.notifications.push(payload); return { ok: true } } },
  log: (...a) => { calls.logs.push(a.join(' ')) }
}

const root = mkdtempSync(join(tmpdir(), 'kit-verify-'))
const before = existsSync(join(root, '.story-team-kit-version')) ? readFileSync(join(root, '.story-team-kit-version'), 'utf8') : null
const r = await installKit(orca, { root, kitRoot })
const ver = existsSync(join(root, '.story-team-kit-version')) ? readFileSync(join(root, '.story-team-kit-version'), 'utf8').trim() : null

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}`) } else { fail++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`) }
}

const kitJson = JSON.parse(readFileSync(join(kitRoot, 'kit.json'), 'utf8'))
const { computeKitHash } = await import(pathToFileURL(join(pluginRoot, 'main.mjs')))
ok('installKit trả true (manifest hợp lệ)', r === true)
ok(`marker = ${kitJson.version} (khớp kit.json)`, ver === kitJson.version || ver === `${kitJson.version}:${kitJson.kitHash}`, `got ${JSON.stringify(ver)}`)
// kitHash (2.14.2): kit.json tự khai hash cây kit/ — khớp computeKitHash.
// Lệch = ai đó sửa kit/ mà không rehash (root cause launch-content 1.4.203).
{
  const declared = typeof kitJson.kitHash === 'string' ? kitJson.kitHash.trim() : ''
  ok('kit.json có kitHash hex', /^[0-9a-f]{8,64}$/.test(declared), `got ${JSON.stringify(kitJson.kitHash)}`)
  ok('kitHash khớp computeKitHash(kit/)', declared === computeKitHash(kitRoot),
    `declared=${declared} actual=${computeKitHash(kitRoot)}`)
  ok(`marker đầy đủ version:hash`, ver === `${kitJson.version}:${declared}`, `got ${JSON.stringify(ver)}`)
}
// Drift guard source↔vendored (2.14.2): source repo (local-only) phải khớp
// vendored trên đúng contract sync-kit — bin/ + skills/ + agents/ + kit.json.
// Lệch = lần sync-kit tới xoá sạch doctrine mới (2.14.x từng chỉ tồn tại
// vendored). CI không có source repo → SKIP; local discipline → FAIL.
{
  const osHome = process.env.HOME || process.env.USERPROFILE || ''
  const srcCandidates = [process.env.WAKII_KIT_SRC, join(osHome, 'Desktop', 'projects', 'story-team-kit')].filter(Boolean)
  const src = srcCandidates.find(p => existsSync(join(p, 'kit.json')) && existsSync(join(p, 'skills')) && existsSync(join(p, 'bin')))
  if (!src) {
    console.log('  [SKIP] drift guard source↔vendored — không thấy source repo (đặt WAKII_KIT_SRC)')
  } else {
    const excluded = new Set(['bin/story-dashboard-server', 'bin/story-dashboard.html'])
    const walkTree = rootDir => {
      const out = new Map()
      for (const sub of ['bin', 'skills', 'agents']) {
        const stack = ['']
        while (stack.length) {
          const rel = stack.pop()
          for (const ent of readdirSync(join(rootDir, sub, rel), { withFileTypes: true })) {
            if (ent.name === '__pycache__' || ent.name === '.DS_Store' || ent.name.endsWith('.pyc')) continue
            const r = rel ? `${rel}/${ent.name}` : ent.name
            if (ent.isDirectory()) stack.push(r)
            else if (ent.isFile() && !excluded.has(`${sub}/${r}`)) out.set(`${sub}/${r}`, readFileSync(join(rootDir, sub, r)))
          }
        }
      }
      out.set('kit.json', readFileSync(join(rootDir, 'kit.json')))
      return out
    }
    const srcFiles = walkTree(src)
    const venFiles = walkTree(kitRoot)
    const onlySrc = [...srcFiles.keys()].filter(k => !venFiles.has(k))
    const onlyVen = [...venFiles.keys()].filter(k => !srcFiles.has(k))
    const diffContent = [...srcFiles.keys()].filter(k => venFiles.has(k) && !srcFiles.get(k).equals(venFiles.get(k)))
    ok('drift guard: source == vendored (file list + content)',
      onlySrc.length === 0 && onlyVen.length === 0 && diffContent.length === 0,
      `only-src=${onlySrc.slice(0, 3)} only-vendored=${onlyVen.slice(0, 3)} khác-nội-dung=${diffContent.slice(0, 3)} — sync-back hoặc sync-kit`)
  }
}
// exec-bit: git có thể lưu 100644 → checkout/sync sinh bins không chạy được
// (learned 2026-09-11 — 10 bins exit 126). Asset .html được loại.
// Windows NTFS không represent exec-bit (mode luôn 0666) — chỉ assert trên POSIX.
if (process.platform !== 'win32') {
  const binDir = join(kitRoot, 'bin')
  const nonExec = readdirSync(binDir).filter(f => !f.endsWith('.html') && !(statSync(join(binDir, f)).mode & 0o111))
  ok('kit/bin: mọi bins executable', nonExec.length === 0, `non-exec: ${nonExec.join(',')}`)
}

// so SỐ học — '2.10.0' >= '2.8.0' sai theo string (lexicographic)
{
  const m = /^([1-9]\d*)\.(\d+)\.(\d+)$/.exec(kitJson.version || '')
  const ge = !!m && (+m[1] > 2 || (+m[1] === 2 && (+m[2] > 8 || (+m[2] === 8 && +m[3] >= 0))))
  ok('version semver + >= 2.8.0 (GH-42 fan-in tối thiểu)', ge, `got ${kitJson.version}`)
}
ok('permission-matrix.md ở kit ROOT — ngoài scan two-way, KHÔNG entry provides',
  existsSync(join(kitRoot, 'permission-matrix.md'))
    && !kitJson.provides.some(e => e.name === 'permission-matrix'))
ok('entry story-report-validate trong provides', kitJson.provides.some(e => e.name === 'story-report-validate' && e.type === 'bin'))
ok('entry story-surface-lint trong provides', kitJson.provides.some(e => e.name === 'story-surface-lint' && e.type === 'bin'))
ok('entry story-kb trong provides', kitJson.provides.some(e => e.name === 'story-kb' && e.type === 'bin'))
// Review đa chiều (2.14.0): coverage + position-verify + meta-test trong code-reviewer def
// Input + policy (2.14.1, học tiếp open-code-review): deterministic-first + precision + adaptive depth
{
  const cr = readFileSync(join(kitRoot, 'agents', 'code-reviewer.md'), 'utf8')
  ok('code-reviewer: coverage pass', cr.includes('Coverage pass'))
  ok('code-reviewer: position-verify pass', cr.includes('Position-verify pass'))
  ok('code-reviewer: meta-test rule', cr.includes('Meta-test rule'))
  ok('code-reviewer: deterministic-first pass', cr.includes('Deterministic-first pass'))
  ok('code-reviewer: precision policy', cr.includes('Precision policy'))
  ok('code-reviewer: adaptive depth', cr.includes('Adaptive depth'))
}
ok('migration-guide-template cạnh bracket-template', existsSync(join(kitRoot, 'migration-guide-template.md')))
ok('entry story-lesson trong provides', kitJson.provides.some(e => e.name === 'story-lesson' && e.type === 'bin'))
ok('KHÔNG notify (không block)', calls.notifications.length === 0, JSON.stringify(calls.notifications))
ok('bin mới copy đủ (5 files)', ['story-fact-pack', 'story-hooks-install', 'hook-post-tool-use', 'hook-session-start', 'hook-stop'].every(f => existsSync(join(root, 'bin', f))))
ok('settings.json merge kèm install (SF-2 seam)', existsSync(join(root, 'settings.json')) && readFileSync(join(root, 'settings.json'), 'utf8').includes('hook-session-start'))
ok('log nói hooks merged', calls.logs.some(l => l.includes('hooks merged')), calls.logs.join(' | '))

rmSync(root, { recursive: true, force: true })
console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
