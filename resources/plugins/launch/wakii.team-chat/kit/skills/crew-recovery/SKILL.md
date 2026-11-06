---
name: crew-recovery
description: Ladder xử lý worker/captain kẹt cho Captain Wakii — 4 bậc state→peek→respawn/adopt→stop. Use khi worker im lặng, pane chết, tin ⚠️ watchdog, hoặc trước khi quyết respawn worker. Cấm keystroke tự chế vào terminal worker.
---

# CREW RECOVERY — ladder 4 bậc (Captain xử worker kẹt)

> Nền app-side: fix churn `3d93504529` — Layer-1 xoá REG cần chết 2 tick + REG
> >5 phút; Layer-2 ADOPT orphan Claude sống trên worktree room TRƯỚC khi spawn
> mới. Skill này là nửa protocol (Captain làm gì tay), bổ sung cho nửa máy.

## Nguyên tắc trước ladder

1. **Cite đúng handle từ REG** (`~/.claude/chat/.workers.json`): mọi lệnh peek/
   respawn/adopt dùng pane handle + name ĐÚC TRONG REG — không đoán tên, không
   đoán worktree. REG stale → `team-orch reg-clean` hoặc sửa qua `team-orch
   register/unregister`, KHÔNG tự viết file tay khi bin còn chạy được.
2. **CẤM keystroke tự chế** — không gõ lệnh trực tiếp vào terminal worker
   (keystroke đến process lạ, dính session của worker, không có bằng chứng trong
   room). Mọi động tác đi qua bin (`team-who`, `team-orch`, `team-chat`).
3. **Mỗi bậc lên 1 tin room** — CEO phải thấy nhịp (captain.md HEARTBEAT).

## Ladder — đi đúng thứ tự, dừng ngay bậc xử được

### Bậc 1 — `state`: worker còn busy = CHỜ, không đụng

```bash
~/.claude/bin/team-who <name>        # trạng thái registration + handle
```

Worker có turn đang chạy (busy/heartbeat gần) → chờ. Im >15' mới qua bậc 2.
Tin DONE có thể đang trên đường — weaver 15/15 xanh nhưng chưa kịp post DONE
là case chuẩn.

### Bậc 2 — `peek`: đúng 1 LẦN, qua room

Gửi 1 tin vào room worker đang theo (`team-chat send --channel <room>`):
"ping <name> — báo trạng thái 1 dòng". **Peek 1 lần, không spam** — sau ~5'
không ACK mới qua bậc 3. KHÔNG mở transcript/terminal worker để "xem hộ".

### Bậc 3 — `respawn`/`adopt`: thay người, không phá việc

- **Adopt trước**: Claude sống trên worktree room (supervisor Layer-2 đã adopt
  tự động; tay thì `team-captain-adopt`) — giữ session, mất ít nhất.
- **Respawn**: pane chết thật (`team-who` không thấy handle sống) →
  `team-orch worker-start --background` với brief + hand-back ⑥ từ tin DONE
  gần nhất (nếu có). Spawn xong → dọn REG cũ (`team-orch reg-clean`).

### Bậc 4 — `stop` + report: 3 lần ladder không nhúc nhích

Lặp bậc 1–3 tối đa 3 vòng cho cùng worker. Vòng 4 = STOP: post tin room
(liệt kê: đã thử gì, kết quả từng vòng) + hỏi CEO bằng `[HỎI]`. Không tự respawn
vô hạn — mỗi respawn đốt token orphan (bài học churn 5/11).

## Bảng nhanh

| Dấu hiệu | Bậc | Lệnh |
|---|---|---|
| Worker busy, heartbeat gần | 1 | chờ — không làm gì |
| Im >15', registration sống | 2 | 1 tin room, đợi 5' |
| Pane chết / REG stale / orphan sống | 3 | adopt → respawn --background → reg-clean |
| 3 vòng không nhúc nhích | 4 | stop + `[HỎI]` CEO |

Thuật ngữ: xem `kit/GLOSSARY.md` (REG, Heartbeat, Churn, Dispatch).
