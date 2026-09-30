// story-distributed-claim tests — FI-51 verification layer (5 ACCEPTANCE).
// Chạy: node tests/story-distributed-claim-tests.mjs
// Stub Linear GraphQL cục bộ (LINEAR_GRAPHQL_ENDPOINT override có sẵn trong lib)
// + git fixture bare remote (file://) — không network thật, không mock production code.
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const BIN = join(pluginRoot, 'kit', 'bin')
const LAUNCH = join(BIN, 'story-launch')
const DCLIB = join(BIN, 'story-distributed-claim')

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}`) } else { fail++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`) }
}

const T = (p) => p.replace(/\\/g, '/')
const tempDir = (tag) => T(mkdtempSync(join(tmpdir(), `dc-${tag}-`)))
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

// ── Linear GraphQL stub — đúng đủ surface lib dùng (claim read/write/renew/
// takeover/list + linear_state). Timestamp comment tăng đơn điệu (+1ms/commit)
// để claim_parse "latest wins" phản ánh thứ tự ghi thật như Linear ms-precision.
class LinearStub {
  constructor() {
    this.comments = [] // {id, body, createdAt, updatedAt}
    this.labels = [] // {id, name, createdAt}
    this.seq = 0
    this.log = []
    this.failAll = false
    this.server = http.createServer((req, res) => this.handler(req, res))
  }
  start() {
    return new Promise((ok) => this.server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${this.server.address().port}/graphql`)))
  }
  stop() { return new Promise((ok) => this.server.close(ok)) }
  claimBody(mid) { return `🤖 claimed by ${mid} ${new Date().toISOString()}` }
  addComment(body, tsIso) {
    const now = new Date(Date.now() + this.seq++).toISOString()
    const c = { id: `c${this.seq}`, body, createdAt: tsIso || now, updatedAt: tsIso || now }
    this.comments.push(c)
    return c
  }
  issueShape() {
    return { comments: { nodes: this.comments }, labels: { nodes: this.labels } }
  }
  handler(req, res) {
    let raw = ''
    req.on('data', (d) => { raw += d })
    req.on('end', () => {
      this.log.push(raw)
      const reply = (obj, code = this.failAll ? 500 : 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (this.failAll) { reply({ errors: [{ message: 'stub down' }] }); return }
      let body = {}
      try { body = JSON.parse(raw) } catch { reply({ errors: [{ message: 'bad json' }] }); return }
      const q = String(body.query || '')
      if (/state\{name\}/.test(q)) { reply({ data: { issue: { state: { name: 'Todo' } } } }); return }
      if (/comments\(last:50\)/.test(q)) { reply({ data: { issue: this.issueShape() } }); return }
      if (/comments\(last:20\)/.test(q)) {
        const data = {}
        for (const m of q.matchAll(/a(\d+):\s*issue\(/g)) data[`a${m[1]}`] = this.issueShape()
        reply({ data })
        return
      }
      if (/issueLabels\(first:1/.test(q)) {
        const hit = this.labels.find((l) => l.name === (body.variables || {}).n)
        reply({ data: { issueLabels: { nodes: hit ? [hit] : [] } } })
        return
      }
      if (/issueLabelCreate/.test(q)) {
        const l = { id: `lab${this.seq++}`, name: body.variables.input.name, createdAt: new Date().toISOString() }
        this.labels.push(l)
        reply({ data: { issueLabelCreate: { issueLabel: { id: l.id, name: l.name } } } })
        return
      }
      if (/commentCreate/.test(q)) {
        const c = this.addComment(body.variables.input.body)
        reply({ data: { commentCreate: { comment: { id: c.id, createdAt: c.createdAt } } } })
        return
      }
      if (/commentUpdate/.test(q)) {
        const c = this.comments.find((x) => x.id === (body.variables.input || {}).id)
        if (!c) { reply({ errors: [{ message: 'no such comment' }] }); return }
        c.body = body.variables.input.body
        c.updatedAt = new Date(Date.now() + this.seq++).toISOString()
        reply({ data: { commentUpdate: { comment: { id: c.id, updatedAt: c.updatedAt } } } })
        return
      }
      if (/issueUpdate/.test(q)) {
        const ids = (body.variables.input || {}).labelIds || []
        this.labels = this.labels.filter((l) => ids.includes(l.id))
        reply({ data: { issueUpdate: { success: true } } })
        return
      }
      reply({ errors: [{ message: 'unhandled query' }] })
    })
  }
  count(re) { return this.log.filter((l) => re.test(l)).length }
}

// ── fixtures ────────────────────────────────────────────────────────────────
function writeFakeOrca(home) {
  const p = join(home, 'fake-orca')
  writeFileSync(p, '#!/bin/bash\nexit 1\n')
  chmodSync(p, 0o755)
  return p
}

// python3 shim — kit bins gọi python3; một số máy Windows chỉ có python
function writePy3Shim(home) {
  const binDir = join(home, 'shim-bin')
  mkdirSync(binDir, { recursive: true })
  const p = join(binDir, 'python3')
  writeFileSync(p, '#!/bin/sh\nexec python "$@"\n')
  chmodSync(p, 0o755)
  return binDir
}

// bracket fixture — format `## SF-N <title>` (không colon: claim_list_all awk
// lấy $2 làm sfNum, colon sẽ dính vào tên)
function writeBracket(dir) {
  const p = join(dir, 'fi458-distributed-bracket.md')
  writeFileSync(p, [
    '# Story: FI-458 distributed bracket — epic FI-50',
    'Destination: story/fi458-distributed-bracket',
    'Worktree model: story-hub',
    '',
    '## SF-1 Claim core verification',
    'linear: FI-TEST-1',
    'Depends on:',
    '',
  ].join('\n'))
  return p
}

function writeConfig(dir, distributed) {
  const p = join(dir, 'story-kit.json')
  writeFileSync(p, JSON.stringify({ distributed }))
  return p
}

function envFor(stubUrl, home, extra = {}) {
  return {
    ...process.env,
    HOME: home,
    PATH: `${writePy3Shim(home)};${process.env.PATH}`,
    STORY_KIT_CONFIG: join(home, 'story-kit.json'),
    LINEAR_GRAPHQL_ENDPOINT: stubUrl,
    LINEAR_API_KEY: 'test-key',
    ORCA_BIN: writeFakeOrca(home),
    ...extra,
  }
}

function runLaunch(env, args, timeout = 120000) {
  return spawnSync('bash', [LAUNCH, ...args], { encoding: 'utf8', env, timeout })
}

// sync lib-call — CHỈ dùng cho case endpoint chết (không chạm stub sống)
function runLib(env, script, timeout = 60000) {
  return spawnSync('bash', ['-c', script], { encoding: 'utf8', env, timeout })
}

// async spawn — BẮT BUỘC cho run chạm stub: spawnSync block node event loop
// → stub (cùng process) không trả lời → curl treo tới -m 10 (rc 28)
function runLaunchA(env, args, timeout = 120000) {
  return new Promise((res) => {
    const p = spawn('bash', [LAUNCH, ...args], { env })
    let out = ''
    let err = ''
    const t = setTimeout(() => p.kill(), timeout)
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => { clearTimeout(t); res({ status: -1, stdout: out, stderr: err + `spawn-error: ${e.message}` }) })
    p.on('close', (code) => { clearTimeout(t); res({ status: code, stdout: out, stderr: err }) })
  })
}

function runLibA(env, script, timeout = 60000) {
  return new Promise((res) => {
    const p = spawn('bash', ['-c', script], { env })
    let out = ''
    let err = ''
    const t = setTimeout(() => p.kill(), timeout)
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => { clearTimeout(t); res({ status: -1, stdout: out, stderr: err + `spawn-error: ${e.message}` }) })
    p.on('close', (code) => { clearTimeout(t); res({ status: code, stdout: out, stderr: err }) })
  })
}

// git fixture: work clone + bare origin với dest branch; trả {repo, bare}
function gitFixture(dir, { pushSfFresh = false, pushSfStale = false } = {}) {
  const g = (args, opts = {}) => {
    const r = spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: opts.date || '', GIT_COMMITTER_DATE: opts.date || '' } })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} rc=${r.status}: ${r.stderr}`)
    return r
  }
  const bare = join(dir, 'origin.git')
  const repo = join(dir, 'work')
  g(['init', '--bare', bare])
  g(['init', repo])
  g(['-C', repo, 'config', 'user.email', 'test@example.com'])
  g(['-C', repo, 'config', 'user.name', 'Test'])
  g(['-C', repo, 'config', 'protocol.file.allow', 'always'])
  writeFileSync(join(repo, 'README.md'), 'fixture\n')
  g(['-C', repo, 'add', 'README.md'])
  g(['-C', repo, 'commit', '-m', 'init'])
  g(['-C', repo, 'branch', 'story/fi458-distributed-bracket'])
  g(['-C', repo, 'remote', 'add', 'origin', T(bare)])
  g(['-C', repo, 'push', 'origin', 'story/fi458-distributed-bracket'])
  if (pushSfFresh || pushSfStale) {
    g(['-C', repo, 'checkout', '-b', 'sf-1-claim-core-verification'])
    writeFileSync(join(repo, pushSfFresh ? 'wip.txt' : 'old.txt'), 'x\n')
    g(['-C', repo, 'add', pushSfFresh ? 'wip.txt' : 'old.txt'])
    if (pushSfStale) {
      g(['-C', repo, 'commit', '-m', 'old wip', { date: '2020-01-01T00:00:00Z' }])
    } else {
      g(['-C', repo, 'commit', '-m', 'fresh wip'])
    }
    g(['-C', repo, 'push', 'origin', 'sf-1-claim-core-verification'])
    g(['-C', repo, 'checkout', 'story/fi458-distributed-bracket'])
  }
  return { repo, bare }
}

const ARGS = (bracket, repo) => ['--sf', 'SF-1', '--bracket', T(bracket), '--repo', T(repo)]
const LAUNCH_TIMEOUT_MS = 120000

// ═══ [u] Unit — lib thuần ══════════════════════════════════════════════════
console.log('== [dcu1] distributed_config_load — fail-open + clamp ==')
{
  const home = tempDir('u1')
  const env = envFor('http://127.0.0.1:9/graphql', home)
  // thiếu file → defaults
  let r = runLib(env, `. '${T(DCLIB)}'; distributed_config_load; echo "$DC_ENABLED|$DC_TTL|$DC_MACHINE_ID"`)
  let parts = (r.stdout || '').trim().split('|')
  check('dcu1: thiếu file → enabled=0', parts[0] === '0', `${r.stdout}|${r.stderr}`)
  check('dcu1: thiếu file → ttl=10', parts[1] === '10', r.stdout)
  check('dcu1: thiếu file → mid sanitized ^[a-z0-9-]+$', /^[a-z0-9-]+$/.test(parts[2] || ''), parts[2])
  // json hỏng → defaults
  writeFileSync(join(home, 'story-kit.json'), '{broken')
  r = runLib(env, `. '${T(DCLIB)}'; distributed_config_load; echo "$DC_ENABLED|$DC_TTL"`)
  check('dcu1: json hỏng → 0|10', (r.stdout || '').trim() === '0|10', r.stdout)
  // hợp lệ + clamp ttl âm
  writeConfig(home, { enabled: true, machineId: 'Machine_A!@#', claimTtlMinutes: -3 })
  r = runLib(env, `. '${T(DCLIB)}'; distributed_config_load; echo "$DC_ENABLED|$DC_TTL|$DC_MACHINE_ID"`)
  parts = (r.stdout || '').trim().split('|')
  check('dcu1: enabled=1 đọc đúng', parts[0] === '1', r.stdout)
  check('dcu1: ttl âm → clamp 10', parts[1] === '10', r.stdout)
  check('dcu1: machineId sanitized', parts[2] === 'machine-a', parts[2])
}

console.log('== [dcu2] sanitize_machine_id — GraphQL-safe ==')
{
  const home = tempDir('u2')
  const env = envFor('http://127.0.0.1:9/graphql', home)
  let r = runLib(env, `. '${T(DCLIB)}'; sanitize_machine_id "Machine_A!@# X"`)
  check('dcu2: ký tự lạ → [a-z0-9-]', /^[a-z0-9-]+$/.test((r.stdout || '').trim()), r.stdout)
  r = runLib(env, `. '${T(DCLIB)}'; sanitize_machine_id ""`)
  check('dcu2: rỗng → machine-<hash6>', /^machine-[0-9a-f]{6}$/.test((r.stdout || '').trim()), r.stdout)
  r = runLib(env, `. '${T(DCLIB)}'; sanitize_machine_id "MÁY-1"`)
  check('dcu2: non-ASCII → không còn uppercase/ký tự lạ', /^[a-z0-9-]+$/.test((r.stdout || '').trim()), r.stdout)
}

console.log('== [dcu3] claim_parse — empty/fresh/partial/latest ==')
{
  const home = tempDir('u3')
  const env = envFor('http://127.0.0.1:9/graphql', home)
  // KHÔNG trim — claim_parse 7-cột có leading tabs; trim làm lệch chỉ mục
  const parse = (obj) => runLib(env, `. '${T(DCLIB)}'; claim_parse '${JSON.stringify(obj)}'`).stdout.split('\t')
  const now = new Date().toISOString()
  const issue = (comments, labels = []) => ({ data: { issue: { comments: { nodes: comments }, labels: { nodes: labels } } } })
  check('dcu3: không claim → stdout rỗng', parse(issue([])).join('').replace(/\t/g, '') === '')
  const fresh = { id: 'c1', body: '🤖 claimed by machine-a 2026-01-01T00:00:00Z', createdAt: now, updatedAt: now }
  let cols = parse(issue([fresh]))
  check('dcu3: fresh claim → mid cột 1', cols[0] === 'machine-a', cols.join('§'))
  check('dcu3: hasLabel=0 khi không label', cols[3] === '0')
  check('dcu3: partial=0 khi có comment', cols[6] === '0')
  cols = parse(issue([], [{ id: 'lab1', name: 'claimed/machine-b', createdAt: now }]))
  check('dcu3: label-không-comment → partial=1', cols[6] === '1', cols.join('§'))
  const old = { id: 'c0', body: '🤖 claimed by machine-old 2020-01-01T00:00:00Z', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' }
  cols = parse(issue([old, fresh]))
  check('dcu3: nhiều comment → updatedAt mới nhất thắng', cols[0] === 'machine-a', cols.join('§'))
}

console.log('== [dcu4] linear_graphql — rc3 thiếu key ==')
{
  const home = tempDir('u4')
  const env = { ...process.env, HOME: home, LINEAR_GRAPHQL_ENDPOINT: 'http://127.0.0.1:9/graphql' }
  delete env.LINEAR_API_KEY
  const r = runLib(env, `. '${T(DCLIB)}'; linear_graphql '{"query":"query{issue{id}}"}'; echo "rc=$?"`)
  check('dcu4: thiếu key (env + ~/.linear-key) → rc3', (r.stdout || '').includes('rc=3'), `${r.stdout}|${r.stderr}`)
}

// ═══ [e] E2E — story-launch qua stub + git fixture ═════════════════════════
console.log('== [dce1] AC1 — race 2 process song song: đúng 1 tiến qua guard ==')
{
  const dir = tempDir('e1')
  const home = tempDir('e1home')
  const bracket = writeBracket(dir)
  const { repo, bare } = gitFixture(dir)
  const stub = new LinearStub()
  const url = await stub.start()
  const envA = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e1ca'), { enabled: true, machineId: 'machine-a', claimTtlMinutes: 10 }) })
  const envB = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e1cb'), { enabled: true, machineId: 'machine-b', claimTtlMinutes: 10 }) })
  const runAsync = (env, mid) => new Promise((res) => {
    const p = spawn('bash', [LAUNCH, ...ARGS(bracket, repo), '--claim', '--machine-id', mid], { env })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('error', (e) => { out += `spawn-error: ${e.message}`; res({ code: -1, out }) })
    p.on('close', (code) => res({ code, out }))
  })
  const [a, b] = await Promise.all([
    runAsync(envA, 'machine-a'),
    sleep(200).then(() => runAsync(envB, 'machine-b')),
  ])
  await stub.stop()
  const outs = [a.out, b.out]
  const winners = outs.filter((o) => o.includes('LAUNCH FAIL'))
  const losers = outs.filter((o) => !o.includes('LAUNCH FAIL'))
  check('dce1: đúng 1 process tới fork attempt (LAUNCH FAIL)', winners.length === 1, JSON.stringify(outs))
  check('dce1: process kia skip/lost (không fork)', losers.length === 1 && /claimed by machine-|thua race|git-guard lost|git-guard push FAIL/.test(losers[0]), losers[0])
  check('dce1: stub ghi nhận ≥1 claim commentCreate', stub.count(/commentCreate/) >= 1, String(stub.count(/commentCreate/)))
  const ls = spawnSync('git', ['-C', T(bare), 'rev-parse', '--verify', 'refs/heads/sf-1-claim-core-verification'], { encoding: 'utf8' })
  check('dce1: guard branch tạo trên remote đúng 1 nhánh', ls.status === 0)
}

console.log('== [dce1b] AC1 tuần tự — winner fork, loser SKIP thấy claim tươi ==')
{
  const dir = tempDir('e1b')
  const home = tempDir('e1bhome')
  const bracket = writeBracket(dir)
  const { repo, bare } = gitFixture(dir)
  const stub = new LinearStub()
  const url = await stub.start()
  const envA = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e1bca'), { enabled: true, machineId: 'machine-a', claimTtlMinutes: 10 }) })
  const envB = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e1bcb'), { enabled: true, machineId: 'machine-b', claimTtlMinutes: 10 }) })
  const r1 = await runLaunchA(envA, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'])
  const r2 = await runLaunchA(envB, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-b'])
  await stub.stop()
  check('dce1b: machine-a ghi claim (commentCreate)', stub.count(/commentCreate/) >= 1)
  check('dce1b: machine-a tới fork attempt (LAUNCH FAIL qua fake-orca)', (r1.stdout || '').includes('LAUNCH FAIL'), `${r1.status}|${r1.stdout}`)
  check('dce1b: machine-b SKIP thấy claim machine-a', (r2.stdout || '').includes('claimed by machine-a'), `${r2.status}|${r2.stdout}`)
  check('dce1b: machine-b không fork', !(r2.stdout || '').includes('LAUNCH FAIL'), r2.stdout)
  check('dce1b: machine-b exit 0 (skip)', r2.status === 0, String(r2.status))
  const ls = spawnSync('git', ['-C', T(bare), 'rev-parse', '--verify', 'refs/heads/sf-1-claim-core-verification'], { encoding: 'utf8' })
  check('dce1b: guard branch tồn tại trên remote', ls.status === 0)
}

console.log('== [dce2] AC2 — stale ≥2×TTL + không commit mới → TAKEOVER ==')
{
  const dir = tempDir('e2')
  const home = tempDir('e2home')
  const bracket = writeBracket(dir)
  const { repo } = gitFixture(dir) // sf branch KHÔNG tồn tại trên remote
  const stub = new LinearStub()
  const url = await stub.start()
  const staleTs = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  stub.addComment(stub.claimBody('machine-old'), staleTs)
  const env = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e2c'), { enabled: true, machineId: 'machine-a', claimTtlMinutes: 5 }) })
  const r = await runLaunchA(env, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'])
  await stub.stop()
  check('dce2: TAKEOVER machine-old → machine-a', (r.stdout || '').includes('TAKEOVER SF-1: machine-old → machine-a'), `${r.status}|${r.stdout}|${r.stderr}`)
  check('dce2: revoke comment ghi trên issue', stub.comments.some((c) => (c.body || '').includes('claim revoked')), JSON.stringify(stub.comments.map((c) => c.body)))
  check('dce2: takeover tới fork attempt', (r.stdout || '').includes('LAUNCH FAIL'), r.stdout)
}

console.log('== [dce3] AC3 — stale NHƯNG commits-fresh → KHÔNG takeover ==')
{
  const dir = tempDir('e3')
  const home = tempDir('e3home')
  const bracket = writeBracket(dir)
  const { repo } = gitFixture(dir, { pushSfFresh: true }) // sf branch có commit mới
  const stub = new LinearStub()
  const url = await stub.start()
  const staleTs = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  stub.addComment(stub.claimBody('machine-old'), staleTs)
  const env = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e3c'), { enabled: true, machineId: 'machine-a', claimTtlMinutes: 5 }) })
  const r = await runLaunchA(env, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'])
  await stub.stop()
  check('dce3: chặn bởi commits-fresh', (r.stdout || '').includes('commits-fresh'), `${r.status}|${r.stdout}|${r.stderr}`)
  check('dce3: skip exit 0', r.status === 0, String(r.status))
  check('dce3: không revoke claim cũ', !stub.comments.some((c) => (c.body || '').includes('claim revoked')))
}

console.log('== [dce4] AC4 — enabled=false zero-diff + 0 claim request ==')
{
  const dir = tempDir('e4')
  const home = tempDir('e4home')
  const bracket = writeBracket(dir)
  const { repo } = gitFixture(dir)
  const stub = new LinearStub()
  const url = await stub.start()
  const envOff = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e4off'), { enabled: false, machineId: 'machine-a', claimTtlMinutes: 10 }) })
  const rOff = await runLaunchA(envOff, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'])
  const envNoFlag = envFor(url, home, { STORY_KIT_CONFIG: writeConfig(tempDir('e4nf'), { enabled: false }) })
  const rNoFlag = await runLaunchA(envNoFlag, ARGS(bracket, repo))
  await stub.stop()
  check('dce4: --claim+disabled ≡ không-flag (stdout y hệt)', rOff.stdout === rNoFlag.stdout, `${JSON.stringify(rOff.stdout)} vs ${JSON.stringify(rNoFlag.stdout)}`)
  check('dce4: rc bằng nhau', rOff.status === rNoFlag.status, `${rOff.status} vs ${rNoFlag.status}`)
  check('dce4: 0 claim request (chỉ linear_state)', stub.count(/commentCreate|comments\(last:50\)/) === 0, String(stub.log.length))
}

console.log('== [dce5] AC5 — Linear offline + enabled → fail-closed ==')
{
  const dir = tempDir('e5')
  const home = tempDir('e5home')
  writeConfig(home, { enabled: true, machineId: 'machine-a', claimTtlMinutes: 10 })
  const bracket = writeBracket(dir)
  const { repo } = gitFixture(dir)
  // dead endpoint — connection refused nhanh, không treo
  const envDead = envFor('http://127.0.0.1:9/graphql', home)
  const r1 = runLaunch(envDead, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'], 90000)
  check('dce5: dead endpoint → exit non-zero', (r1.status ?? 1) !== 0, `${r1.status}|${r1.stdout}`)
  check('dce5: log fail-closed', /fail-closed/.test((r1.stdout || '') + (r1.stderr || '')), `${r1.stdout}|${r1.stderr}`)
  // thiếu key (rc3) — HOME sạch, không env key
  const homeNoKey = tempDir('e5nokey')
  writeConfig(homeNoKey, { enabled: true, machineId: 'machine-a', claimTtlMinutes: 10 })
  const envNoKey = { ...process.env, HOME: homeNoKey, PATH: `${writePy3Shim(homeNoKey)};${process.env.PATH}`, STORY_KIT_CONFIG: join(homeNoKey, 'story-kit.json'), LINEAR_GRAPHQL_ENDPOINT: 'http://127.0.0.1:9/graphql', ORCA_BIN: writeFakeOrca(homeNoKey) }
  delete envNoKey.LINEAR_API_KEY
  const r2 = runLaunch(envNoKey, [...ARGS(bracket, repo), '--claim', '--machine-id', 'machine-a'], 90000)
  check('dce5: thiếu key → fail-closed phân loại rc3', /LINEAR_API_KEY thiếu — fail-closed/.test(r2.stdout || ''), `${r2.status}|${r2.stdout}`)
}

console.log('== [dce6] --list-claims — read-only JSON (không cần enabled) ==')
{
  const dir = tempDir('e6')
  const home = tempDir('e6home')
  const bracket = writeBracket(dir)
  const stub = new LinearStub()
  const url = await stub.start()
  stub.addComment(stub.claimBody('machine-a'))
  const env = { ...process.env, HOME: home, PATH: `${writePy3Shim(home)};${process.env.PATH}`, LINEAR_GRAPHQL_ENDPOINT: url, LINEAR_API_KEY: 'test-key' }
  const r = await runLaunchA(env, ['--list-claims', '--bracket', T(bracket)])
  await stub.stop()
  let arr = null
  try { arr = JSON.parse((r.stdout || '').trim()) } catch {}
  check('dce6: stdout là JSON array', Array.isArray(arr), r.stdout)
  check('dce6: sfNum=SF-1 + machineId=machine-a', Array.isArray(arr) && arr[0] && arr[0].sfNum === 'SF-1' && arr[0].machineId === 'machine-a', JSON.stringify(arr))
  check('dce6: exit 0', r.status === 0, String(r.status))
}

console.log('== [dce7] takeover lib-level — remote hỏng → rc2 fail-closed ==')
{
  const dir = tempDir('e7')
  const home = tempDir('e7home')
  const stub = new LinearStub()
  const url = await stub.start()
  const env = envFor(url, home)
  const script = `. '${T(DCLIB)}'; distributed_config_load; claim_takeover "FI-TEST-1" "machine-old" "machine-a" "${T(dir)}" "sf-1-claim-core-verification" "/nonexistent-remote" 5 "" "" >/dev/null 2>&1; echo "rc=$?"`
  const r = await runLibA(env, script)
  await stub.stop()
  check('dce7: remote không đọc được → rc2', (r.stdout || '').includes('rc=2'), `${r.stdout}|${r.stderr}`)
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
