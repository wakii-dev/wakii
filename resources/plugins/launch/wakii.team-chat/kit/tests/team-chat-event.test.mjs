#!/usr/bin/env node
// T1 — team-chat event: phát machine event đúng schema §1 (id theo sourceEntityId — vòng 5).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'team-chat')
const home = mkdtempSync(join(tmpdir(), 'tc-event-'))
const env = { ...process.env, HOME: home, TEAM_CHAT_LOG: join(home, 'chat.jsonl'), TEAM_EVENTS_LOG: join(home, 'events.jsonl') }

const run = (args) => execFileSync(BIN, args, { env, encoding: 'utf8' })

// 1) shape đủ + id theo entity (taskId là source)
const out = run(['event', 'worker.done', '--repo', 'r1', '--run-id', 'run_1', '--task-id', 'task_9',
  '--actor', 'smith', '--data', '{"diff":"+1/-0"}'])
if (!out.includes('→ event')) { console.error('không in xác nhận'); process.exit(1) }
const line = JSON.parse(readFileSync(join(home, 'events.jsonl'), 'utf8'))
for (const k of ['v', 'id', 'at', 'kind', 'repoId', 'runId', 'taskId', 'actor', 'data']) {
  if (!(k in line)) { console.error('thiếu field ' + k); process.exit(1) }
}
if (line.kind !== 'worker.done' || line.v !== 1 || line.repoId !== 'r1' || line.id.length !== 12) process.exit(1)
const expectId = createHash('sha1').update('worker.done|task_9').digest('hex').slice(0, 12)
if (line.id !== expectId) { console.error(`id sai công thức entity: ${line.id} ≠ ${expectId}`); process.exit(1) }

// 2) dedup: phát lại cùng entity → cùng id → chỉ 1 dòng
run(['event', 'worker.done', '--repo', 'r1', '--run-id', 'run_1', '--task-id', 'task_9',
  '--actor', 'smith', '--data', '{}'])
const lines = readFileSync(join(home, 'events.jsonl'), 'utf8').trim().split('\n')
if (lines.length !== 1) { console.error('dedup fail: ' + lines.length + ' dòng'); process.exit(1) }

// 3) --repo bắt buộc
let rc = 0
try { execFileSync(BIN, ['event', 'worker.done', '--actor', 'x'], { env, encoding: 'utf8', stdio: 'pipe' }) } catch { rc = 1 }
if (rc === 0) { console.error('thiếu --repo phải exit ≠ 0'); process.exit(1) }

// 4) dòng hỏng không làm chết read (lỗ F vòng 5)
appendFileSync(join(home, 'events.jsonl'), '{json hỏng\n')
const who = execFileSync(BIN, ['event', 'worker.done', '--repo', 'r1', '--task-id', 'task_z', '--actor', 'a'],
  { env, encoding: 'utf8' })
if (!who.includes('→ event')) process.exit(1)
console.log('PASS team-chat event (T1)')
