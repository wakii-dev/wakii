#!/usr/bin/env node
// T3 — guard G3.5: chặn Edit/Write/bash-ghi khi plan-gate open theo WORKTREE PATH; read tự do.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'story-guard-plan-gate')
const root = mkdtempSync(join(tmpdir(), 'pg-guard-'))
const gates = join(root, 'gates'); const wt = join(root, 'wt'); mkdirSync(gates); mkdirSync(wt)
const b64 = Buffer.from(wt).toString('base64url')
writeFileSync(join(gates, b64 + '.json'), JSON.stringify({ taskId: 't1', planGateOpen: true }))
const env = { ...process.env, TEAM_TASK_GATES_DIR: gates }

const call = (payload) => spawnSync('python3', [BIN], { input: JSON.stringify(payload), encoding: 'utf8', env })

// 1) Edit khi gate open → exit 2
let r = call({ tool_name: 'Edit', cwd: wt, tool_input: {} })
if (r.status !== 2) { console.error('Edit phải exit 2, got ' + r.status); process.exit(1) }
// 2) Read → exit 0
r = call({ tool_name: 'Read', cwd: wt, tool_input: {} })
if (r.status !== 0) { console.error('Read phải 0'); process.exit(1) }
// 3) Bash echo thường → 0; Bash có > → 2
r = call({ tool_name: 'Bash', cwd: wt, tool_input: { command: 'echo hi' } })
if (r.status !== 0) { console.error('Bash thường phải 0'); process.exit(1) }
r = call({ tool_name: 'Bash', cwd: wt, tool_input: { command: 'echo x > file' } })
if (r.status !== 2) { console.error('Bash ghi phải 2'); process.exit(1) }
// 4) cwd KHÁC (không marker) → 0
r = call({ tool_name: 'Edit', cwd: join(root, 'other'), tool_input: {} })
if (r.status !== 0) { console.error('Nơi không marker phải 0'); process.exit(1) }
// 5) marker đóng → 0
writeFileSync(join(gates, b64 + '.json'), JSON.stringify({ planGateOpen: false }))
r = call({ tool_name: 'Edit', cwd: wt, tool_input: {} })
if (r.status !== 0) { console.error('Marker đóng phải 0'); process.exit(1) }
console.log('PASS plan-gate guard (T3)')
