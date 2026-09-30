# G1 Runbook — story-navigator (tuần quan sát)

## Trạng thái
Automation `story-navigator` · full id `19006934-d46d-4713-a6ae-ef49dc4586db` · cron `17 */3 * * *` UTC cấu hình; thực tế scheduler đang chạy kiểu interval ~3h từ run gần nhất (nextRunAt = last+3h) — PROBE 01-02/10: qua ≥2 nhịp, so `orca automations runs` + brief mtime; xác nhận xong cập nhật dòng này · provider claude · repo orca (wakii-main/wakii-dev).
Bật ngày: 2026-09-30. Tuần quan sát kết thúc: 2026-10-07.
⚠ `orca automations show/run/remove` CHỈ nhận FULL ID — name không resolve.

## Kiểm hàng ngày (≤2 phút)
1. `orca automations runs` — kỳ vọng ~8 run/ngày; KHÔNG tin cột status (nó báo `completed` ngay khi dispatch — đã biết) — kiểm chứng = timestamps trong `docs/superpowers/navigator/<story>/brief.md` mới mỗi tick. Tick có thể lệch so với phút :17 — xét brief mtime, đừng xét giờ đúng.
2. Brief mới có Nguồn ⚠ với lý do cụ thể (khuôn `⚠ <nguồn> không đọc được (<lý do>)`).
3. Inbox — coordinator ack entry mới trong ngày làm việc (`[ack]` + 1 dòng quyết định).
4. Commit outputs tick: `git add -f docs/superpowers/navigator && git commit -m "docs(navigator): outputs <YYYY-MM-DD>"` — outputs là TRACKED files, để bẩn sẽ chặn switch/merge branch sau này. Làm TRƯỚC MỌI lần switch/merge.

## Hành vi đã cấu hình (hiểu trước khi hoảng)
- **Self-cleanup (Bước 9)**: hết story active → automation TỰ XOÁ (mutation được phép #1). Story mới → tạo lại bằng lệnh dưới.
- **Coordinator-pass (Bước 10)**: chỉ stall-deep-dive + run ACTIVE — tối đa 1 câu/pass sign `NAVIGATOR:`; reply đọc ở pass kế (state field `coordinator_asked`).
- **Precheck overlap**: run bị skip nếu còn brief mới hơn 10 phút (`! find docs/superpowers/navigator -name 'brief.md' -mmin -10 | grep -q .`).
- **Toast (Bước 8)**: kích bởi token trong caller prompt, KHÔNG phải env var.

## Tạo lại automation (sau self-cleanup hoặc xoá nhầm)
    orca automations create \
      --name story-navigator \
      --trigger "17 */3 * * *" \
      --provider claude \
      --workspace path:/Users/hoivu/Desktop/projects/orca \
      --workspace-mode existing \
      --precheck "! find docs/superpowers/navigator -name 'brief.md' -mmin -10 | grep -q ." \
      --prompt "Đọc docs/superpowers/navigator/navigator-pass-prompt.md và thực thi NGUYÊN VĂN từ Bước 1 đến Bước 10 cho toàn bộ story active mà story-status liệt kê (tuần tự, một story một lúc). Caller token: NAVIGATOR_AUTOMATED=1. Fences trong prompt là bất di bất dịch." \
      --enabled
Ghi lại FULL ID mới vào mục Trạng thái.

## Thước G1 (spec §10)
- ĐẠT: ≥1 entry inbox ack "chấp nhận" dẫn tới thay đổi quyết định thật trong tuần; đọc brief ≤2 phút.
- THẤT BẠI: 0 ack chấp nhận sau 1 tuần, hoặc brief toàn tin đã biết → gỡ automation, giữ brief thủ công on demand.

## Rollback (một lệnh, mọi lúc)
    orca automations remove 19006934-d46d-4713-a6ae-ef49dc4586db

Không cần revert commit docs — outputs cũ là lịch sử.

## Neo rủi ro đã biết
- Collect degraded: task_list/gate_list ⚠ mỗi pass (defect guide-ack — backlog G2) — ĐỪNG coi là pass hỏng.
- KHÔNG chạy `orca automations run` tay trong ±10 phút quanh tick cron (tránh overlap — precheck sẽ skip nhưng đừng phụ thuộc).
- NAV-ID: giờ UTC bắt buộc; `<n>` ĐẾM TIẾP từ entry hiện có trong inbox (không reset).
- 429 penalty: automation là process claude DUY NHẤT chạy định kỳ — nếu bật process định kỳ khác, tắt cái này.
- Pass lâu >3h = tín hiệu thu nhỏ scope collect, không phải thêm cron.
