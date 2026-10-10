# Review 1 — LOCAL-5 sf-2 (rolling review nhóm T1-T5)

Reviewer: code-reviewer ĐỘC LẬP (subagent, 25 tool-calls, 12m20s) trên diff uncommitted
kit/bin/story-watchdog + tests/story-watchdog-wakii-tests.mjs (+328/−13).

## VERDICT: APPROVED — 0 P0 / 0 P1 / 4 P2

Verified-clean (probe thực nghiệm bash 3.2.57, không đoán):
- story_keys: keys(fi-458)={fi458,fi}; case spec fi-458 ≡ fi458-distributed-bracket MATCH;
  substring fi-45 NOMATCH; stem degenerate (a--b, -abc, rỗng) terminates không loop vô hạn
- injection/metachar: slug `wi-9*`/`story/wi-9` literal NOMATCH (không eval pattern); dest qua
  awk substr (không regex) — 2-layer chống near-miss story/wi-9x hoạt động
- ls_remote_capped: orphan sleep KHÔNG giữ pipe (stdout→/dev/null); timeout rc143 → SKIP
- repo không-git → rc1 SKIP fail-closed; dest chỉ-trên-remote → EXISTS (không false-skip)
- S9 chứng minh thật --story không scope auto-resume (stub ghi --send)
- shellcheck: 0 finding mới từ diff (14 findings = HEAD, pre-existing)
- Surgical: 2 files, mọi hunk map vào spec slice; suite tự reproducing 45/0

CHECKLIST-4Q: (1) network giữa DB Begin/Commit — PASS N/A bash, ls-remote read-only đứng trước
mutation; (2) external timeout — PASS cap 30s; (3) error best-effort có dấu vết — PASS (P2#1
trừ điểm stderr nuốt); (4) partial-failure compensation — PASS không batch mutation mới.

## P2 (coordinator nhận vá tất cả — TDD ngắn sau verdict)
1. [P2] stderr ls-remote bị nuốt — log không phân biệt dest-missing vs mạng hỏng → vá: thêm
   chi tiết ls-remote vào SKIP line
2. [P2] dest_exists per-FILE không dedupe (mindmap+bracket cùng dest missing = 2× ls-remote) →
   vá: memo 1-entry trong vòng file
3. [P2] --story không kèm --launch-next/--dry-run → silent no-op → vá: warn
4. [P2] thiếu test repo không-git cho dest_exists → vá: test S12

## story-diff-review (GATE 2, pre-commit) — giải trình false positive
- ❌ console.log ×13: TOÀN BỘ trong tests/story-watchdog-wakii-tests.mjs — pattern harness
  chuẩn của 46 kit test files (output test = interface, `check()` in PASS/FAIL). kit/bin/
  story-watchdog: 0 console.log. Không phải debug code.
- ⚠ File ngoài plan ×4: story-diff-review đối chiếu epic plan (path không khớp full) — cả 4
  file đều nằm trong touch map của SF plan (2026-10-10-local5-sf-2-watchdog-scoping-plan.md).
- ⚠ Commented-out code ×7: heredoc python/awk lồng trong bash strings — code sống, không phải
  code bị comment.
Kết luận: 0 blocking thật — commit tiến hành.
