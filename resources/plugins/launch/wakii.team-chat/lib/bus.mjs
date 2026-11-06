// Team chat bus (HOI-16): log JSONL là nguồn sự thật duy nhất.
// ~/.claude/chat/team-chat.jsonl — mọi thành viên ghi/đọc cùng format:
//   {"at":<ms>,"from":"<tên>","role":"captain|worker|owner|system","channel":"<kênh>","text":"..."}
// Panel → storage 'team.chat.send' (single slot) → poller append file + xoá slot.
// CLI (Captain/workers) → bin team-chat append thẳng file.
import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Windows GUI processes have USERPROFILE but often no HOME (the app scrubs
// worker env to an allowlist that may carry only one of the two) — always
// resolve the user root through this instead of process.env.HOME directly.
export function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || ''
}

export const chatDir = join(homeDir(), '.claude', 'chat')
export const chatLog = join(chatDir, 'team-chat.jsonl')

//appendLine mới mkdir — roomCmd/mirrorRoster ghi thẳng nên dir phải có sẵn
//từ activate, không thì create-room đầu tiên ENOENT fail âm thầm.
mkdir(chatDir, { recursive: true }).catch(() => {})

// FIFO 300 tin/room (CEO 3/11): đọc toàn bus, group theo room, giữ 300
// mới nhất mỗi room — tail tổng = ghép tất cả, sắp theo at.
export const readTail = async () => {
  try {
    const raw = await readFile(chatLog, 'utf8')
    const lines = raw.split('\n').filter((l) => l.trim())
    if (!lines.length) return []
    const byRoom = new Map()
    for (const l of lines) {
      try {
        const m = JSON.parse(l)
        const ch = m.channel || 'general'
        if (!byRoom.has(ch)) byRoom.set(ch, [])
        byRoom.get(ch).push(l)
      } catch { /* skip dòng hỏng */ }
    }
    const result = []
    for (const [, msgs] of byRoom) {
      result.push(...msgs.slice(-300))
    }
    result.sort((a, b) => {
      try { return JSON.parse(a).at - JSON.parse(b).at } catch { return 0 }
    })
    return result
  } catch { return [] }
}

export const appendLine = async (msg) => {
  await mkdir(chatDir, { recursive: true })
  const line = JSON.stringify({
    at: Date.now(),
    from: String(msg.from || 'unknown').slice(0, 40),
    role: String(msg.role || 'system').slice(0, 12),
    channel: String(msg.channel || 'general').slice(0, 32),
    text: String(msg.text || '').slice(0, 4000)
  })
  await appendFile(chatLog, line + '\n')
}
