# Context pack SF-4 — Convergence round-trip + docs

## Spec slice
1. Round-trip E2E **automated**: fixture story (bracket + context pack thật trong temp repo) → `story-mindmap` sinh file .wakii đủ 3 lớp → IPC mở vào app (Playwright `_electron`, pattern real-smoke) → viewer render đúng node/edge/state cả 2 chế độ xem (Tiến độ / Logic & Impact).
2. Golden render tests: fixture vàng → snapshot render (node count + edge rel counts + màu theo token class) — chống regression chéo SF-2/SF-3.
3. Manual checklist (chạy khi release build — KHÔNG gate story): double-click .wakii thật trên mac dmg + Windows NSIS + Linux deb/rpm; AppImage → drag-drop path; kiểm app .md handler mặc định KHÔNG bị đụng (steal check); uninstall Windows gỡ sạch ProgID.
4. Docs reference format `.wakii` (docs/reference/wakii-mindmap-format.md mới): schema v1 + luật decoder + filename rule (từ nhánh đích) + single-writer topology + limitation AppImage + **phân biệt rõ** với thư mục runtime `/.wakii/` (session-memory, gitignore:90 — trùng tên, khác khái niệm).
5. Regression đo blast radius: touch map phase0 (~28 file) — review đo lại `story-impact --targets` trên diff cuối; area mới xuất hiện = tràn ranh giới → report.
6. Tiêu chí story DONE: tier 0+1 shippable checkpoint đã qua (SF-1/2/3 merged đích + story-verify sạch) + round-trip E2E xanh + docs có.

## Touch map
- Sở hữu: e2e round-trip test (mới) · golden render fixtures (mới) · manual checklist file (mới, trong docs story) · `docs/reference/wakii-mindmap-format.md` (mới).
- Append-only: AGENTS.md chỉ khi thêm quy tắc build/packaging bắt buộc mới (cân nhắc — hỏi PM trước) · release notes nếu release cut giữa chừng.
- Read-only: toàn bộ SF-1/2/3 output · fixture của các SF · electron-builder config (đối chiếu assert).
- Cấm: fix code thuộc SF-1/2/3 trong SF-4 (bug tìm thấy → report + trả về SF owning qua PM) · đụng release workflow chain (fork-release-cut...) · đổi schema/bin để "cho E2E dễ pass" — spec là nguồn sự thật.

## ACCEPTANCE
- E2E: launch → file tồn tại 3 lớp → app mở → viewer đúng cả 2 chế độ (automated, chạy được local).
- Golden: render fixture không đổi sau khi merge cả 3 SF.
- Manual checklist viết hoàn chỉnh (từng bước + expected result) sẵn sàng chạy lúc release.
- Docs reference đủ để agent ngoài kit parse file .wakii mà không đọc code.
- `story-impact --targets` trên diff cuối: areas khớp phase0 touch map (chênh lệch = giải thích hoặc thu hẹp).

## Boundary
- KHÔNG mở scope sửa bug SF trước (quy PM).
- KHÔNG gate story bằng manual checklist (manual chỉ lúc release build).
- KHÔNG thêm test flaky (network/OS-dependent không deterministic) — checklist manual thay thế.
- KHÔNG đụng Linear states của SF khác (verify là việc story-verify).
