// kit-rehash-check tests — fence "rehash sót" qua fixture git repo + mini kit.
// Chạy: node config/scripts/kit-rehash-check.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('./kit-rehash-check.mjs', import.meta.url).pathname
let pass = 0, fail = 0
const failures = []
const check = (id, name, cond, detail = '') => {
  if (cond === true) pass++
  else fail++, failures.push(`${id} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${cond === true ? 'PASS' : 'FAIL'}] ${id} ${name}${cond === true ? '' : ' — ' + (detail || 'assert sai')}`)
}
const TMP_ROOTS = []
const tempDir = (tag) => { const d = mkdtempSync(join(tmpdir(), `krc-${tag}-`)); TMP_ROOTS.push(d); return d }
const GITENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (repo, args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: GITENV })

// fixture: git repo + mini kit (kit.json + bin/x + main.mjs hash stub + bundled)
function makeFixture(tag, { kitHash, fingerprint }) {
  const root = tempDir(tag)
  const kit = join(root, 'kit')
  mkdirSync(join(kit, 'bin'), { recursive: true })
  writeFileSync(join(kit, 'main.mjs'), `export function computeKitHash(){ return ${JSON.stringify(kitHash)} }\nexport function hashPackagedPluginTree(){ return ${JSON.stringify(fingerprint)} }\n`)
  writeFileSync(join(kit, 'bin', 'x.sh'), '#!/bin/sh\n')
  writeFileSync(join(kit, 'kit.json'), JSON.stringify({ version: '0.0.0', kitHash, provides: [{ name: 'x', type: 'bin' }] }))
  mkdirSync(join(root, 'launch'), { recursive: true })
  writeFileSync(join(root, 'launch', 'bundled-plugins.json'), JSON.stringify({ plugins: [{ pluginKey: 'mini', contentHash: fingerprint }] }))
  git(root, ['init']); git(root, ['add', '-A']); git(root, ['commit', '-m', 'i'])
  return { root, kit }
}
function stage(repo, rel) { writeFileSync(join(repo, rel), 'staged-' + Date.now()); git(repo, ['add', rel]) }
function run(root, env = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8', cwd: root, timeout: 30000,
    env: { ...process.env, KIT_ROOT: join(root, 'kit'), KIT_MAIN: join(root, 'kit', 'main.mjs'), BUNDLED: join(root, 'launch', 'bundled-plugins.json'), LAUNCH_ROOT: join(root, 'launch'), ...env },
  })
}
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

console.log('== C0 không staged file kit → exit 0 ==')
{
  const root = tempDir('c0')
  const r = run(root)
  check('C0', 'exit 0 không fixture-kit', r.status === 0, `code=${r.status}`)
}

console.log('== C1 kit staged + hash stale → FAIL + hint ==')
{
  const f = makeFixture('c1', { kitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })
  stage(f.root, 'kit/bin/x.sh')
  const st = join(f.root, 'kit', 'kit.json'); const j = read(st); j.kitHash = '11111111111111111111111111111111'; writeFileSync(st, JSON.stringify(j))
  git(f.root, ['add', 'kit/kit.json'])
  const r = run(f.root)
  check('C1', 'exit 1', r.status === 1, `code=${r.status} out=${r.stdout.slice(0, 150)} err=${r.stderr.slice(0, 150)}`)
  check('C1', 'hint kitHash stale', (r.stdout + r.stderr).includes('11111111'), (r.stdout + r.stderr).slice(0, 200))
}

console.log('== C2 kit staged + fingerprint stale → FAIL ==')
{
  const f = makeFixture('c2', { kitHash: 'cccccccccccccccccccccccccccccccc', fingerprint: 'dddddddddddddddddddddddddddddddd' })
  stage(f.root, 'kit/bin/x.sh')
  const bl = join(f.root, 'launch', 'bundled-plugins.json'); const j = read(bl)
  j.plugins[0].contentHash = '22222222222222222222222222222222'; writeFileSync(bl, JSON.stringify(j))
  git(f.root, ['add', 'launch/bundled-plugins.json'])
  const r = run(f.root)
  check('C2', 'exit 1', r.status === 1, `code=${r.status}`)
  check('C2', 'hint fingerprint stale', (r.stdout + r.stderr).includes('22222222'), (r.stdout + r.stderr).slice(0, 200))
}

console.log('== C3 kit staged + hash khớp → exit 0 ==')
{
  const f = makeFixture('c3', { kitHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', fingerprint: 'ffffffffffffffffffffffffffffffff' })
  stage(f.root, 'kit/bin/x.sh')
  const r = run(f.root)
  check('C3', 'exit 0 hash khớp', r.status === 0, `code=${r.status} out=${r.stdout.slice(0, 150)}`)
}

console.log('== C4 git add -f staged → cũng FAIL (đường add -f né envfiles guard) ==')
{
  const f = makeFixture('c4', { kitHash: 'cccccccccccccccccccccccccccccccc', fingerprint: 'dddddddddddddddddddddddddddddddd' })
  stage(f.root, 'kit/bin/x.sh')
  git(f.root, ['add', 'kit/bin/x.sh'])
  const st = join(f.root, 'kit', 'kit.json'); const j = read(st); j.kitHash = '99999999999999999999999999999999'; writeFileSync(st, JSON.stringify(j))
  git(f.root, ['add', 'kit/kit.json'])
  const r = run(f.root)
  check('C4', 'exit 1 hash stale', r.status === 1, `code=${r.status}`)
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
