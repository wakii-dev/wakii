# Context pack — LOCAL-4 sf-3 — story-preflight: agent-alive-trên-primary + cảnh báo bypass

> ⚠️ Bản 11:44 bị đè bởi copy chéo — bản này là bản CHÍNH THỨC LOCAL-4.

Nguồn: sai phạm A1/A3 (pid 72180 `--dangerously-skip-permissions` cwd=master ILEC) + B1
(5-6 session trên primary) đêm 03/10 — không công cụ nào cảnh báo tại cửa.

## Spec slice
`story-preflight` thêm 2 check mới theo pattern checks hiện có (PASS/WARN/FAIL + hint):
1. **primary-agent-alive**: nếu cwd đang là primary checkout của repo có story đang mở
   (mindmap active/dest branch tồn tại) và tồn tại process agent (claude/node TUI) với cwd
   trong primary → WARN (hoặc FAIL khi cấu hình strict) kèm danh sách pid + cwd.
2. **permission-bypass-detected**: phát hiện process `claude` chạy cờ
   `--dangerously-skip-permissions` trong repo/checkout đang xét → WARN ghi rõ vi phạm
   LUẬT human-in-the-loop 24/09.

Chỉ CẢNH BÁO ở cửa — không kill, không ghi state. Fail-open khi lsof/ps lỗi hoặc thiếu
quyền; tôn trọng pattern GUARD_OFF nếu preflight có escape tương ứng.

## Touch map
- `kit/bin/story-preflight` — thêm 2 check (giữ output format hiện có)
- tests kit (check mới chạy được trên macOS test env — không đòi Linux-only tools)
- rehash kitHash + fingerprint nếu đổi bin (fence thứ tự 30/09; chmod 755 TRƯỚC hash)

## ACCEPTANCE (user-visible)
- Chạy `story-preflight` trên primary ILEC (môi trường có agent sống thật) → cảnh báo đúng
  pid đang sống; trên checkout sạch → không cảnh báo ảo.
- Output mới không phá consumer hiện có của preflight (parse không vỡ).
- Suite kit xanh.

## Boundary
- KHÔNG tự kill; KHÔNG block cứng mặc định (WARN mặc định, FAIL chỉ qua flag).
- KHÔNG đụng story-guard-* hooks (cơ chế khác — PreToolUse).
- Cross-platform: dùng lệnh có trên macOS + Linux (lsof/ps); Windows → skip check với ghi chú (theo support-matrix).
