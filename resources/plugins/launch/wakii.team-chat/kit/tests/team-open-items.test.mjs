#!/usr/bin/env node
// FI-96 SF-B — team-chat open-items: quét bus + rooms.json + .workers.json + events,
// in open items theo thứ tự xử lý (①lost ②hỏi/blocked ③unack ④undone), mỗi item có "next:".
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'team-chat')
const root = mkdtempSync(join(tmpdir(), 'tc-open-items-'))
const chatDir = join(root, '.claude', 'chat')
mkdirSync(chatDir, { recursive: true })

const now = Date.now()
const T = (minAgo) => now - minAgo * 60000
const msg = (at, from, role, text, channel = 'alpha') =>
  JSON.stringify({ at: T(at), from, role, channel, text })
const stubTerms = join(root, 'terms.json')

const stubOrca = join(root, 'orca-stub.sh')
writeFileSync(stubOrca, '#!/bin/bash\nif [ "$2" = list ]; then cat "$STUB_TERMS"; else exit 3; fi\n')
chmodSync(stubOrca, 0o755)

function scenario({ bus = [], reg = {}, rooms = {}, events = [], terms = [], rawTerms = null, channel = ['open-items', '--channel', 'alpha'] }) {
  writeFileSync(stubTerms, rawTerms ?? JSON.stringify({ result: { terminals: terms.map((h) => ({ handle: h })) } }))
  writeFileSync(join(chatDir, 'rooms.json'), JSON.stringify(rooms))
  writeFileSync(join(chatDir, '.workers.json'), JSON.stringify(reg))
  if (events.length) writeFileSync(join(root, 'events.jsonl'), events.join('\n') + '\n')
  if (bus.length) writeFileSync(join(root, 'bus.jsonl'), bus.join('\n') + '\n')
  return spawnSync('bash', [BIN, ...channel], {
    encoding: 'utf8',
    env: {
      ...process.env, HOME: root, STUB_TERMS: stubTerms, ORCA_BIN: stubOrca,
      TEAM_CHAT_LOG: join(root, 'bus.jsonl'), TEAM_WORKERS_REG: join(chatDir, '.workers.json'),
      TEAM_EVENTS_LOG: join(root, 'events.jsonl'), PYTHONUTF8: '1',
    },
  })
}

const roomsBase = { alpha: { status: 'open', createdAt: T(60) }, beta: { status: 'open', createdAt: T(59) } }

// ── 1) ①②④ trong 1 room + nhiễu không đếm nhầm (③UNACK test riêng ở 2 — heuristic
//      theo timestamp: tin owner sau chip "chạm" chip, nên chip + UNACK không cùng hiện) ──
const r1 = scenario({
  rooms: roomsBase,
  bus: [
    msg(50, 'smith', 'worker', 'DONE t1 — ① xong ② test ③ evidence'), // worker đã DONE — nhiễu
    msg(40, 'ceo', 'owner', 'bắt đầu gói A'), // ACKed bởi worker T(35) — nhiễu
    msg(35, 'smith', 'worker', 'ok nhận gói A'),
    msg(28, 'vic', 'worker', '[HỎI] chip đã được captain trả lời'), // captain T(26) trả lời — nhiễu
    msg(26, 'captain', 'captain', 'chip đó chọn (a)'),
    msg(20, 'vic', 'worker', 'BLOCKED gate không mở được'), // ② BLOCKED chưa trả lời
    msg(15, 'kate', 'worker', '[HỎI] chọn (a) hay (b)?'), // ② HỎI chưa trả lời
    '{dòng hỏng\n', // bus hỏng không được làm chết lệnh
  ],
  reg: {
    term_alive: { name: 'smith', room: 'alpha', at: T(55), task: 't1', run: 'r1' },
    term_dead: { name: 'kate', room: 'alpha', at: T(16), task: 't2', run: 'r1' }, // ① LOST (subsume UNDONE)
    term_live2: { name: 'dave', room: 'alpha', at: T(8), task: 't3', run: 'r1' }, // ④ UNDONE
    term_beta: { name: 'other', room: 'beta', at: T(7), task: 't4' }, // room khác — phải loại
    term_event: { name: 'eve', room: 'alpha', at: T(9), task: 't9', run: 'r1' }, // event worker.done — không flag
    'pane-không-term': { name: 'p0', room: 'alpha', at: T(6), task: 't5' }, // không term_ — parity watchdog
  },
  events: [JSON.stringify({ v: 1, id: 'e1', at: T(5), kind: 'worker.done', repoId: 'r1', runId: 'r1', taskId: 't9', actor: 'eve', data: {} })],
  terms: ['term_alive', 'term_live2', 'term_event'],
})
if (r1.status !== 0) { console.error('1) exit ≠ 0: ' + r1.stderr); process.exit(1) }
const lines1 = r1.stdout.trim().split('\n')
if (lines1.length !== 4) { console.error('1) kỳ 4 item, thấy ' + lines1.length + ':\n' + r1.stdout); process.exit(1) }
const order1 = ['LOST', 'BLOCKED', 'HỎI', 'UNDONE']
for (let i = 0; i < 4; i++) {
  if (!lines1[i].startsWith(`${i + 1} ${order1[i]}`)) {
    console.error(`1) vị trí ${i + 1} kỳ ${order1[i]}, thấy: ${lines1[i]}`); process.exit(1)
  }
  if (!lines1[i].includes(' — next: ')) { console.error('1) thiếu next: — ' + lines1[i]); process.exit(1) }
}
for (const noise of ['smith', 'eve', 'p0', 'other']) {
  if (r1.stdout.includes(`'${noise}'`)) { console.error('1) đếm nhầm nhiễu: ' + noise); process.exit(1) }
}

// ── 2) ③UNACK + ④UNDONE (room beta): tin owner cuối chưa ACK, owner đầu đã ACK ──
const r2 = scenario({
  rooms: roomsBase,
  bus: [
    msg(30, 'ceo', 'owner', 'bắt đầu gói B', 'beta'), // ACKed bởi worker T(25) — nhiễu
    msg(25, 'bee', 'worker', 'ok nhận gói B', 'beta'),
    msg(20, 'ceo', 'owner', 'xong gói B chưa?', 'beta'), // ③ UNACK
  ],
  reg: { term_beta1: { name: 'bee', room: 'beta', at: T(10), task: 'b1', run: 'r1' } }, // ④ UNDONE
  terms: ['term_beta1'],
  channel: ['open-items', '--channel', 'beta'],
})
if (r2.status !== 0) { console.error('2) exit ≠ 0: ' + r2.stderr); process.exit(1) }
const lines2 = r2.stdout.trim().split('\n')
if (lines2.length !== 2 || !lines2[0].startsWith('1 UNACK') || !lines2[1].startsWith('2 UNDONE')) {
  console.error('2) kỳ [UNACK, UNDONE]:\n' + r2.stdout); process.exit(1)
}

// ── 3) bus + reg rỗng → room sạch ──
const r3 = scenario({ rooms: { alpha: { status: 'open', createdAt: T(60) } }, bus: [], reg: {}, terms: [] })
if (r3.status !== 0 || !r3.stdout.includes('sạch')) { console.error('3) kỳ room sạch: ' + r3.stdout + r3.stderr); process.exit(1) }

// ── 4) default channel = room open mới nhất (không --channel) ──
const r4 = scenario({
  rooms: { newer: { status: 'open', createdAt: T(10) }, older: { status: 'open', createdAt: T(50) } },
  bus: [JSON.stringify({ at: T(10), from: 'ceo', role: 'owner', channel: 'newer', text: 'lệnh mới nhất' })],
  reg: {}, terms: [], channel: ['open-items'],
})
if (r4.status !== 0 || !r4.stdout.includes('UNACK') || !r4.stdout.includes('lệnh mới nhất')) {
  console.error('4) default channel sai: ' + r4.stdout + r4.stderr); process.exit(1)
}

// ── 5) fail-soft: terminal list hỏng → bỏ qua LOST, không false-positive respawn ──
const r5 = scenario({
  rooms: roomsBase,
  bus: [msg(10, 'ceo', 'owner', 'còn việc không?')],
  reg: { term_dead: { name: 'ghost', room: 'alpha', at: T(12), task: 't2' } },
  rawTerms: '{not json', // stub trả JSON sai → parse fail → fail-soft
})
if (r5.status !== 0) { console.error('5) exit ≠ 0: ' + r5.stderr); process.exit(1) }
if (r5.stdout.includes('LOST')) { console.error('5) terminal list hỏng mà vẫn flag LOST'); process.exit(1) }
if (!r5.stdout.includes('UNACK')) { console.error('5) mất UNACK khi terminal list hỏng: ' + r5.stdout); process.exit(1) }

console.log('PASS team-chat open-items (FI-96 SF-B): thứ tự ①②③④ + next: + room sạch + default channel + fail-soft LOST')
