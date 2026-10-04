# Improvements log (Principle 6 — flag, không tự sửa skill/kit giữa task)

## 2026-09-28 — VU-14 SF-4 — story-verify đọc nhầm instance orca (dev-first wrapper)
- **What**: `~/.claude/bin/story-verify` (kit 2.20.0) có wrapper `orca()` ưu tiên
  `ORCA_USER_DATA_PATH=$HOME/Library/Application Support/orca-dev` rồi mới prod rồi
  bare. Trên máy này, instance **orca-dev** trả SUCCESS với JSON hợp lệ nhưng registry
  chỉ có 1 worktree của project khác (mxs-cms) — wrapper không bao giờ fallback sang
  prod (nơi có đủ 11 worktrees incl. wakii). Hậu quả: WT_META rỗng-nội-dung →
  verify_sf rơi vào bracket-glob fallback → chọn nhầm bracket (dest=fi28,
  review=FI-309 của story FI-305) đúng như class bug FI-246 mà metadata-priority
  sinh ra để chống — nhưng chống được chỉ khi metadata ĐỌC ĐƯỢC.
- **Where**: kit bin `story-verify` (nguồn: resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-verify, hàm `orca()` ~dòng 62).
- **Suggested change**: (a) wrapper so sánh registry giữa dev/prod — nếu instance
  trả list không chứa worktree đang verify (path khớp $wt) → coi như miss, thử
  instance kế; hoặc (b) chấp nhận env override `ORCA_INSTANCE=prod|dev` để chạy
  verify ép instance; hoặc (c) khi dev trả list không chứa cwd → log warning rõ
  "metadata từ instance khác project".
- **Workaround hiện tại** (đã áp dụng trong SF-4): set metadata orca cho worktree
  (`orca worktree set --parent-worktree <story-coordinator> --linear-issue VU-14`)
  — vô dụng khi script đọc dev-instance, nhưng ĐÚNG cho mọi tool đọc prod/bare.
- **Impact lên SF-4**: B3/B4 của story-verify đọc nhầm story (B4 vẫn FAIL đúng
  bản chất pre-merge; B3 FAIL do Linear DEFERRED). Không chặn DONE theo định nghĩa
  user (push + evidence + worktree comment). Post-merge verify của coordinator cần
  chạy với prod instance hoặc sửa kit trước.

## 2026-09-28 — VU-14 SF-4 — evidence dir slug = tên worktree đầy đủ
- **What**: story-verify B1 đọc `docs/superpowers/evidence/$sf/test-run.txt` với
  `$sf` = **basename worktree** (vd `sf-4-convergence-wakii`), KHÔNG phải token
  `sf-4`. Memory cũ (FI-440 "slug như trong bracket") gây hiểu sf-4-<slug> ngắn
  hơn; glob fallback `sf-4*` còn khớp nhầm evidence story CŨ (sf-4-claim-protocol-infra
  của FI-458 sort trước).
- **Where**: story-verify B1 (~dòng 223-231).
- **Suggested change**: fallback glob nên loại các dir thuộc worktree/story khác
  (check hash tồn tại thay vì head -1), hoặc tài liệu hóa "evidence dir = tên
  worktree đầy đủ".

## 2026-10-04 — LOCAL-4 sf-4 (task_4119415a582b)

- **Defect story-verify (FI-308 tái hiện trên sf-4)**: mindmap-glob nhiễm story cũ alphabetically-trước
  — sf-4 resolve linear = FI-309 từ `fi305-superpowers-android.wakii` (sf-3 đã report FI-308 ở
  08987bb2). Suggested: story-verify cần ràng buộc mindmap theo story (match meta.dest/epic trước khi
  lấy linear) thay vì glob alphabet-first. SỞ HỮU: kit story-verify (ngoài scope sf-4) — chờ coordinator.
- **Defect story-verify B1 evidence anchor**: path convention = evidence/<tên-worktree-ĐẦY-ĐỦ>/
  test-run.txt (không phải slug ngắn) + hash chỉ nhận HEAD/HEAD~1 → evidence phải GỘP 1 commit duy
  nhất sau code commit (commit evidence tách 2 lần làm anchor vòng lặp lệch thế hệ). Suggested: in
  convention vào AGENTS.md hoặc story-verify hint. SỞ HỮU: kit.
- **workfront-driver (4 defect quan sát ILEC, report-only — evidence sf-4/observations-ilec.md)**:
  pane-title lookup trượt → pane mới mỗi pass; state reset ngoài driver tắt breaker; render_digest
  ENOENT crash mỗi pass portable; outcomes.jsonl nhiễm stack trace (15/16 pass). Driver thuộc session
  khác — fix là quyết định coordinator/USER.
- **NAVIGATOR.md pre-existing (P2 review-1)**: "breaker ≥3 blocked/ngày" + "FOCUS trống" không có logic
  tương ứng trong bin hiện tại — hẹn micro-fix docs riêng.
