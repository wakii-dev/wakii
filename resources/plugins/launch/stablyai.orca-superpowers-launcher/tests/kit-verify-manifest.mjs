// One-shot verify: kit.json hợp lệ qua validator thật (installKit named
// export) trên temp root — không đụng HOME thật. Chạy: node tests/kit-verify-manifest.mjs
// Version assert đọc từ kit.json (bump hợp lệ không làm test đỏ).
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync } from 'node:fs'
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
ok('installKit trả true (manifest hợp lệ)', r === true)
ok(`marker = ${kitJson.version} (khớp kit.json)`, ver === kitJson.version, `got ${JSON.stringify(ver)}`)
ok('version semver + >= 2.8.0 (GH-42 fan-in tối thiểu)', /^\d+\.\d+\.\d+$/.test(kitJson.version) && kitJson.version >= '2.8.0', `got ${kitJson.version}`)
ok('permission-matrix.md ở kit ROOT — ngoài scan two-way, KHÔNG entry provides',
  existsSync(join(kitRoot, 'permission-matrix.md'))
    && !kitJson.provides.some(e => e.name === 'permission-matrix'))
ok('entry story-report-validate trong provides', kitJson.provides.some(e => e.name === 'story-report-validate' && e.type === 'bin'))
ok('entry story-surface-lint trong provides', kitJson.provides.some(e => e.name === 'story-surface-lint' && e.type === 'bin'))
ok('migration-guide-template cạnh bracket-template', existsSync(join(kitRoot, 'migration-guide-template.md')))
ok('entry story-lesson trong provides', kitJson.provides.some(e => e.name === 'story-lesson' && e.type === 'bin'))
ok('KHÔNG notify (không block)', calls.notifications.length === 0, JSON.stringify(calls.notifications))
ok('bin mới copy đủ (5 files)', ['story-fact-pack', 'story-hooks-install', 'hook-post-tool-use', 'hook-session-start', 'hook-stop'].every(f => existsSync(join(root, 'bin', f))))
ok('settings.json merge kèm install (SF-2 seam)', existsSync(join(root, 'settings.json')) && readFileSync(join(root, 'settings.json'), 'utf8').includes('hook-session-start'))
ok('log nói hooks merged', calls.logs.some(l => l.includes('hooks merged')), calls.logs.join(' | '))

rmSync(root, { recursive: true, force: true })
console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
