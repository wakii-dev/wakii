// room-info — (e) đọc ~/.claude/chat/room-info/<room>.json cho panel chat.
//
// FORMAT KỲ VỌNG (đề xuất — Captain/worker F ghi, lib ĐỌC TOLERANT:
// trả nguyên object đã parse, không schema-enforce; field thừa/thiếu OK):
//
// {
//   "room": "orca-test",
//   "updatedAt": "2026-11-07T10:00:00.000Z",
//   "linearIssue": { "identifier": "HOI-18", "title": "…", "state": "In Progress",
//                    "url": "https://linear.app/…", "updatedAt": "…" },
//   "mindmap":     { "path": "docs/mindmap.wakii", "progress": { "done": 2, "total": 6 } },
//   "tcGate":      { "status": "green", "baseline": "<commit-sha>", "checkedAt": "…" },
//   "screenshot":  { "id": "<id>", "path": "~/.claude/chat/media/<id>.jpg", "capturedAt": "…" }
// }
//
// - Lane panel: (c) linearIssue · (d) mindmap · (e) tcGate · (f) screenshot (worker F).
// - File thiếu / JSON hỏng / không phải object → null — KHÔNG throw.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function roomInfoDir() {
  return join(homedir(), '.claude', 'chat', 'room-info')
}

export function readRoomInfo(room, opts = {}) {
  if (!room || typeof room !== 'string') return null
  let raw
  try {
    raw = (opts.readFileSync ?? defaultRead)(join(opts.dir ?? roomInfoDir(), `${room}.json`))
  } catch {
    return null
  }
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
}

function defaultRead(path) {
  return readFileSync(path, 'utf8')
}
