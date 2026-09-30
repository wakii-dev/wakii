# Navigator brief — local2-verify-fixtures-refresh — 2026-09-30T17:34:47Z
Chế độ: strategy-brief · Trigger: automation (G1)
## Hiện trạng (≤5 dòng)
2 SF đều pending hoàn toàn: SF-1 deterministic-fixtures (tier 0, linear LOCAL-2, 5 tasks),
SF-2 refresh-runbook (tier 1, linear LOCAL-3, 3 tasks, depends SF-1). Chưa rời vạch:
branch đích story-local2-verify-fixtures không tồn tại, không sf worktree, không agent.
Story đang được session coordinator theo dõi (SessionStart liệt kê cả 2 SF). Hầu hết
story khác trong đợt đã merged — capacity trống cho launch.
## Rủi ro / dead-end (≤5 mục)
- pnpm test pretest cần VS Build Tools — fixtures phải chạy được ở checkout bất kỳ kể cả
  máy không có build tools (vitest trực tiếp với repo config) nếu không sẽ phá chính mục tiêu "checkout bất kỳ".
- story-verify phụ thuộc state kit (2.20.0) — fixture phải đóng băng state trong fake HOME, không đọc HOME thật.
- Suite kit có tiền lệ RED pre-existing (kit-verify-manifest) — baseline phải được ghi lại trước khi coi kết quả fixture.
- linear LOCAL-2/LOCAL-3 rate-limited — approve/launch thiếu đối chiếu issue-side.
- SF-2 chỉ là docs — đừng để bị kéo vào scope code của SF-1.
## Khuyến nghị top-3
1. Launch SF-1 ngay (tier 0): tạo worktree + branch story-local2-verify-fixtures, chạy đúng 5 tasks → inbox NAV-20260930-1734-1
2. Đóng băng baseline suite trước khi viết fixtures: ghi RED/GREEN hiện tại (fake HOME) làm mốc so → inbox NAV-20260930-1734-2
3. SF-2 giữ nguyên scope runbook 1 trang + header test tham chiếu — không mở rộng → inbox NAV-20260930-1734-3
## Nguồn ⚠
- story_task_list không đọc được (guide-gate exit 1, retry vẫn chết)
- story_gate_list không đọc được (guide-gate exit 1, retry vẫn chết)
- story-stats không đọc được (2 lần: "Không tìm thấy SF nào — cần bracket approve + linear IDs")
- git log branch đích story-local2-verify-fixtures: không đọc được (branch chưa tồn tại — SF chưa có commit)
