## NAV-20260930-2311-1 [open] Verify battery trên đích sau merge upstream 0925 rồi chốt DONE epic VI-1
Lý do: Commit cuối trên `story/vi-1-vietnamese-i18n` là merge `sync/upstream-main-0925` — chưa có bằng chứng guard tests + translatedness ratchet + story-verify B1 chạy SAU điểm đó.
SF-3 đã review APPROVED + evidence B1 sẵn; chỉ thiếu battery hậu-merge là đủ điều kiện converge về wakii-dev và DONE epic.
## NAV-20260930-2311-2 [open] Sync states mindmap .wakii về thực tế merged (SF-1/2/3)
Lý do: Mindmap decode mọi SF = `pending` (không tìm thấy orchestration run + story-impact ENOENT) trong khi git đã merge 3/3 SF — dashboard/nguồn #5 của pass sau sẽ đọc sai.
Nếu không sync, watchdog/landscape-check lần sau có thể cảnh báo giả hoặc dispatch trùng vào story đã xong code.
## NAV-20260930-2311-3 [open] Dọn entry worktree rác `sf-5-seo-i18n-qa` + chốt nguồn stats thay bracket
Lý do: `story-status` hiện ACTIVE SF WORKTREES chứa `sf-5-seo-i18n-qa` với path rỗng — registry rác gây nhiễu watchdog.
Bracket .md đã retire nên `story-stats` chết vĩnh viễn cho story này — cần quyết định nguồn stats thay thế (mindmap canonical) trước pass kế.
## NAV-20260930-1726-4 [open] Thi hành 3 entry mở pass trước — bắt đầu từ battery hậu-merge
Lý do: pass này không thấy commit mới trên story branch; 3 entry vẫn open không ack —
story đứng im nếu không ai thi hành; battery hậu-merge (NAV-2311-1) là tiền đề DONE epic.
## NAV-20260930-1726-5 [open] Epic DONE verdict VI-1 sau battery
Lý do: code + review + evidence đủ, vi.json đã shipped trên integration —
chỉ còn verdict + sync mindmap/epic state.
## NAV-20260930-1726-6 [open] Dọn registry worktree rác + 2 branch phụ sau DONE
Lý do: sf-5-seo-i18n-qa (path rỗng) + story/vi-1 local + coordinator branch treo
gây nhiễu watchdog/status; dọn sau khi epic DONE để còn tra cứu.
