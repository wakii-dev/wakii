# Workfront Driver — navigator = coordinator tự động của dây chuyền story workflow

- Ngày: 2026-10-03
- Status: duyệt hướng (user: "ok" sau thiết kế trình bày; chọn "Auto đến DONE")
- Thay thế: mô hình advisor (Actor v1 — queue markdown + tick DIGEST) → archive
- Cha: `2026-09-30-story-navigator-design.md` (quan sát) · `2026-10-01-navigator-actor-v1-design.md` (worker động cơ)

## 1. Chẩn đoán dẫn đến thiết kế lại

Navigator cũ chạy nhưng "không có hành động để execute, không thấy sử dụng story workflow" — nó quan sát và viết markdown, trong khi dây chuyền thật (`story-launch` → worker → `story-verify` → advance DAG → converge → `story-close`) nằm im trong kit. Thiết kế mới: navigator **LÁI** dây chuyền đó, không còn đứng ngoài nhận xét.

## 2. Mục tiêu một câu

User trỏ 1 story vào `navigator/FOCUS` → navigator tự động launch SF, dispatch worker, verify, advance DAG cho đến khi hết SF — rồi DỪNG, soạn convergence, **chờ duyệt DONE**.

## 3. Vòng đời — MỘT STORY = MỘT NAVIGATOR (user ruling 03/10)

- **Tạo**: `navigator-runner.sh --loop <story-slug>` = sinh ĐÚNG 1 navigator cho ĐÚNG story đó (pane title `story-nav-<slug>`). Không có navigator toàn cục, không file FOCUS.
- **Sống**: navigator lái đúng story của nó qua decision table (§4) — 3h/pass.
- **Chết**: story DONE (user duyệt) → runner chạy `story-close` → **tự kill**: exit loop, đóng pane của mình. Không còn gì treo.
- **Bỏ story giữa chừng** (user không muốn lái nữa): xoá dòng FOCUS-of-instance (file state per-instance) hoặc đóng pane → navigator thoát sạch.
- Tại một thời điểm ĐÚNG 1 worker cho 1 navigator; N story chạy đồng thời = N navigator (mỗi cái 1 claude call/3h — tổng API không đổi so với 1 navigator quét N story).
- Không slug / slug không tồn tại → thoát ngay với 1 dòng log (không no-op vô hạn).

## 4. State machine mỗi pass (decision table — thứ tự từ trên xuống, đúng 1 nhánh)

| # | Điều kiện | Hành động |
|---|---|---|
| 1 | Worker session đang chạy SF (watchdog verdict RUNNING/BUSY) | quan sát — brief tiến độ, không đụng |
| 2 | Worker vừa xong / stall ≥2 tick | chạy verify-gates SF (B1–B4 + task-9 CDP nếu có) |
| 3 | Verify PASS | tick SF done trong mindmap/DAG → nhảy SF kế chưa done |
| 4 | Verify FAIL | dispatch fix-worker (cùng worker, brief fix); Attempts ≥2 → blocked + leo user |
| 5 | SF kế launch được (chưa launch + tier sẵn + probe run-list sạch) | `story-launch` SF đó → dispatch worker |
| 6 | Tất cả SF done | SOẠN convergence pack (evidence + verdict nháp) → **⛔ DỪNG — chờ duyệt DONE** |
| 7 | FOCUS trống / story không tồn tại | no-op |

- Worker = executor session thật làm code trên worktree SF, chạy theo task DAG của orchestration — đúng workflow kit.
- Verify/advance dùng bin kit: `story-verify`, mindmap/DAG tick, `story-launch`.

## 5. Cửa người (human gates) — duy nhất

- **DONE epic**: convergence pack soạn xong → DIGEST hiện "Sẵn sàng chốt DONE — gật?" → user duyệt → `story-close` chạy. Merge-to-dest nằm trong convergence/close → sau cửa.
- **Launch SF**: KHÔNG cần duyệt (auto) — nhưng bị rào: probe run-list (không run active) + probe worktree (không xung đột) + tier của bracket.
- **Never** (kể cả sau duyệt DONE): push thẳng `main`, Linear write cưỡng bức, xoá branch/worktree trước DONE.

## 6. An toàn

1. ĐÚNG 1 worker / 1 story / 1 lúc — kế thừa PID-lock + breaker + timeout 45m/20m + caffeinate
2. Mọi lệnh qua bin kit chuẩn — navigator không tự chế lệnh git/orchestration ngoài workflow
3. FAIL ×2 → blocked + leo; breaker ≥3 blocked/ngày → tắt pha lái, chỉ quan sát
4. Audit log từng hành động lái (lệnh gì, vì decision-table dòng nào, kết quả)
5. Guide-ack defect (task-list/gate-list MCP chết) — driver dùng orchestration CLI + mindmap làm nguồn chính, MCP là phụ

## 7. Kế thừa + dọn

- Giữ: runner pane-loop + caffeinate + PID-lock + timeout + DIGEST (nay = **action log**: "đã launch SF-2 · đã verify SF-3 PASS · đã advance")
- Archive 1 lần: inbox/queue markdown cũ của 13 story (144 entry) → `navigator/archive/` — hết vai trò (worker ăn task DAG thật)
- Bước 5–5.5 cũ trong prompt: thay bằng logic driver; fences observer (cấm mutation ngoài workflow bins) viết lại theo §5–6

## 8. Rollout

- **GD1 — dry-drive (2 pass)**: state machine chạy report-only trên story FOCUS thật (in-flight nếu có) — soi decision table chọn đúng nhánh
- **GD2 — drive thật 1 story đơn giản** (epic nhỏ, SF ít) — người can thiệp 0 lần trừ DONE
- **GD3 — vận hành thường**: đổi FOCUS khi cần; thước: SF launched→done trọn vòng không cần người

## 9. Thước đạt

- GD2: 1 epic nhỏ đi từ launch → hết SF với ĐÚNG 1 lần chạm người (duyệt DONE)
- Mọi hành động lái có audit + đúng decision table; 0 lệnh ngoài workflow bins

## 10. Non-goals

- Không lái nhiều story song song; không tự DONE/merge-to-dest
- Không đụng code kit (driver là script/prompt ngoài kit — promote G2)
- Không giữ mô hình queue-markdown cũ (worker ăn DAG thật)
