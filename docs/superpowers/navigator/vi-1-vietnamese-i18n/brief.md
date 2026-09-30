# Navigator brief — vi-1-vietnamese-i18n — 2026-09-30T17:26:52Z
Chế độ: strategy-brief · Trigger: automation (G1)
## Hiện trạng (≤5 dòng)
3 SF merged trên integration (tip 0a2434f888 = merge upstream sync 0925 — không commit mới
từ pass trước); vi.json shipped trên integration; SF-3 review APPROVED (CHECKLIST-4Q 4/4) +
evidence B1. Epic còn "in-progress" — chỉ verdict là xong. 3 entry inbox pass trước
(NAV-20260930-2311-1..3) chưa ack: battery hậu-merge, mindmap sync, worktree rác.
Landscape-check không kích: không SF nào đổi nhãn so với state 30/09 (vẫn 3×merged).
## Rủi ro / dead-end (≤5 mục)
- Battery verify SAU merge upstream 0925 chưa có bằng chứng — review/evidence trước merge, code đã đổi sau đó.
- Mindmap 3 SF "pending" stale — nguồn #5 của pass sau đọc sai tiếp.
- Worktree rác `sf-5-seo-i18n-qa` vẫn trong registry ACTIVE (path rỗng) — nhiễu watchdog.
- story-stats chết vĩnh viễn cho story này (bracket .md retired) — nguồn #7 hỏng cấu trúc, không phải rate-limit.
- Branch phụ story/vi-1 (local) + wakii-dev/vi-1-vietnamese-i18n-coordinator còn treo — dọn sau DONE.
## Khuyến nghị top-3
1. Thi hành 3 entry mở NAV-20260930-2311-1..3 (battery hậu-merge trước, rồi DONE epic) → inbox NAV-20260930-1726-4
2. Epic DONE verdict sau battery — converge wakii-dev rồi đóng mindmap + epic state → inbox NAV-20260930-1726-5
3. Dọn registry worktree rác + 2 branch phụ sau khi epic DONE → inbox NAV-20260930-1726-6
## Nguồn ⚠
- story_task_list không đọc được (guide-gate exit 1)
- story_gate_list không đọc được (guide-gate exit 1)
- story-stats không đọc được (bracket .md retired — mindmap .wakii canonical thay thế)
- story-status states VI-1: không hiển thị (không rate-limited) nhưng không có states line — đọc từ mindmap/git thay thế
