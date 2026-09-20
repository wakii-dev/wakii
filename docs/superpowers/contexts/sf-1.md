# Context pack — LOCAL-1 SF-1: Coordinator pass bin

> ⚠️ Pack này là của STORY LOCAL-1 "Story tự vận hành 24/7" — KHÔNG phải FI-305.
> File `sf-1.md` trùng tên với pack story cũ — nếu thấy nội dung khác pack này,
> DỪNG và báo coordinator (bài học FI-458 B2: glob khớp nhầm story).

## Spec slice (từ bracket local-1-self-sustain-24-7.md — SF-1, Tier 0)

Bin mới `kit/bin/story-coordinator-pass` — MỘT lượt coordination pass CÓ GIỚI HẠN
(bounded, không đợi vô hạn), exit 0 luôn (pass là hành vi, không fail hard):

1. **Run discovery**: `orca orchestration run-list --json` → run còn task
   pending/in-progress hoặc worker live → danh sách run ứng viên.
2. **Ownership probe**: run đang có worker live của coordinator KHÁC
   (`worker-list` — owner terminal ≠ terminal hiện tại) → chỉ quan sát, KHÔNG
   xử lý inbox của run đó (bài học collision 19/09: 2 coordinator cùng đụng SF-4).
3. **Inbox bounded**: với run được sở hữu → `check --wait --timeout-ms 300000`
   → xử lý: question → ĐỌC bracket/contexts rồi reply; escalation → đánh giá,
   đụng quyền user thì báo; worker_done → verify evidence (commit tồn tại,
   files ⊆ boundary) trước khi chấp nhận.
4. **Stall sweep**: `story-resume --check` → STALLED → chẩn đoán 3 tầng
   (git log → terminal state → mới RESUME) — chỉ resume khi có bằng chứng dương.
5. **PASS SUMMARY** 1 dòng: `PASS: processed=<n> replied=<n> resumed=<n> skipped-owned=<n> idle=<reason>`.

## Touch map
- NEW `kit/bin/story-coordinator-pass` (bash + python heredoc — pattern story-validate)
- NEW `tests/story-coordinator-pass-tests.mjs` (stub ORCA_BIN — pattern
  story-plan-validate-tests: fixture run-list/task-list/inbox JSON)
- KHÔNG đụng: story-watchdog, story-resume, main.mjs, kit.json (coordinator lo bump)

## Acceptance (observable)
- Stub orca: có run active + worker foreign → output chứa `skipped-owned` và
  KHÔNG gọi check của run đó
- Có question trong inbox → reply được gọi (argv log stub), reply body dẫn bracket
- worker_done evidence thiếu → KHÔNG chấp nhận, ghi NEEDS-VERIFY
- Không run active → `PASS: idle=no-active-runs`, exit 0
- `node tests/story-coordinator-pass-tests.mjs` HARNESS GREEN

## Boundary
- CHỈ worktree sf-1 + 2 file trên. KHÔNG đụng Linear (LOCAL-1 là story local —
  KHÔNG có issue thật, KHÔNG set state gì cả). KHÔNG đụng kit source repo
  (story-team-kit) — coordinator lo sync-back. KHÔNG merge main.
