// linear-rate-limit tests — state machine + classify + fact-pack component.
// Chạy: node tests/linear-rate-limit-tests.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(testsDir, '..')
const BIN = join(pluginRoot, 'kit', 'bin')
const LRL = join(BIN, 'linear-rate-limit')

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}`) } else { fail++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`) }
}

function tempDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `lrl-${tag}-`))
  return dir
}

// Windows không chạy shebang script trực tiếp qua spawnSync — phải đi qua bash
// (cùng pattern với qa-happy-path-chain.mjs).
function run(args, env = {}) {
  return spawnSync('bash', [LRL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LINEAR_RATE_LIMIT_STATE: join(tmpdir('lrl-state'), 'state.json'), ...env },
  })
}

// State file riêng per-case: ghi đè LINEAR_RATE_LIMIT_STATE mỗi case
const stateOf = (dir) => join(dir, 'state.json')

console.log('== [lrl1] check — không có state = sạch ==')
{
  const dir = tempDir('lrl1')
  const r = run(['check'], { LINEAR_RATE_LIMIT_STATE: join(dir, 'none.json') })
  check('lrl1: exit 0 khi chưa có state', r.status === 0, `status=${r.status}`)
  check('lrl1: không tạo file lúc check', !existsSync(join(dir, 'none.json')))
}

console.log('== [lrl2] note — ghi op + refresh since ==')
{
  const dir = tempDir('lrl2')
  const st = stateOf(dir)
  const env = { LINEAR_RATE_LIMIT_STATE: st }
  let r = run(['note', '--op', 'watchdog:enforce-done:FI-999', '--bin', 'story-watchdog'], env)
  r = run(['note', '--op', 'launch:claim:FI-998', '--bin', 'story-launch'], env)
  check('lrl2: note exit 0', r.status === 0)
  check('lrl2: state tồn tại', existsSync(st))
  const j = JSON.parse(readFileSync(st, 'utf8'))
  check('lrl2: 2 ops trong queue', Array.isArray(j.ops) && j.ops.length === 2, JSON.stringify(j.ops))
  check('lrl2: since + cooldownMinutes có mặt', typeof j.since === 'string' && j.cooldownMinutes >= 1)
}

console.log('== [lrl3] check — active trong cooldown → exit 3 + in state ==')
{
  const dir = tempDir('lrl3')
  const st = stateOf(dir)
  writeFileSync(st, JSON.stringify({ since: new Date().toISOString(), cooldownMinutes: 15, ops: [] }))
  const r = run(['check'], { LINEAR_RATE_LIMIT_STATE: st })
  check('lrl3: exit 3 khi đang limited', r.status === 3, `status=${r.status}`)
  check('lrl3: in JSON state ra stdout', (r.stdout || '').includes('cooldownMinutes'))
}

console.log('== [lrl4] check — hết cooldown → sạch ==')
{
  const dir = tempDir('lrl4')
  const st = stateOf(dir)
  // since lùi 1 giờ — vượt cooldown 15 phút
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  writeFileSync(st, JSON.stringify({ since: old, cooldownMinutes: 15, ops: [{ bin: 'x', op: 'y', ts: old }] }))
  const r = run(['check'], { LINEAR_RATE_LIMIT_STATE: st })
  check('lrl4: exit 0 khi hết cooldown', r.status === 0, `status=${r.status}`)
}

console.log('== [lrl5] clear — xoá state ==')
{
  const dir = tempDir('lrl5')
  const st = join(dir, 'state.json')
  writeFileSync(st, JSON.stringify({ since: new Date().toISOString() }))
  run(['clear'], { LINEAR_RATE_LIMIT_STATE: st })
  check('lrl5: state bị xoá', !existsSync(st))
}

console.log('== [lrl6] classify — signature rate-limit ==')
{
  const body = tempDir('lrl6-body')
  const cases = [
    ['HTTP/1.1 429 Too Many Requests', true],
    ['{"errors":[{"message":"rate limit exceeded"}]}', true],
    ['complexity budget exceeded', true],
    ['{"errors":[{"message":"too many requests"}]}', true],
    ['{"data":{"issue":{"id":"123"}}}', false],
    ['network unreachable', false],
  ]
  let i = 0
  for (const [body, limited] of cases) {
    i++
    const bf = join(tempDir('lrl6b' + i), 'body.txt')
    mkdirSync(dirname(bf), { recursive: true })
    writeFileSync(bf, body)
    const r = spawnSync('bash', [LRL, 'classify', '--body', bf], { encoding: 'utf8' })
    const isLimited = r.status === 3
    check(`lrl6.${i}: ${JSON.stringify(body.slice(0, 40))} → ${limited ? 'limited' : 'ok'}`, isLimited === limited, `status=${r.status}`)
  }
}

console.log('== [lrl7] pending — in JSON mảng ops ==')
{
  const dir = tempDir('lrl7')
  const st = stateOf(dir)
  writeFileSync(st, JSON.stringify({ since: new Date().toISOString(), ops: [{ bin: 'b', op: 'o', ts: 't' }] }))
  const r = run(['pending'], { LINEAR_RATE_LIMIT_STATE: st })
  check('lrl7: pending in mảng ops', (r.stdout || '').includes('"bin": "b"'), r.stdout.slice(0, 100))
  // state hỏng → fail-open
  const bad = stateOf(dir) + '.bad'
  writeFileSync(bad, '{broken json')
  const r2 = run(['pending'], { LINEAR_RATE_LIMIT_STATE: bad })
  check('lrl7: state hỏng → không crash', r2.status === 0)
}

console.log('== [lrl8] run — bọc mutation: pass / rate-limit tự note / fail khác passthrough ==')
{
  const dir = tempDir('lrl8')
  const st = stateOf(dir)
  const env = { LINEAR_RATE_LIMIT_STATE: st }
  // thành công → exit 0, không note
  let r = spawnSync('bash', [LRL, 'run', '--bin', 't-ok', '--', 'bash', '-c', 'echo ALL-OK'], { encoding: 'utf8', env: { ...process.env, ...env } })
  check('lrl8.1: lệnh ok → exit 0', r.status === 0, `status=${r.status}`)
  check('lrl8.1: không tạo state', !existsSync(st))
  // rate-limit → exit 3 + tự note op (auto = argv json)
  r = spawnSync('bash', [LRL, 'run', '--bin', 't-limited', '--', 'bash', '-c', 'echo "Rate limit exceeded. Only 2500 requests are allowed per 1 hour." >&2; exit 1'], { encoding: 'utf8', env: { ...process.env, ...env } })
  check('lrl8.2: rate-limit → exit 3', r.status === 3, `status=${r.status}`)
  check('lrl8.2: stdout có marker ⇩ note', (r.stdout || '').includes('op đã note'))
  const j = JSON.parse(readFileSync(st, 'utf8'))
  check('lrl8.2: op auto-note vào queue', Array.isArray(j.ops) && j.ops.length === 1 && j.ops[0].bin === 't-limited', JSON.stringify(j.ops))
  check('lrl8.2: op chứa lệnh gốc', (j.ops[0].op || '').includes('2500'), j.ops[0].op)
  // fail thường → passthrough rc, không note
  const st2 = join(dir, 'state2.json')
  r = spawnSync('bash', [LRL, 'run', '--bin', 't-boom', '--', 'bash', '-c', 'echo boom; exit 7'], { encoding: 'utf8', env: { ...process.env, LINEAR_RATE_LIMIT_STATE: st2 } })
  check('lrl8.3: fail thường → passthrough exit 7', r.status === 7, `status=${r.status}`)
  check('lrl8.3: không note khi fail thường', !existsSync(st2))
}

console.log(`\n== TOTAL: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
