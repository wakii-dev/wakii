#!/usr/bin/env node
// T2 — team-orch: wrapper phát event + plan-gate marker theo WORKTREE PATH (§2.2/§0.3).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'team-orch')
const root = mkdtempSync(join(tmpdir(), 't-orch-'))
const fakeOrca = join(root, 'orca'); const repoDir = join(root, 'repo'); mkdirSync(repoDir, { recursive: true })
writeFileSync(fakeOrca, `#!/bin/bash
case "$2" in
  worker-start) echo '{"result":{"worker":{"id":"w1","terminalHandle":"t-h1"}}}' ;;
  gate-resolve) echo '{"result":{"gate":{"id":"gate_x1","status":"resolved"}}' ;;
  *) echo '{"result":{}}' ;;
esac
`)
chmodSync(fakeOrca, 0o755)
const env = { ...process.env, ORCA_BIN: fakeOrca, HOME: root,
  TEAM_EVENTS_LOG: join(root, 'events.jsonl'), TEAM_TASK_GATES_DIR: join(root, 'gates'), TEAM_REPO_ID: 'r1' }

const b64 = (s) => Buffer.from(s).toString('base64url')

// 1) worker-start --require-plan-approval: marker open theo worktree path + event
execFileSync(BIN, ['worker-start', '--task', 'task_9', '--require-plan-approval',
  '--name', 'smith-x', '--worktree', 'explicit:' + repoDir, '--repo', 'r1', '--run', 'run_1'], { env, encoding: 'utf8' })
const marker = JSON.parse(readFileSync(join(root, 'gates', b64(repoDir) + '.json'), 'utf8'))
if (!marker.planGateOpen || marker.taskId !== 'task_9') { console.error('marker sai'); process.exit(1) }
const ev1 = JSON.parse(readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n')[0])
if (ev1.kind !== 'plan.gate.open') { console.error('event 1 sai: ' + ev1.kind); process.exit(1) }
const ev2 = JSON.parse(readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n')[1])
if (ev2.kind !== 'worker.hired' || ev2.actor !== 'smith') { console.error('event 2: ' + ev2.kind); process.exit(1) }

// 2) gate-resolve --plan → marker đóng + plan.approved
execFileSync(BIN, ['gate-resolve', '--id', 'gate_x1', '--resolution', 'approved',
  '--plan', '--worktree', repoDir], { env, encoding: 'utf8' })
const m2 = JSON.parse(readFileSync(join(root, 'gates', b64(repoDir) + '.json'), 'utf8'))
if (m2.planGateOpen) { console.error('gate chưa đóng'); process.exit(1) }
const evs = readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
if (!evs.some(e => e.kind === 'plan.approved')) { console.error('thiếu plan.approved'); process.exit(1) }
console.log('PASS team-orch (T2)')
