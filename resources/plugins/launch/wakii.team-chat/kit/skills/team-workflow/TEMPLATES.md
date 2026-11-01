# MESSAGE TEMPLATES — bộ khuôn tin nhắn Wakii Team

Một trang duy nhất cho MỌI thành viên (workers, Captain, CEO, người mới). Workers
DÙNG LỆNH thay vì tự so format — lệnh đã ép đúng khuôn (gọi `team-chat` không
flag là thấy usage).

## Worker → chat (bắt buộc, dùng lệnh)

| Lệnh | Tin tạo ra | Khi nào |
|---|---|---|
| `team-chat plan "<các bước + DoD đo được>"` | `[PLAN] <text>` | Plan-gate đang OPEN — Bước 0 (G3.5). Đề xuất kế hoạch, DỪNG chờ duyệt |
| `team-chat done "<task>" --did "…" --test "…" --evidence "…"` | `DONE <task> — ① Đã làm: … ② Cách test: … ③ Bằng chứng: …` | Hoàn thành. **Thiếu 1 trong 3 flag = lệnh từ chối** (hiến pháp §0.0) |
| `team-chat blocked "<lý do + đã thử gì>"` | `BLOCKED <lý do>` | Kẹt ~15 phút. Block×3 cùng cách → ngừng, chờ Captain ép hướng |
| `team-chat impact "<yêu cầu>" --scope .. --arch .. --risk .. --effort .. --deps .. --rec ..` | `[IMPACT] … ①-⑥` | **Stage 1** — worker `impact-*` (agent phase0-impact-analyst). Đủ 6 chiều bắt buộc, thiếu = trả lại |
| `team-chat design "<flow, màn hình, data model, trade-off>"` | `[DESIGN] …` card 🎨 | **Stage 3** — bằng chứng thiết kế trình CEO duyệt |
| `team-chat mindmap "<cây thụt lề 2 space/cấp>"` | `[MINDMAP] …` card 🧠 | **Stage 3** — cây tính năng trình CEO duyệt |
| `team-chat review "<scope>" --checked ".." --findings ".." --verdict ok\|cần-sửa` | `[REVIEW] … ①-③` | **Stage 5** — worker `reviewer-*` (agent code-reviewer) review độc lập trước harvest |

Tên người gửi: pane đã đăng ký thì TỰ KHÓA đúng tên (bỏ `--from`). KHÔNG commit — Captain giữ merge.

Ví dụ `done` chuẩn:

```bash
team-chat done "HELLO.md" \
  --did "tạo /worktree/HELLO.md 2 dòng theo spec" \
  --test "cat /worktree/HELLO.md — phải ra đúng 2 dòng" \
  --evidence "wc -l = 2; guard chặn Bash ghi trước duyệt (đã quote ở bước [PLAN])"
```

## Router tự phát (máy — không cần ai gõ)

| Tin | Ý nghĩa |
|---|---|
| `📡 Captain đã nhận: "<trích>" — đang xử lý.` | ACK tức thì mọi tin CEO / nhắc `@captain` (+ notification máy) |
| `[CEO→captain] <tên>: <lệnh>` | Chuyển lệnh vào terminal Captain thường trực |

## Captain → chat

| Tin | Khi nào | Nguồn |
|---|---|---|
| `🏁 Feature #<repo>-<tên> mở — run <id>` | Mở feature | `team-orch feature-open` tự gửi |
| `👷 <Tên> được thuê — plan-gate OPEN` | Thuê worker + khóa ghi | `team-orch worker-start` tự gửi |
| `✅ Feature <tên> ĐÓNG — <kết quả>` | Chốt feature | Captain so (kết quả + số liệu verify) |
| **CHAT STYLE 6 luật** | MỌI tin Captain | Xem `agents/captain.md`: kết luận dòng đầu · ≤8 dòng · bullet · mỗi câu hỏi 1 dòng · kết bằng việc CEO cần làm · thuật ngữ kèm giải thích |

## Sự kiện máy (JSONL riêng — panel Timeline sẽ đọc)

`run.created · worker.hired · plan.gate.open · plan.approved · task.completed ·
task.abandoned · worker.lost · run.summary · lesson.proposed`

Phát qua `team-chat event <kind> --repo … --actor …` hoặc tự động bởi `team-orch`
/ `team-retro`. Id = sha1(kind|entity) → dedup mọi đường phát.
