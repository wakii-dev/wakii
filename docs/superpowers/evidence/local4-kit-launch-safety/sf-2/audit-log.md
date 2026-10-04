# Audit log — LOCAL-4 sf-2 (Mindmap state nhất quán giữa worktrees)

> Story LOCAL KHÔNG có Linear (CẤM gọi Linear API) — audit ghi file này thay Linear
> comment (Principle 7 adapted). Reproduction-grade: ai đọc lại chạy được từng bước.

- Orchestration: task_93f2f490d65b · worktree `sf-2-mindmap-state-worktrees`
  (branch `wakii-dev/sf-2-mindmap-state-worktrees` fork từ `wakii-dev/story-local4-kit-launch-safety` @ 539e80788c)
- Context pack: docs/superpowers/contexts/sf-2.md — dòng 1 đúng
  "Context pack — LOCAL-4 sf-2" (BƯỚC 0 pass lần đọc đầu, không cần retry).

## Phase 0 — impact analysis (đọc code trước khi chọn hướng)

Đọc: story-mindmap (472 dòng: decoder/update-state), story-mindmap-trigger,
story-close, workfront-driver (362: sf_states đọc $MM relative cwd), story-watchdog
(692: mindmap chỉ đọc cấu trúc; done-decision đi Linear — global), story-resume
(346: sf_meta chỉ đọc bracket), story-verify (evidence conventions), kit hash/fence
(computeKitHash main.mjs:596, kit-verify-manifest, verify-packaged-plugin-resources).

Chọn **(A) read-resolver** thay (B) tick-back sweep — rationale bảng so 4 tiêu chí
trong plan file. Semantics phi-hiển: no-downgrade merge per node (đích done nâng
local pending; local done không bao giờ bị hạ — FI-30 2 chiều), thứ tự tìm file
local → đích → worktree anh em → MISSING exit 3.

Non-goal ghi rõ: story-watchdog KHÔNG đổi code (done-decision đi Linear, không có
đường đọc stale; worktree-only discovery cho launch_next là class khác — ngoài acceptance).

## Phase 1 — Linear

Bỏ qua có chủ ý: story LOCAL không có Linear. Không tạo issue, không gọi API/CLI.

## Phase 2 — spec/brainstorm (adapted story-workflow)

Epic đã trả lời mọi câu (không re-ask). Rationale chọn phương án ghi vào plan file
(đóng vai spec SF): docs/superpowers/plans/local4-sf-2-mindmap-state-plan.md.

## Phase 3 — plan

Plan file 7 tasks T1-T7, tick sau bằng chứng từng task.

## Phase 4 — execute (TDD)

- T1 RED→GREEN: tests/story-mindmap-resolve-tests.mjs (40 asserts) — RED xác nhận
  (`--resolve` chưa có → usage exit 2) trước khi implement. 2 bug giữa chừng:
  fixture self-loop epic→epic (resolver phân xử ĐÚNG — INVALID), rel tính từ
  repoRoot symlink-resolved (/tmp vs /private/tmp macOS) → thử nhiều gốc.
- T2 RED→GREEN: tests/workfront-driver-resolve-tests.mjs (7 asserts, e2e --dry) —
  VU32 (dest done + local pending → driver thấy done), VOCAB (worktree-only →
  MM repoint + states đúng), LEGACY fallback, MISSING rõ ràng.
- T3 RED→GREEN: R15 trong tests/story-resume-tests.mjs (28 asserts total) —
  .wakii-era không bracket → sf_meta đọc dest+linear từ mindmap.
- Suite pre-commit: 43 file, đỏ duy nhất nhóm hash-gates (kit-verify-manifest,
  sc-evidence-map, story-doctor) — dự đoán trước, xanh sau rehash. C25
  coordinator-pass: Windows-sim known-red 03/10, trên macOS đụng real orca
  run-list (run_5ca468c45821 owner coordinator khác) — environmental, pre-existing
  trên base, ngoài touch map.
- Fence (đúng thứ tự kit): chmod 755 3 bins → computeKitHash → kit.json →
  fingerprint hashPackagedPluginTree → bundled-plugins.json → verify-packaged
  OK → commit --no-verify → full suite.

Commits:
- 8f6fe55058 feat(kit): mindmap resolve — đọc chuẩn state sf node mọi worktree (FI-30/VU-32)
- 9db9916d3d fix(kit): driver log() định nghĩa trước khối PORTABLE (pre-existing:
  lần log đầu trong khối PORTABLE rơi vào /usr/bin/log hệ thống vì def nằm sau —
  phát hiện qua demo Rule 0, nằm trên tuyến acceptance driver --repo)

## Rule 0 (CHECK 4) — sandbox demo CLI-equivalent (SF này pure CLI/kit, không web port)

rule0-sandbox-demo.sh + rule0-sandbox-demo.txt: BIN THẬT trên git fixture /tmp:
1. VU-32: đích done + primary pending → resolve done (upgraded=[sf-1]); driver
   --dry thấy "sf-1 done" (hết re-dispatch việc đã merge); shasum trước=sau
   (READ-ONLY proof). 2. FI-30 ngược: local tick done + đích pending → giữ done.
   3. vocabulary-learn: mindmap chỉ ở worktree → worktree scan + driver MM repoint,
   đọc đúng file. 4. Không đâu có → resolver exit 3 + driver EXIT có giải thích.
KHÔNG đụng mindmap story thật nào; KHÔNG tick hộ VU-32/vocabulary-learn thật.

## Reviews (CHECK 3)

- review-1.md: code-reviewer độc lập trên diff 539e80788c..9db9916d3d (nhóm T1-T3+log-fix)
  — APPROVED 0P0/0P1/5P2; 3 P2 fix (bd7da901f1), 2 ghi nhận.
- review-2.md: nhóm T4-T6 (fence + evidence + demo) — APPROVED 0P0/0P1/3P2 +
  1 NEEDS-VERIFICATION. NEEDS-VERIFICATION xác nhận là gap thật (destRequested
  tính trước base load → worktree-only không được nâng từ đích) → fix 030a85aca5
  + WTDEST pin; 3 P2 demo/test-âm fix cùng lượt. Trong lúc fix tự sinh bug đảo
  điều kiện — suite bắt ngay (DESTONLY/DSTFLAG đỏ), sửa cùng commit.

## Bài học ghi nhận (mini-ritual)

- `RESOLVE="$BIN --flag"` rồi `"$RESOLVE" args` = chuỗi chứa flag → "No such file
  or directory" — dùng function thay biến chuỗi (demo script, 2 lần sửa).
- `git checkout <dest>` sau khi commit mindmap trên dest xoá file khỏi working
  tree (tracked-on-dest, absent-on-main) — fixture phải ghi lại copy local stale
  sau switch (chính là hiện tượng VU-32 trên primary).
- macOS symlink: git trả root /private/tmp, caller dùng /tmp → path.relative
  escape → rel absolute → git show sai path. So sánh path qua git phải thử cả
  hai gốc (hoặc realpath 2 phía).
- Review-2 NEEDS-VERIFICATION bắt đúng gap mà cả executor + review-1 đã bỏ lỡ:
  thứ tự tính biến trong resolver (destRequested trước base load) làm mất đúng
  case combo 2 bệnh. Refactor sau đó tự sinh bug đảo điều kiện — suite pin từng
  nhánh là net thật, bắt trong 1 lần chạy.
- Bash demo: proof READ-ONLY phải bọc ĐÚNG lệnh được chứng minh (shasum trước-sau
  quanh lệnh đó, không phải 2 shasum liền nhau).
