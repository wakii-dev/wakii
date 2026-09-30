# Navigator brief — vsc901-pipeline-smoke — 2026-09-30T17:28:34Z
Chế độ: strategy-brief · Trigger: automation (G1)
## Hiện trạng (≤5 dòng)
SF-1 "Pipeline smoke verify" (linear FI-45): story TEST — bằng chứng end-to-end pipeline
story-workflow chạy được (epic + sub-issue + .wakii + worktree lineage + evidence Linear),
không commit code production. Chưa start: branch đích story-vsc901-pipeline-smoke không tồn tại
(local lẫn remote), không sf worktree, không agent. Mindmap tạo 30/09 02:45Z.
## Rủi ro / dead-end (≤5 mục)
- Story test tồn tại trong danh sách active chung — nếu không chạy/xoá sẽ nhiễu mọi pass sau.
- Automation vscode-sync (đối tượng smoke) không xác nhận được trạng thái — task/gate list chết (guide-gate).
- Chưa approve bracket (story-stats chết: cần approve + linear IDs) → không launch được theo luồng chuẩn.
- Nếu smoke chạy đôi khi automation khác đang quản lý vscode-sync → trùng dispatch (memory FI-478: 2 runs song song).
- Không có baseline pass trước — pass này tạo baseline pending.
## Khuyến nghị top-3
1. Kiểm automation vscode-sync còn chạy/kích được không rồi chạy smoke SF-1 đúng một lần → inbox NAV-20260930-1728-1
2. Xong smoke: đóng/xoá mindmap test khỏi danh sách active (không để treo vĩnh viễn) → inbox NAV-20260930-1728-2
3. Nếu automation đã chết: ghi rõ VSC-901 blocked-by-automation, không launch tay thay automation → inbox NAV-20260930-1728-3
## Nguồn ⚠
- story_task_list không đọc được (guide-gate exit 1)
- story_gate_list không đọc được (guide-gate exit 1)
- story-stats không đọc được (cần bracket approve + linear IDs; Linear rate-limited)
- story-status states VSC-901: Linear rate-limited — states tạm bỏ qua
