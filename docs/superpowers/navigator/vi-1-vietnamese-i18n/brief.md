# Navigator brief — vi-1-vietnamese-i18n — 2026-09-30T16:11:15Z
Chế độ: strategy-brief · Trigger: thủ công (G0)
## Hiện trạng (≤5 dòng)
- Code 3/3 SF đã merge trên đích `story/vi-1-vietnamese-i18n`: SF-3 guard tests + review APPROVED + evidence addendum, commit cuối là merge upstream `sync/upstream-main-0925` (0a2434f888).
- Không SF worktree nào sống, watchdog trống ("no sf-* worktrees"), agents trống — story đang nghỉ giữa 2 pass, chưa thấy DONE verdict chính thức cho epic.
- Mindmap `.wakii` (canonical) decode mọi SF = `pending`: không tìm thấy orchestration run cho story + story-impact ENOENT → metadata mindmap lệch thực tế merged.
- Linear deferred (rate-limit) → states qua Linear không đọc được; `story-stats` chết vì thiếu bracket + linear IDs.
- `story-status` còn 1 entry rác trong ACTIVE SF WORKTREES: `sf-5-seo-i18n-qa` với path rỗng.
## Rủi ro / dead-end (≤5 mục)
1. Drift nguồn sự thật: mindmap nói pending trong khi git đã merge — dashboard/watchdog lần sau đọc nhầm "chưa làm gì" → cảnh báo giả hoặc dispatch trùng.
2. Epic có thể đã xong mà không ai chốt: SF-3 review APPROVED + evidence B1 có sẵn, nhưng chưa có bước converge (merge về wakii-dev + DONE epic) — story treo "xong-mà-không-done".
3. Battery chưa xác minh SAU merge upstream 0925 (commit cuối trên đích là merge): guard tests + translatedness ratchet có thể vỡ do upstream đụng i18n/catalog — chưa có bằng chứng chạy sau điểm này.
4. Nguồn stats chết cấu trúc: bracket .md đã retire, `story-stats` đòi bracket + linear IDs → mọi navigator pass sau mất nguồn #7 trừ khi quy trình nhận mindmap làm nguồn thay thế.
5. Đích chưa xác minh đồng bộ remote `wakii-dev/story/vi-1-vietnamese-i18n` (ngoài phạm vi 7 nguồn) — rủi ro local-ahead khi converge.
## Khuyến nghị top-3
1. Chạy battery verify (guard tests + translatedness ratchet + story-verify B1) trên đích SAU merge 0925, rồi mới chốt DONE epic → inbox NAV-20260930-2311-1
2. Sync states mindmap `.wakii` về thực tế merged (SF-1/2/3) — hoặc regen từ nguồn có run — để dashboard/nguồn #5 hết nói dối → inbox NAV-20260930-2311-2
3. Dọn entry worktree rác `sf-5-seo-i18n-qa` (path rỗng) và ra quyết định nguồn stats thay bracket cho các pass sau → inbox NAV-20260930-2311-3
## Nguồn ⚠
- ⚠ story_bracket_read: `docs/superpowers/brackets/vi-1-vietnamese-i18n.md` không tồn tại (retired theo ruling .wakii canonical 27/09) — mindmap .wakii đọc được thay thế
- ⚠ story_task_list không đọc được (orca orchestration task-list exit 1 — guide-gate redirect; thử lại 1 lần sau unlock vẫn chết)
- ⚠ story_gate_list không đọc được (cùng guide-gate, không retry thêm)
- ⚠ story-stats không đọc được ("Không tìm thấy SF nào — cần bracket đã approve + linear IDs"; Linear deferred — không retry)
