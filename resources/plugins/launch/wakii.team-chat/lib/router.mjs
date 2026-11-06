// Router Captain: ACK tin CEO/owner + chuyển tiếp vào terminal Captain.
// Layer: bus + registry + wake ← router — cấm import lên.
export function createRouter(orca, deps = {}) {
  const {
    appendLine = async () => {},
    captainEntries = async () => [],
    livePanes = async () => new Set(),
    wakeCaptainFor = async () => null,
  } = deps

  const ackedAt = new Set() // dedup: 1 tin chỉ ACK 1 lần (bug thấy thật 1/11 01:32)
  const captainAck = async (msg) => {
    if (ackedAt.has(msg.at)) return
    ackedAt.add(msg.at)
    const preview = String(msg.text || '').slice(0, 60)
    await appendLine({
      from: 'captain', role: 'captain', channel: msg.channel || 'general',
      text: `📡 Captain đã nhận: "${preview}" — đang xử lý.`
    }).catch(() => {})
    await orca.host.call('notifications.show', {
      title: 'Wakii Team — lệnh mới từ CEO',
      body: String(msg.text || '').slice(0, 120)
    }).catch(() => {})
  }

  const forwardTo = async (handle, msg) => {
    await orca.host.call('terminal.sendText', {
      terminalId: handle,
      text: `[CEO→captain|#${msg.channel || 'general'}] ${msg.from}: ${msg.text}\n(trả lời vào ĐÚNG room: ~/.claude/bin/team-chat send "..." --from captain --role captain --channel ${msg.channel || 'general'})\n`,
      enter: true
    })
  }

  const captainRoute = async (msg) => {
    try {
      const room = msg.channel || 'general'
      const entries = await captainEntries()
      const live = await livePanes()
      // Linh hoạt không block (CEO ruling 1/11): captain room → captain nào còn sống;
      // im lặng tuyệt đối là lỗi thiết kế.
      const pick = entries.find((c) => c.room === room && live.has(c.pane))
             || entries.find((c) => live.has(c.pane))
      if (pick) { await forwardTo(pick.pane, msg); return }
      appendLine({ from: 'system', role: 'system', channel: room,
        text: '💤 Captain#' + room + ' đang offline — tự đánh thức (room không worktree → Captain nổi trong Floating Workspace), dự kiến ~1 phút. Việc gấp chạy tay: ~/.claude/bin/team-captain-spawn --room ' + room }).catch(() => {})
      void (async () => {
        try {
          await wakeCaptainFor(room)
          await new Promise((r) => setTimeout(r, 12000)) // chờ Captain nhận brief (script gửi ở giây 8)
          const after = await captainEntries()
          const live2 = await livePanes()
          const ok2 = after.find((c) => c.room === room && live2.has(c.pane))
          if (ok2) await forwardTo(ok2.pane, msg)
        } catch { /* bỏ qua */ }
      })()
    } catch { /* route best-effort — ACK đã khẳng định presence */ }
  }

  return { captainAck, forwardTo, captainRoute }
}
