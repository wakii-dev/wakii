# Context pack — LOCAL-4 sf-1 — story-launch ownership-probe mở rộng

> ⚠️ Bản 11:44 hôm nay bị ĐÈ bởi copy chéo story khác (nội dung FI-478). Bản này là
> bản CHÍNH THỨC của LOCAL-4 — các file fi458-*, sf-1-clone-vs-vscode, sf-1-editor-parity,
> vsc901-*, vu-14/ trong thư mục này là vật liệu story KHÁC, KHÔNG thuộc LOCAL-4, bỏ qua.

Nguồn: phân tích 13 sai phạm ILEC 03/10 (session coordinator 04/10) + prior-art probe kit bins.

## Spec slice
`story-launch` ĐÃ có pre-dispatch ownership probe (dòng ~211-221, lib `story-ownership-probe`,
fail-open): chỉ phát hiện worker live **trong SF worktree đích** qua run/worktree ownership.
Đêm 03/10 ILEC lọt 2 case vì probe mù 2 vùng:
1. Worker Claude sống với cwd = **primary checkout** của repo story (không thuộc SF worktree nào).
2. Worker ngoài orchestration (terminal spawn tay/kịch bản — run-list không thấy).

Nhiệm vụ: mở rộng probe (lib + caller) phủ đủ 2 vùng trên; khi phát hiện → TỪ CHẶN launch,
in bằng chứng (pid/handle/cwd); **giữ nguyên fail-open** (không có data → không phán → cho qua).
KHÔNG tự kill tiến trình nào.

## Touch map
- `resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-launch` — khối pre-dispatch
- `resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-ownership-probe` — thêm probe primary/out-of-band
- tests kit (`tests/*.mjs` — file test pattern theo suite hiện có)
- kit.json — nếu đổi description entry → rehash kitHash (`computeKitHash` main.mjs) + fingerprint (`verify-packaged-plugin-resources.cjs`); thứ tự rehash: bin → kitHash → kit.json → fingerprint cuối (fence 30/09)
- CHỈ sửa trong wakii repo; source repo story-team-kit = legacy frozen (ruling 22/09)

## ACCEPTANCE (user-visible)
- Tái lập kịch bản đêm 03/10 ở mức test: khi tồn tại process agent cwd-trong-primary của story
  đang mở → `story-launch` thoát ≠0 với thông báo chứa pid + cwd (không đẻ worktree trùng).
- Khi môi trường sạch → launch đi qua như cũ (không hồi quy launch hiện có).
- Suite kit xanh (trừ known-red platform-guard đã có SKIP).

## Boundary
- KHÔNG đụng session ILEC đang sống; KHÔNG kill tiến trình.
- KHÔNG đổi story-workflow SKILL.md, KHÔNG thêm bin mới (provides count giữ nguyên).
- Exec-bit: giữ 755 cho bin sửa — chmod TRƯỚC khi hash (fence rehash).

## Cập nhật 04/10 trưa — gốc rễ một phần ĐÃ fix ngoài story (commit 617a18a354)
story-launch probe cha bare-name → `--no-parent` âm thầm (sf-2 VU-32 mồ côi) đã đổi: probe
`branch:$DEST` → `--parent-worktree path:<path>`. sf-1 CẦN: (a) test hồi quy cho path này
(fixture bare-name vs branch: selector), (b) phần mở rộng probe primary/out-of-band như
spec chính trên vẫn còn nguyên. KitHash hiện 2eabae90, fingerprint 633ac342 — rehash lại
nếu đổi thêm.
