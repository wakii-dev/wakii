# MESSAGE TEMPLATES — bộ khuôn tin nhắn Wakii Team

Một trang duy nhất cho MỌI thành viên (workers, Captain, CEO, người mới). Workers
DÙNG LỆNH thay vì tự so format — lệnh đã ép đúng khuôn (gọi `team-chat` không
flag là thấy usage).

## Worker → chat (bắt buộc, dùng lệnh)

| Lệnh | Tin tạo ra | Khi nào |
|---|---|---|
| `team-chat plan "<các bước + DoD đo được>"` | `[PLAN] <text>` | Plan-gate đang OPEN — Bước 0 (G3.5). Đề xuất kế hoạch, DỪNG chờ duyệt |

**Spawn worker (Captain)**: `team-orch worker-start --name <role>-* --room <room> --background` — LUÔN `--background` (spawn đồng bộ chặn captain ~80s/worker, sự cố "Mustering 3-4 phút" 1/11). Worker tự ACK vào room khi nạp brief xong.
| `team-chat done "<task>" --did "…" --test "…" --evidence "…" [--deviations "…" --open "…" --next "…"]` | `DONE <task> — ① Đã làm: … ② Cách test: … ③ Bằng chứng: … ④ Deviations: … ⑤ Still open: … ⑥ For-next-crew: …` | Hoàn thành (hand-back 6 mục). **①②③ thiếu 1 = lệnh từ chối** (hiến pháp §0.0); ④⑥ optional — chỉ đi khi có giá trị, ⑤ bắt buộc đi khi còn việc dở |
| `team-chat blocked "<lý do + đã thử gì>"` | `BLOCKED <lý do>` | Kẹt ~15 phút. Block×3 cùng cách → ngừng, chờ Captain ép hướng |
| `team-chat impact "<yêu cầu>" --scope .. --arch .. --risk .. --effort .. --deps .. --rec ..` | `[IMPACT] … ①-⑥` | **Stage 1** — worker `impact-*` (agent phase0-impact-analyst). Đủ 6 chiều bắt buộc, thiếu = trả lại |
| `team-chat design "<flow, màn hình, data model, trade-off>"` | `[DESIGN] …` card 🎨 | **Stage 3** — bằng chứng thiết kế trình CEO duyệt |
| `team-chat mindmap "<cây thụt lề 2 space/cấp>" --file docs/mindmap.wakii` | `[MINDMAP] 📄 file` card 🧠 | **Cuối stage 2** — sơ đồ tư duy FEATURE (scope), lưu file .wakii, CEO duyệt trước design |
| `team-chat review "<scope>" --checked ".." --findings ".." --verdict ok\|cần-sửa` | `[REVIEW] … ①-③` | **Stage 5** — worker `reviewer-*` (agent code-reviewer) review độc lập trước harvest |

Tên người gửi: pane đã đăng ký thì TỰ KHÓA đúng tên (bỏ `--from`). KHÔNG commit — Captain giữ merge.

Ví dụ `done` chuẩn (đủ 6 mục — worker có lệch spec/còn dở/truyền việc thì đi đủ, không thì chỉ ①②③):

```bash
team-chat done "HELLO.md" \
  --did "tạo /worktree/HELLO.md 2 dòng theo spec" \
  --test "cat /worktree/HELLO.md — phải ra đúng 2 dòng" \
  --evidence "wc -l = 2; guard chặn Bash ghi trước duyệt (đã quote ở bước [PLAN])" \
  --deviations "file để docs/ thay vì root — spec không chỉ định chỗ" \
  --open "chưa test dark mode" \
  --next "worker kế: chạy test dark mode trước khi ship"
```

**Quy ước review hand-back 6 mục** (Captain): chấm từng mục theo tin DONE trong room —
① khớp spec slice · ② test có chạy thật · ③ bằng chứng đo được. **KHÔNG peek
transcript/terminal của worker** — tin DONE trong room là bề mặt duy nhất; thiếu
④ khi code lệch spec = trả lại; có ⑤ mà không ⑥ = trả lại (người kế phải biết
làm gì tiếp từ 1 dòng `next:`). Chi tiết ladder xử worker kẹt: skill `crew-recovery`.

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
