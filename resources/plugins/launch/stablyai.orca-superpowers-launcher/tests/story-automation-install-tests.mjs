#!/usr/bin/env node
// story-automation-install tests — spawn bin thật với stub orca stateful
// (ORCA_BIN seam, hermetic như story-coordinator-pass-tests — KHÔNG đụng orca
// daemon thật, KHÔNG tạo automation thật). Stub mô phỏng daemon: list đọc
// $AUTO_STATE, create APPEND (stub không dedup — bin phải tự idempotent),
// edit/update in place, remove/xoá; argv log đầy đủ để soi create/edit/remove
// matrix:
//   install fresh → 2 create đúng name/cron/prompt/fresh-session/grace ·
//   install ×2 → vẫn 2 automation, create=0 lần 2 (idempotent update) ·
//   override --cron/--briefing-cron/--workspace/--provider/--timezone ·
//   legacy orchestration-coordinator-pass (prompt fat 19/09) → ADOPT edit
//   in place, không nhân bản · retire gỡ sạch cả 2 · retire không owned →
//   removed=0 không đụng automation lạ · briefing happy: story-notify 1 tin
//   chứa story-status digest (Linear states) + STALLED + question/escalation,
//   đọc --peek KHÔNG --ack · briefing orca chết → vẫn notify degraded exit 0 ·
//   briefing không có gì → "Không có gì bất thường" · install orca chết →
//   exit ≠0 KHÔNG blind-create · --help/usage.
// Chạy: node tests/story-automation-install-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(testsDir, '../kit/bin/story-automation-install')
const BASH = 'bash'

let pass = 0
let fail = 0
const failures = []
function check(caseId, name, cond, detail = '') {
  const ok = cond === true
  if (ok) pass++
  else fail++, failures.push(`${caseId} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${caseId} ${name}${ok ? '' : ' — ' + (detail || 'assert sai')}`)
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `auto-install-${tag}-`))
  if (!dir.startsWith(tmpdir())) throw new Error('temp ngoài tmpdir — dừng')
  return dir
}

// stub orca stateful: daemon automation + orchestration fixture theo env
function makeOrcaStub(dir) {
  const stub = join(dir, 'orca-stub.sh')
  const py = join(dir, 'orca-stub.py')
  writeFileSync(py, `import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
argv = sys.argv[1:]
state_p = os.environ["AUTO_STATE"]
def load():
    with open(state_p, encoding="utf-8") as f: return json.load(f)
def save(s):
    with open(state_p, "w", encoding="utf-8") as f: json.dump(s, f)
def opt(name, rest):
    flag = "--" + name
    return rest[rest.index(flag) + 1] if flag in rest else None
if argv[0] == "automations":
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "list":
        print(json.dumps({"ok": True, "result": {"automations": load()}}))
    elif cmd == "create":
        rest = argv[2:]
        a = {"id": "auto-%03d" % (len(load()) + 1),
             "name": opt("name", rest) or "", "prompt": opt("prompt", rest) or "",
             "rrule": opt("trigger", rest) or "", "agentId": opt("provider", rest) or "",
             "workspaceId": opt("workspace", rest) or "",
             "workspaceMode": "existing" if opt("workspace", rest) else "new_per_run",
             "enabled": True}
        s = load(); s.append(a); save(s)
        print(json.dumps({"ok": True, "result": {"automation": a}}))
    elif cmd == "edit":
        aid = argv[2]; rest = argv[3:]
        s = load()
        for a in s:
            if a.get("id") == aid:
                for flag, key in (("trigger", "rrule"), ("prompt", "prompt"),
                                  ("provider", "agentId"), ("workspace", "workspaceId"),
                                  ("name", "name")):
                    v = opt(flag, rest)
                    if v is not None: a[key] = v
        save(s)
        print(json.dumps({"ok": True, "result": {"automation": {"id": aid}}}))
    elif cmd == "remove":
        aid = argv[2]
        if os.environ.get("REMOVE_FAIL_ID") and aid == os.environ["REMOVE_FAIL_ID"]:
            sys.exit(7)
        save([a for a in load() if a.get("id") != aid])
        print(json.dumps({"ok": True, "result": {}}))
    else:
        print(json.dumps({"ok": True, "result": {}}))
elif argv[0] == "orchestration":
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "run-list":
        with open(os.environ["RL_FIXTURE"], encoding="utf-8") as f: print(f.read())
    elif cmd == "check":
        with open(os.environ["CHECK_FIXTURE"], encoding="utf-8") as f: print(f.read())
    else:
        print(json.dumps({"ok": True, "result": {}}))
else:
    print(json.dumps({"ok": True, "result": {}}))
`, 'utf8')
  writeFileSync(stub, `#!/bin/sh
printf '%s\\n' "$*" >> "$ARGV_LOG"
exec python3 "${py}" "$@"
`, 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

function makeBrokenStub(dir) {
  const stub = join(dir, 'broken-stub.sh')
  writeFileSync(stub, '#!/bin/sh\nexit 7\n', 'utf8')
  chmodSync(stub, 0o755)
  return stub
}

// seam stubs cho briefing: story-status / story-resume / story-notify
function makeSeamStubs(dir) {
  const status = join(dir, 'status-stub.sh')
  writeFileSync(status, '#!/bin/sh\ncat "$STATUS_FIXTURE"\n', 'utf8')
  chmodSync(status, 0o755)
  const resume = join(dir, 'resume-stub.sh')
  writeFileSync(resume, '#!/bin/sh\n[ "$1" = "--check" ] && cat "$RESUME_FIXTURE"\nexit 0\n', 'utf8')
  chmodSync(resume, 0o755)
  const notify = join(dir, 'notify-stub.sh')
  writeFileSync(notify, '#!/bin/sh\nprintf \'NOTIFY-CALL\\n\' >> "$NOTIFY_LOG"\nprintf \'%s\\n\' "$*" >> "$NOTIFY_LOG"\n', 'utf8')
  chmodSync(notify, 0o755)
  const broken = join(dir, 'broken-seam.sh')
  writeFileSync(broken, '#!/bin/sh\nexit 7\n', 'utf8')
  chmodSync(broken, 0o755)
  return { status, resume, notify, broken }
}

function fixture(dir, name, obj) {
  const p = join(dir, name)
  writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj))
  return p
}

function freshState(dir) {
  const p = join(dir, 'auto-state.json')
  writeFileSync(p, '[]')
  return p
}

function readState(stateFile) {
  return JSON.parse(readFileSync(stateFile, 'utf8'))
}

function runBin(dir, stub, args, env = {}) {
  const argvLog = join(dir, 'argv.log')
  writeFileSync(argvLog, '')
  const stateFile = env.AUTO_STATE || freshState(dir)
  const r = spawnSync(BASH, [BIN, ...args], {
    encoding: 'utf8', timeout: 60000, cwd: dir,
    env: {
      ...process.env,
      ORCA_BIN: stub,
      ARGV_LOG: argvLog,
      AUTO_STATE: stateFile,
      ...env,
    },
  })
  const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : ''
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), argv, stateFile }
}

function notifyCalls(dir) {
  const p = join(dir, 'notify.log')
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const LEGACY_PROMPT = 'BẠN LÀ COORDINATOR đứng ca — orchestration run-list, check --wait, story-resume --check (prompt fat 19/09 automation e976ddde)'

console.log('== C1 install fresh → 2 create đúng name/cron/prompt/seeds ==')
{
  const dir = tempDir('c1')
  const stub = makeOrcaStub(dir)
  const state = freshState(dir)
  const r = runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const st = readState(state)
  check('C1', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C1', 'đúng 2 automation', st.length === 2, JSON.stringify(st))
  const coord = st.find(a => a.name === 'story-coordinator-pass')
  const brief = st.find(a => a.name === 'story-morning-briefing')
  check('C1', 'coordinator-pass cron */30 mặc định', coord && coord.rrule === '*/30 * * * *', coord && coord.rrule)
  check('C1', 'briefing cron 0 7 mặc định', brief && brief.rrule === '0 7 * * *', brief && brief.rrule)
  check('C1', 'prompt coord gọi bin SF-1', coord && coord.prompt.includes('story-coordinator-pass'), coord && coord.prompt)
  check('C1', 'prompt brief gọi subcommand briefing', brief && brief.prompt.includes('story-automation-install briefing'), brief && brief.prompt)
  check('C1', 'provider claude mặc định', coord && coord.agentId === 'claude', coord && coord.agentId)
  check('C1', 'fresh-session trong argv', (r.argv.match(/--fresh-session/g) || []).length === 2, r.argv)
  check('C1', 'missed-run-grace 720 trong argv', r.argv.includes('--missed-run-grace-minutes 720'), r.argv)
  check('C1', 'không có workspace override khi không truyền', !r.argv.includes('--workspace '), r.argv)
  check('C1', 'summary INSTALL created=2', r.out.includes('INSTALL: created=2 updated=0 failed=0'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C2 idempotent: install ×2 → vẫn 2 automation, lần 2 KHÔNG create ==')
{
  const dir = tempDir('c2')
  const stub = makeOrcaStub(dir)
  const state = freshState(dir)
  runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const r2 = runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const st = readState(state)
  check('C2', 'exit 0 lần 2', r2.code === 0, `code=${r2.code} out=${r2.out}`)
  check('C2', 'vẫn đúng 2 automation (không nhân bản)', st.length === 2, JSON.stringify(st))
  check('C2', 'lần 2 KHÔNG create', !r2.argv.includes(' create '), r2.argv)
  check('C2', 'lần 2 edit cả 2', (r2.argv.match(/ edit /g) || []).length === 2, r2.argv)
  check('C2', 'summary INSTALL updated=2', r2.out.includes('INSTALL: created=0 updated=2 failed=0'), r2.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C3 override --cron/--briefing-cron/--workspace/--provider/--timezone ==')
{
  const dir = tempDir('c3')
  const stub = makeOrcaStub(dir)
  const r = runBin(dir, stub, ['install', '--cron', '*/15 * * * *',
    '--briefing-cron', '30 6 * * *', '--workspace', 'id:wt1::/tmp/wt',
    '--provider', 'codex', '--timezone', 'Asia/Tokyo'], {})
  const st = readState(r.stateFile)
  const coord = st.find(a => a.name === 'story-coordinator-pass')
  const brief = st.find(a => a.name === 'story-morning-briefing')
  check('C3', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C3', '--cron override coordinator-pass', coord && coord.rrule === '*/15 * * * *', coord && coord.rrule)
  check('C3', '--briefing-cron override briefing', brief && brief.rrule === '30 6 * * *', brief && brief.rrule)
  check('C3', '--workspace pass-through cả 2', coord && coord.workspaceId === 'id:wt1::/tmp/wt' && brief.workspaceId === 'id:wt1::/tmp/wt', r.argv)
  check('C3', '--provider override', coord && coord.agentId === 'codex', coord && coord.agentId)
  check('C3', '--timezone trong argv', (r.argv.match(/--timezone Asia\/Tokyo/g) || []).length === 2, r.argv)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C4 legacy orchestration-coordinator-pass → ADOPT edit, không nhân bản ==')
{
  const dir = tempDir('c4')
  const stub = makeOrcaStub(dir)
  const state = join(dir, 'auto-state.json')
  writeFileSync(state, JSON.stringify([
    { id: 'e976ddde', name: 'orchestration-coordinator-pass', prompt: LEGACY_PROMPT, rrule: '*/30 * * * *', agentId: 'claude' },
  ]))
  const r = runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const st = readState(state)
  check('C4', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C4', 'vẫn 2 automation (legacy adopted + briefing mới)', st.length === 2, JSON.stringify(st))
  check('C4', 'chỉ 1 create (briefing)', (r.argv.match(/ create /g) || []).length === 1, r.argv)
  check('C4', 'legacy được edit giữ id', r.argv.includes(' edit e976ddde'), r.argv)
  const coord = st.find(a => a.id === 'e976ddde')
  check('C4', 'legacy prompt thay bằng 1 dòng gọi bin SF-1', coord && coord.prompt.includes('story-coordinator-pass'), coord && coord.prompt)
  check('C4', 'summary created=1 updated=1', r.out.includes('INSTALL: created=1 updated=1 failed=0'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C5 retire → gỡ sạch cả 2 automation owned ==')
{
  const dir = tempDir('c5')
  const stub = makeOrcaStub(dir)
  const state = freshState(dir)
  runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const r = runBin(dir, stub, ['retire'], { AUTO_STATE: state })
  const st = readState(state)
  check('C5', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C5', 'state rỗng', st.length === 0, JSON.stringify(st))
  check('C5', 'remove đúng 2', (r.argv.match(/ remove /g) || []).length === 2, r.argv)
  check('C5', 'summary RETIRE removed=2', r.out.includes('RETIRE: removed=2'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C6 retire không owned → removed=0, automation lạ nguyên vẹn ==')
{
  const dir = tempDir('c6')
  const stub = makeOrcaStub(dir)
  const state = join(dir, 'auto-state.json')
  writeFileSync(state, JSON.stringify([
    { id: 'other-1', name: 'Daily review', prompt: 'Review open changes', rrule: '0 9 * * *', agentId: 'codex' },
  ]))
  const r = runBin(dir, stub, ['retire'], { AUTO_STATE: state })
  const st = readState(state)
  check('C6', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C6', 'removed=0', r.out.includes('RETIRE: removed=0'), r.out)
  check('C6', 'KHÔNG remove call', !r.argv.includes(' remove '), r.argv)
  check('C6', 'automation lạ còn nguyên', st.length === 1 && st[0].id === 'other-1', JSON.stringify(st))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C7 briefing happy → story-notify 1 tin tổng hợp, peek không ack ==')
{
  const dir = tempDir('c7')
  const stub = makeOrcaStub(dir)
  const seams = makeSeamStubs(dir)
  const status = fixture(dir, 'status.txt', [
    '═══ STORIES (from brackets/) ═══',
    '',
    '● LOCAL-1 — Story tự vận hành 24/7',
    '  states: FI-459:Done FI-460:Done',
    '',
    '● FI-458 — Bracket phân tán đa máy trong mạng local',
    '  states: FI-459:Done',
  ].join('\n'))
  const resume = fixture(dir, 'resume.txt',
    'sf-2-automation-install|STALLED|terminal idle + 3h không commit\nsf-3-x|RUNNING|commit 1h trước\n')
  const rl = fixture(dir, 'rl.json', { ok: true, result: { runs: [{ id: 'run_q', objective: 'LOCAL-1' }] } })
  const ck = fixture(dir, 'ck.json', { ok: true, result: { messages: [
    { id: 'm1', type: 'question', subject: 'SF-3 có nên block dispatch?' },
    { id: 'm2', type: 'escalation', subject: 'cần xoá branch main?' },
  ] } })
  const r = runBin(dir, stub, ['briefing'], {
    STORY_STATUS_BIN: seams.status, STATUS_FIXTURE: status,
    STORY_RESUME_BIN: seams.resume, RESUME_FIXTURE: resume,
    STORY_NOTIFY_BIN: seams.notify, NOTIFY_LOG: join(dir, 'notify.log'),
    RL_FIXTURE: rl, CHECK_FIXTURE: ck,
  })
  const notify = notifyCalls(dir)
  check('C7', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C7', 'story-notify được gọi đúng 1 lần', (notify.match(/NOTIFY-CALL/g) || []).length === 1, notify)
  check('C7', 'type generic briefing', notify.includes('NOTIFY-CALL\nbriefing '), notify)
  check('C7', 'body chứa story-status digest (epic + Linear states)', notify.includes('LOCAL-1') && notify.includes('FI-459:Done'), notify)
  check('C7', 'body chứa stall STALLED (không RUNNING)', notify.includes('sf-2-automation-install (STALLED)') && !notify.includes('sf-3-x'), notify)
  check('C7', 'body chứa question [chờ coordinator]', notify.includes('block dispatch?') && notify.includes('chờ coordinator'), notify)
  check('C7', 'body chứa escalation [cần user]', notify.includes('cần xoá branch main?') && notify.includes('cần user'), notify)
  check('C7', 'đọc --peek', r.argv.includes('--peek'), r.argv)
  check('C7', 'KHÔNG --ack (đọc không phá inbox)', !r.argv.includes('--ack'), r.argv)
  check('C7', 'stdout BRIEFING: notified', r.out.includes('BRIEFING: notified'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C8 briefing orca + seams chết → vẫn notify degraded, exit 0 ==')
{
  const dir = tempDir('c8')
  const stub = makeBrokenStub(dir)
  const seams = makeSeamStubs(dir)
  const r = runBin(dir, stub, ['briefing'], {
    STORY_STATUS_BIN: seams.broken,
    STORY_RESUME_BIN: seams.broken,
    STORY_NOTIFY_BIN: seams.notify, NOTIFY_LOG: join(dir, 'notify.log'),
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    CHECK_FIXTURE: fixture(dir, 'ck.json', { ok: true, result: { messages: [] } }),
  })
  const notify = notifyCalls(dir)
  check('C8', 'exit 0 (briefing không fail hard)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C8', 'vẫn gọi story-notify', notify !== '', notify)
  check('C8', 'body degraded nói rõ nguồn hỏng', notify.includes('story-status không đọc được') && r.out.includes('orchestration không đọc được'), notify)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C9 install orca chết → exit 1 KHÔNG blind-create (chống nhân bản) ==')
{
  const dir = tempDir('c9')
  const stub = makeBrokenStub(dir)
  const state = freshState(dir)
  const r = runBin(dir, stub, ['install'], { AUTO_STATE: state })
  check('C9', 'exit 1', r.code === 1, `code=${r.code}`)
  check('C9', 'KHÔNG create/edit', !r.argv.includes(' create ') && !r.argv.includes(' edit '), r.argv)
  check('C9', 'state không đổi', readState(state).length === 0)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C10 briefing không có gì mới → "Không có gì bất thường" ==')
{
  const dir = tempDir('c10')
  const stub = makeOrcaStub(dir)
  const seams = makeSeamStubs(dir)
  const status = fixture(dir, 'status.txt', 'No brackets found — không có story.')
  const resume = fixture(dir, 'resume.txt', 'sf-1|RUNNING|commit 5h trước\n')
  const r = runBin(dir, stub, ['briefing'], {
    STORY_STATUS_BIN: seams.status, STATUS_FIXTURE: status,
    STORY_RESUME_BIN: seams.resume, RESUME_FIXTURE: resume,
    STORY_NOTIFY_BIN: seams.notify, NOTIFY_LOG: join(dir, 'notify.log'),
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    CHECK_FIXTURE: fixture(dir, 'ck.json', { ok: true, result: { messages: [] } }),
  })
  check('C10', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C10', 'body "Không có gì bất thường"', notifyCalls(dir).includes('Không có gì bất thường'), notifyCalls(dir))
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C11 --help + usage sai ==')
{
  const dir = tempDir('c11')
  const stub = makeOrcaStub(dir)
  const h = runBin(dir, stub, ['--help'], {})
  check('C11', '--help exit 0', h.code === 0, `code=${h.code}`)
  check('C11', '--help in usage', h.out.includes('story-automation-install') && h.out.includes('retire'), h.out.slice(0, 200))
  const u = runBin(dir, stub, ['--khong-biet'], {})
  check('C11', 'flag lạ exit 2', u.code === 2, `code=${u.code}`)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C12 briefing story-notify chết → notify-fail rõ ràng, exit 0 ==')
{
  const dir = tempDir('c12')
  const stub = makeOrcaStub(dir)
  const seams = makeSeamStubs(dir)
  const r = runBin(dir, stub, ['briefing'], {
    STORY_STATUS_BIN: seams.broken,
    STORY_RESUME_BIN: seams.broken,
    STORY_NOTIFY_BIN: seams.broken, // notify exit 7
    RL_FIXTURE: fixture(dir, 'rl.json', { ok: true, result: { runs: [] } }),
    CHECK_FIXTURE: fixture(dir, 'ck.json', { ok: true, result: { messages: [] } }),
  })
  check('C12', 'exit 0 (briefing không fail hard)', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C12', 'BRIEFING: notify-fail (không nói notified)', r.out.includes('BRIEFING: notify-fail') && !r.out.includes('BRIEFING: notified'), r.out)
  check('C12', 'body vẫn in ra stdout', r.out.includes('Briefing 20'), r.out)
  rmSync(dir, { recursive: true, force: true })
}

console.log('== C13 automation lạ cùng suffix KHÔNG bị adopt; multi-owned cảnh báo; retire partial fail exit 1 ==')
{
  const dir = tempDir('c13')
  const stub = makeOrcaStub(dir)
  const state = join(dir, 'auto-state.json')
  writeFileSync(state, JSON.stringify([
    { id: 'user-1', name: 'deploy-coordinator-pass', prompt: 'deploy pipeline của user', rrule: '*/5 * * * *', agentId: 'codex' },
    { id: 'user-2', name: 'team-morning-briefing', prompt: 'briefing team của user', rrule: '0 8 * * *', agentId: 'codex' },
    { id: 'e976ddde', name: 'orchestration-coordinator-pass', prompt: LEGACY_PROMPT, rrule: '*/30 * * * *', agentId: 'claude' },
    { id: 'mine-1', name: 'story-coordinator-pass', prompt: '1 lượt coordinator pass: bash ~/.claude/bin/story-coordinator-pass', rrule: '*/30 * * * *', agentId: 'claude' },
  ]))
  const r = runBin(dir, stub, ['install'], { AUTO_STATE: state })
  const st = readState(state)
  const user1 = st.find(a => a.id === 'user-1')
  const user2 = st.find(a => a.id === 'user-2')
  check('C13', 'exit 0', r.code === 0, `code=${r.code} out=${r.out}`)
  check('C13', 'deploy-coordinator-pass KHÔNG bị adopt (giữ nguyên prompt)', user1 && user1.prompt === 'deploy pipeline của user' && user1.rrule === '*/5 * * * *', JSON.stringify(user1))
  check('C13', 'team-morning-briefing KHÔNG bị adopt', user2 && user2.prompt === 'briefing team của user', JSON.stringify(user2))
  check('C13', 'chỉ create briefing — coord multi-owned KHÔNG create', (r.argv.match(/ create --name /g) || []).length === 1 && r.argv.includes(' create --name story-morning-briefing'), r.argv)
  check('C13', 'cảnh báo multi-owned coord', r.out.includes('automation owned nữa'), r.out)
  const r2 = runBin(dir, stub, ['retire'], { AUTO_STATE: state, REMOVE_FAIL_ID: 'mine-1' })
  check('C13', 'retire partial fail → exit 1', r2.code === 1, `code=${r2.code} out=${r2.out}`)
  check('C13', 'báo FAIL remove đúng automation', r2.out.includes('FAIL remove'), r2.out)
  const st2 = readState(state)
  check('C13', 'automation user còn nguyên sau retire', st2.some(a => a.id === 'user-1') && st2.some(a => a.id === 'user-2'), JSON.stringify(st2))
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
if (failures.length) {
  console.log('FAILURES:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('HARNESS GREEN')
