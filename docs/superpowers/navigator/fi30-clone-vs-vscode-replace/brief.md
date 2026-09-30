# Navigator brief — fi30-clone-vs-vscode-replace — 2026-09-30T17:19:46Z
Chế độ: strategy-brief · Trigger: automation (G1)
## Hiện trạng (≤5 dòng)
SF-1 (Search Replace/Replace All + toolbar New, linear FI-31, 10 tasks, tier 0): mindmap pending —
khớp thực tế: 0 commit FI-30 trên branch đích feature/clone-vs-vscode (local=remote, tip
227081995d là docs VU-14 SF-5). Không sf-* worktree, không agent sống. Story chưa rời vạch start.
## Rủi ro / dead-end (≤5 mục)
- Branch đích là branch CHUNG (FI-30/32/34 + docs VU-14) đang tiến — đầu vào phải pin base mới nhất, tránh conflict.
- SF 10 tasks lớn; bắt đầu muộn trên branch đông người → rebase nợ dồn.
- Linear FI-31 rate-limited: không đối chiếu được issue-side; approve/SF launch cần linear IDs (story-stats cũng chết vì vậy).
- Task 1 (dependency-gate-pin-base) là tiền đề — nhảy thẳng replace-engine (task 3) sẽ làm hỏng offset/CRLF nền tảng.
- Không có state.json lần trước → không có baseline so sánh tiến độ (pass này tạo baseline).
## Khuyến nghị top-3
1. Khi launch SF-1: chạy đúng tier — task 1 dependency-gate pin base tip 227081995d+ trước khi bất kỳ code nào → inbox NAV-20260930-1719-1
2. Theo dõi xung đột branch chung: FI-30 nên chờ FI-28 verify xong hoặc launch nhánh riêng rồi merge tuần tự → inbox NAV-20260930-1719-2
3. Khi Linear hồi phục: đối chiếu FI-31 (open/Done) trước khi approve/launch để tránh dispatch trùng → inbox NAV-20260930-1719-3
## Nguồn ⚠
- story_task_list không đọc được (guide-gate exit 1, retry đã chứng minh vẫn chết)
- story_gate_list không đọc được (guide-gate exit 1)
- story-stats không đọc được (cần bracket approve + linear IDs; Linear rate-limited)
- story-status states FI-30: Linear rate-limited — states tạm bỏ qua
