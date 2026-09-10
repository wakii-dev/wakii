#!/usr/bin/env node
// file-lock tests (GH-37 SF-1) — concurrent 2-process behavior của with_file_lock
// + các migrator (watermark, watchdog state). Node spawn python thật — KHÔNG
// mock. Chạy: node tests/file-lock-tests.mjs
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const CP_BIN = resolve(testsDir, '../kit/bin/story-checkpoint')
const MEM_BIN = resolve(testsDir, '../kit/bin/story-memory')

function resolvePython() {
  for (const name of ['python3', 'python', 'py']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 15000 })
    if (r.status === 0) return name
  }
  throw new Error('không tìm thấy python3/python/py chạy được')
}
const PY = resolvePython()

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const okFlag = cond === true
  if (okFlag) pass++
  else { fail++; failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`) }
  console.log(`  [${okFlag ? 'PASS' : 'FAIL'}] ${caseId} ${name}${okFlag ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempDir(tag) {
  return mkdtempSync(join(tmpdir(), `flk-${tag}-`))
}

// Helper chung: python snippet import donor + chạy with_file_lock theo JSON arg
// Trả stdout JSON cuối. lock-agent: giữ lock rồi chờ báo hiệu release.
const lockScript = `
import sys, json, time, os
sys.dont_write_bytecode = True
import importlib.machinery
import importlib.util
loader = importlib.machinery.SourceFileLoader("cp", sys.argv[1])
spec = importlib.util.spec_from_loader("cp", loader)
cp = importlib.util.module_from_spec(spec)
loader.exec_module(cp)
req = json.loads(sys.argv[2])
store = req["store"]; lock = req["lock"]
t0 = time.time()
def fn():
    if req.get("append"):
        with open(req["append"], "a", encoding="utf-8") as f:
            f.write(req["tag"] + "\\n")
            f.flush()
            os.fsync(f.fileno())
    if req.get("hold_ms"):
        time.sleep(req["hold_ms"] / 1000.0)
    return req["tag"]
r = cp.with_file_lock(store, lock, fn, req.get("deadline", 10.0),
                      mkdir=True, log_path=req.get("log"))
print(json.dumps({"ok": True, "result": r, "waited_ms": int((time.time()-t0)*1000)}))
`
function runAgent(req, timeoutMs = 30000) {
  return spawnSync(PY, ['-c', lockScript, CP_BIN, JSON.stringify(req)], {
    encoding: 'utf8', timeout: timeoutMs,
  })
}
function parseLast(out) {
  const line = out.trim().split('\n').at(-1)
  return JSON.parse(line)
}
// spawn N agents KHÔNG đợi — trả mảng promise
function spawnAgents(reqs) {
  return reqs.map((req) => new Promise((res) => {
    const p = spawn(PY, ['-c', lockScript, CP_BIN, JSON.stringify(req)], { encoding: 'utf8' })
    let out = '', err = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('close', (code) => res({ code, out, err }))
  }))
}
function isoAgo(ms) {
  return new Date(Date.now() - ms).toISOString()
}

// ═══ (a) watermark + mark-git 2-proc đồng thời — serialize không corrupt ═══
console.log(`== (a) watermark + mark-git 2-proc concurrent ==`)
{
  const dir = tempDir('wm')
  writeFileSync(join(dir, 'state'), 'git:wakii|oldhash\n', 'utf8') // dòng khác giữ nguyên
  // 2 story-memory độc lập cùng state file — update_watermark dưới lock
  const wmScript = `
import sys, os, json, time
sys.dont_write_bytecode = True
os.environ["STORY_MEMORY_CHECKPOINT_BIN"] = sys.argv[1]
os.environ["STORY_MEMORY_STATE"] = sys.argv[3]
import importlib.machinery
import importlib.util
loader = importlib.machinery.SourceFileLoader("mem", sys.argv[2])
spec = importlib.util.spec_from_loader("mem", loader)
mem = importlib.util.module_from_spec(spec)
loader.exec_module(mem)
t0 = time.time()
ok = mem.update_watermark(sys.argv[4])
print(json.dumps({"ok": ok, "waited_ms": int((time.time()-t0)*1000)}))
`
  const one = (val) => new Promise((res) => {
    const p = spawn(PY, ['-c', wmScript, CP_BIN, MEM_BIN, join(dir, 'state'), val], { encoding: 'utf8' })
    let out = '', err = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('close', (code) => res({ code, out, err }))
  })
  const [p1, p2] = await Promise.all([one('AAAA'), one('BBBB')])
  check('wm2p', 'cả 2 exit 0', p1.code === 0 && p2.code === 0, `${p1.code}/${p2.code} ${p1.err}|${p2.err}`)
  const res1 = JSON.parse(p1.out.trim().split('\n').at(-1))
  const res2 = JSON.parse(p2.out.trim().split('\n').at(-1))
  check('wm2p', 'cả 2 update THÀNH CÔNG (không skip vì timeout)', res1.ok && res2.ok, JSON.stringify([res1, res2]))
  const state = readFileSync(join(dir, 'state'), 'utf8')
  const lines = state.trim().split(/\r?\n/).filter(Boolean)
  check('wm2p', 'serialize: since cuối = 1 trong 2 giá trị (RMW thay since cũ theo semantic)',
    state.includes('since=AAAA') || state.includes('since=BBBB'), state)
  check('wm2p', 'đúng 1 since + 1 indexed_at — không corrupt không trùng',
    lines.filter((l) => l.startsWith('since=')).length === 1 &&
    lines.filter((l) => l.startsWith('indexed_at=')).length === 1, JSON.stringify(lines))
  check('wm2p', 'dòng khác (git:) giữ nguyên qua 2 RMW', state.includes('git:wakii|oldhash'), state)
  check('wm2p', 'lock dọn sạch', !existsSync(join(dir, '.story-memory.state.lock')))

  // anti-lost-update thật: 2 mark-git repo KHÁC nhau đồng thời → cả 2 dòng còn
  const mgScript = `
import sys, os, json
sys.dont_write_bytecode = True
os.environ["STORY_MEMORY_CHECKPOINT_BIN"] = sys.argv[1]
os.environ["STORY_MEMORY_STATE"] = sys.argv[3]
import importlib.machinery
import importlib.util
loader = importlib.machinery.SourceFileLoader("mem", sys.argv[2])
spec = importlib.util.spec_from_loader("mem", loader)
mem = importlib.util.module_from_spec(spec)
loader.exec_module(mem)
import contextlib, io
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    rc = mem.cmd_mark_git(type("A", (), {"repo": sys.argv[4], "hash": sys.argv[5]})())
print(json.dumps({"rc": rc}))
`
  const mg = (repo, hash) => new Promise((res) => {
    const p = spawn(PY, ['-c', mgScript, CP_BIN, MEM_BIN, join(dir, 'state'), repo, hash], { encoding: 'utf8' })
    let out = '', err = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('close', (code) => res({ code, out, err }))
  })
  const [m1, m2] = await Promise.all([mg('repoX', 'h111'), mg('repoY', 'h222')])
  const state2 = readFileSync(join(dir, 'state'), 'utf8')
  check('wm2p', 'mark-git cả 2 rc=0', m1.code === 0 && m2.code === 0 &&
    JSON.parse(m1.out.trim().split('\n').at(-1)).rc === 0 &&
    JSON.parse(m2.out.trim().split('\n').at(-1)).rc === 0, `${m1.err}|${m2.err}`)
  check('wm2p', 'cả 2 git: line tồn tại (anti lost-update thực)',
    state2.includes('git:repoX|h111') && state2.includes('git:repoY|h222'), state2)
  check('wm2p', 'since= + indexed_at KHÔNG bị mark-git đụng',
    state2.includes('since=') && state2.includes('indexed_at='), state2)
}

// ═══ (b) watchdog state 2-proc đồng thời — cả 2 verdict không mất ═══
console.log(`\n== (b) watchdog state 2-proc concurrent (khác sf) ==`)
{
  const dir = tempDir('wd')
  // watchdog dùng lock ".story-watchdog-state.lock" trong saved script — mô phỏng
  // đúng qua lockScript với append (mỗi tag = 1 verdict dòng)
  const [j1, j2] = await Promise.all([
    spawnAgents([{ store: dir, lock: '.story-watchdog-state.lock', append: join(dir, 'state'), tag: 'SF-1|RUNNING', deadline: 10 }])[0],
    spawnAgents([{ store: dir, lock: '.story-watchdog-state.lock', append: join(dir, 'state'), tag: 'SF-2|STALLED', deadline: 10 }])[0],
  ])
  check('wd2p', 'cả 2 exit 0', j1.code === 0 && j2.code === 0, `${j1.err}|${j2.err}`)
  const s1 = parseLast(j1.out); const s2 = parseLast(j2.out)
  check('wd2p', 'cả 2 verdict ghi', s1.result === 'SF-1|RUNNING' && s2.result === 'SF-2|STALLED', JSON.stringify([s1, s2]))
  const state = readFileSync(join(dir, 'state'), 'utf8').trim().split(/\r?\n/)
  check('wd2p', 'cả 2 dòng trong state (không mất)', state.includes('SF-1|RUNNING') && state.includes('SF-2|STALLED'), JSON.stringify(state))
  check('wd2p', 'đúng 2 dòng', state.length === 2, JSON.stringify(state))
}

// ═══ (c) takeover-race: pre-create stale lock — 2 process đồng thời, đúng 1 thắng ═══
console.log(`\n== (c) takeover race — 2 process cùng thấy stale ==`)
{
  const dir = tempDir('race')
  const lock = join(dir, '.race.lock')
  // lock rỗng (bin cũ) + mtime 60s trước → stale mtime-only fallback
  writeFileSync(lock, '')
  const old = new Date(Date.now() - 60_000)
  utimesSync(lock, old, old)
  const [p1, p2] = await Promise.all(spawnAgents([
    { store: dir, lock: '.race.lock', append: join(dir, 'log'), tag: 'A', deadline: 10 },
    { store: dir, lock: '.race.lock', append: join(dir, 'log'), tag: 'B', deadline: 10 },
  ]))
  check('race', 'cả 2 exit 0', p1.code === 0 && p2.code === 0, `${p1.err}|${p2.err}`)
  const r1 = parseLast(p1.out); const r2 = parseLast(p2.out)
  check('race', 'cả 2 đều hoàn thành (đúng 1 takeover, 1 chờ xong lấy tiếp)',
    r1.result === 'A' && r2.result === 'B', JSON.stringify([r1, r2]))
  const appends = readFileSync(join(dir, 'log'), 'utf8').trim().split('\n')
  check('race', 'cả 2 append (serialize qua lock)', appends.length === 2, JSON.stringify(appends))
  check('race', 'lock dọn sạch', !existsSync(lock))
}

// ═══ (d) empty-content fallback: lock rỗng + mtime cũ → takeover OK ═══
console.log(`\n== (d) empty-content (bin cũ mixed-window) mtime-only fallback ==`)
{
  const dir = tempDir('empty')
  const lock = join(dir, '.empty.lock')
  writeFileSync(lock, '') // bin cũ viết lock rỗng
  const old = new Date(Date.now() - 60_000)
  utimesSync(lock, old, old)
  const r = runAgent({ store: dir, lock: '.empty.lock', append: join(dir, 'log'), tag: 'T', deadline: 3 })
  check('empty', 'exit 0', r.status === 0, r.stderr)
  check('empty', 'takeover OK trong deadline ngắn', parseLast(r.stdout).result === 'T', r.stdout)
  // ngược lại: lock rỗng + mtime MỚI (holder sống dữ content) → KHÔNG takeover sớm
  writeFileSync(lock, '')
  utimesSync(lock, new Date(), new Date())
  const t0 = Date.now()
  const r2 = runAgent({ store: dir, lock: '.empty.lock', append: join(dir, 'log'), tag: 'U', deadline: 1.5 })
  const waited = Date.now() - t0
  check('empty', 'lock rỗng mtime mới → chờ hết deadline skip',
    parseLast(r2.stdout).result === false, r2.stdout)
  check('empty', 'deadline 1.5s được tôn trọng (không chờ 10s)', waited < 6000, `waited=${waited}ms`)
}

// ═══ (e) pid-reuse simulation: lock pid=1 ts cũ → treated stale ═══
console.log(`\n== (e) pid-reuse + pid-dead + holder-alive content check ==`)
{
  const dir = tempDir('pid')
  const mkLock = (name, content, ageMs) => {
    const p = join(dir, name)
    writeFileSync(p, content)
    const old = new Date(Date.now() - ageMs)
    utimesSync(p, old, old)
    return p
  }
  // pid=1 trên Windows là smss/explorer (alive NHƯNG creation-time cách đây
  // lâu > lock-ts giả 2020) → alive-but-reused → stale. Trên POSIX pid=1 init.
  mkLock('.reuse.lock', `1 ${isoAgo(3650 * 86400_000).replace('.000', '')}\n`, 60_000)
  const r1 = runAgent({ store: dir, lock: '.reuse.lock', append: join(dir, 'log'), tag: 'R', deadline: 3 })
  check('pid', 'pid=1 + ts cách đây 10 năm (creation-time mới hơn) → stale takeover',
    r1.status === 0 && parseLast(r1.stdout).result === 'R', `${r1.stdout} ${r1.stderr}`)
  // pid chết thật: spawn python → exit → lấy pid đó
  const dead = spawnSync(PY, ['-c', 'import os; print(os.getpid())'], { encoding: 'utf8' })
  const deadPid = dead.stdout.trim()
  mkLock('.dead.lock', `${deadPid} ${isoAgo(60_000)}\n`, 60_000)
  const r2 = runAgent({ store: dir, lock: '.dead.lock', append: join(dir, 'log'), tag: 'D', deadline: 3 })
  check('pid', 'pid chết + mtime >5s → stale takeover',
    r2.status === 0 && parseLast(r2.stdout).result === 'D', `${r2.stdout} ${r2.stderr}`)
  // holder SỐNG fresh: chính test process này giữ lock → alive + creation trước ts → KHÔNG stale
  const me = spawnSync(PY, ['-c', 'import os; print(os.getpid())'], { encoding: 'utf8' })
  void me
  const livePid = process.pid // node process — alive trong suốt test
  mkLock('.live.lock', `${livePid} ${isoAgo(1000)}\n`, 1000)
  // mtime 1s (< 5s) — chưa stale theo mtime, bỏ qua content
  // → cần mtime >5s nhưng ts gần: ts GẦN đây + pid alive + creation trước ts
  mkLock('.live2.lock', `${livePid} ${isoAgo(1000)}\n`, 60_000)
  const r3 = runAgent({ store: dir, lock: '.live2.lock', tag: 'L', deadline: 1.5 })
  check('pid', 'pid sống creation-trước-ts + mtime>5s → KHÔNG stale → skip sau deadline',
    parseLast(r3.stdout).result === false, r3.stdout)
  // unparsable content → mtime-only fallback
  mkLock('.garbage.lock', 'đây không phải pid ts\n', 60_000)
  const r4 = runAgent({ store: dir, lock: '.garbage.lock', append: join(dir, 'log'), tag: 'G', deadline: 3 })
  check('pid', 'unparsable content → mtime-only fallback takeover',
    r4.status === 0 && parseLast(r4.stdout).result === 'G', `${r4.stdout} ${r4.stderr}`)
}

// ═══ (f) deadline: lock giữ bởi holder sống → skip + log line ═══
console.log(`\n== (f) deadline exceeded → skip + log waited= ==`)
{
  const dir = tempDir('dl')
  const log = join(dir, 'latency.log')
  // holder giữ 8s; contender deadline 1s → skip + log lock-timeout
  const holder = spawnAgents([{ store: dir, lock: '.dl.lock', tag: 'H', hold_ms: 8000, deadline: 20 }])[0]
  // đợi holder chắc chắn lấy lock
  await new Promise((r) => setTimeout(r, 700))
  const contender = runAgent({ store: dir, lock: '.dl.lock', append: join(dir, 'log'), tag: 'C', deadline: 1, log })
  const cr = parseLast(contender.stdout)
  check('dl', 'contender skip (result false)', cr.result === false, contender.stdout)
  check('dl', 'deadline ~1s (không block 8s holder)', cr.waited_ms < 5000, `waited=${cr.waited_ms}`)
  const logText = readFileSync(log, 'utf8')
  check('dl', 'log có lock-timeout waited= lock=', logText.includes('lock-timeout') && logText.includes('waited=') && logText.includes('lock=.dl.lock'), logText)
  const hr = await holder
  check('dl', 'holder hoàn thành sau hold', parseLast(hr.out).result === 'H', hr.err)
  // lock-wait observability: contender 2 đợi holder 2.5s → acquired + wait >100ms → log lock-wait
  const holder2 = spawnAgents([{ store: dir, lock: '.dl2.lock', tag: 'H2', hold_ms: 2500, deadline: 20 }])[0]
  await new Promise((r) => setTimeout(r, 700))
  const c2 = runAgent({ store: dir, lock: '.dl2.lock', tag: 'W', deadline: 10 })
  const c2r = parseLast(c2.stdout)
  check('dl', 'waiter acquired sau khi holder release', c2r.result === 'W', c2.stdout + c2.stderr)
  check('dl', 'waiter thực sự đợi >100ms (serialized)', c2r.waited_ms > 100, `waited=${c2r.waited_ms}`)
  const hr2 = await holder2
  check('dl', 'holder2 hoàn thành', parseLast(hr2.out).result === 'H2', hr2.err)
  const log2 = existsSync(log) ? readFileSync(log, 'utf8') : ''
  check('dl', 'log có lock-wait (>100ms waited)', log2.includes('lock-wait'), log2)
}

// ═══ (g) exception propagate: fn raise → lock release + exception ra ngoài ═══
console.log(`\n== (g) fn raise → release + PROPAGATE (caller quyết định) ==`)
{
  const dir = tempDir('exc')
  const raiseScript = `
import sys, json
sys.dont_write_bytecode = True
import importlib.machinery
import importlib.util
loader = importlib.machinery.SourceFileLoader("cp", sys.argv[1])
spec = importlib.util.spec_from_loader("cp", loader)
cp = importlib.util.module_from_spec(spec)
loader.exec_module(cp)
req = json.loads(sys.argv[2])
def fn():
    raise ValueError("boom-from-fn")
try:
    cp.with_file_lock(req["store"], req["lock"], fn, 5.0)
    print(json.dumps({"propagated": False}))
except ValueError as e:
    print(json.dumps({"propagated": str(e)}))
`
  const r = spawnSync(PY, ['-c', raiseScript, CP_BIN, JSON.stringify({ store: dir, lock: '.exc.lock' })], { encoding: 'utf8' })
  check('exc', 'fn raise → ValueError ra ngoài helper', r.status === 0 && JSON.parse(r.stdout.trim()).propagated === 'boom-from-fn', r.stdout + r.stderr)
  check('exc', 'lock đã release (dựng lại lấy được)', runAgent({ store: dir, lock: '.exc.lock', tag: 'AFTER', deadline: 2 }).status === 0)
  const after = runAgent({ store: dir, lock: '.exc.lock', append: join(dir, 'log'), tag: 'AFTER', deadline: 2 })
  check('exc', 'acquire sau exception OK', after.status === 0 && parseLast(after.stdout).result === 'AFTER', after.stdout)
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN (wm2p/wd2p/race/empty/pid/dl/exc)')
