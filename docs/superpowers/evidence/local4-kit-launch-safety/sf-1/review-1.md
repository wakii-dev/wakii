# Rolling review 1 — LOCAL-4 sf-1 (story-launch ownership-probe mở rộng)

- Reviewer: code-reviewer ĐỘC LẬP (subagent) — rolling review nhóm duy nhất của SF
- Commit reviewed: `41b6b4d6e7` (feat — 7 file, 733+/15-)
- Ngày: 04/10/2026
- Không có Linear để post (story LOCAL) — verdict lưu file này theo CHECK 3, commit `-f`

## Verdict: APPROVED

0 P0 · 0 P1 · 3 P2. Reviewer tự re-run 2 suite + kit-verify-manifest trên máy
(không tin bằng chứng briefing), position-verify từng finding bằng grep tại commit.

### Deterministic (reviewer tự chạy)
- `bash -n` 2 bin — OK
- story-ownership-probe-tests.mjs — 89 PASS / 0 FAIL rc0
- story-ownership-probe-real-lsof-tests.mjs — 17 PASS / 0 FAIL rc0; leak-check sạch
- kit-verify-manifest — 30 PASS / 0 FAIL rc0 (fingerprint + mọi bin 755)
- provides = 74 (không bin mới) · kitHash khớp · workfront-driver thuần mode change

### P2 (không chặn)
1. **[med] `ancestor_pids` ps chết → break im lặng → có thể fail-CLOSED cục bộ**
   (story-ownership-probe, khối python `while pid > 1`): exclusion rỗng → launcher
   có thể tự chặn chính mình. Trái spec fail-open.
   → **ĐÃ VÁ** commit `cb19c46f74`: seam `OP_PS_BIN` + ps hỏng → `PROCERR` fail-open
   toàn phần. TDD P8 RED→GREEN (91 PASS / 0 FAIL).
2. [design-note] Skip `primary_wts` nuốt cả zone=wt khi OP_WT_PATHS nằm dưới
   `<primary>/.claude/worktrees` — unreachable với layout hiện tại (SF worktree ở
   `$HOME/orca/workspaces/`); ghi nhớ nếu đổi layout.
3. [env-note] P5 lệ thuộc `ps` thật của máy — chấp nhận (đúng hành vi cần chứng minh).

### Coverage pass (7/7 file)
- kit/bin/story-ownership-probe — 2 P2 trên; parse lsof/within/OP_PROC_HITS/in-band: clean
- kit/bin/story-launch — reviewed, clean (B1-B6 giữ nguyên từng nhánh, set -u an toàn, dry-run semantics nguyên)
- tests/story-ownership-probe-tests.mjs — clean (hermetic qua OP_PROC_JSON/OP_PROC_FILE)
- tests/story-ownership-probe-real-lsof-tests.mjs — clean (try/finally SIGKILL, không rò process)
- kit/kit.json — clean · bundled-plugins.json — clean (lockstep kvm) · workfront-driver — clean (mode 755)

### CHECKLIST-4Q
1. Network/external call giữa DB Begin/Commit? — N/A (không DB trong diff)
2. HTTP client/external call có timeout? — PASS (lsof 30s, ps 10s)
3. Error best-effort có dấu vết? — PASS (PROCERR lý-do → op_warn stderr; degrade path in rõ)
4. Partial-failure có compensation? — N/A (scan read-only, KHÔNG kill đúng spec)

## Sau review
- P2-med fix: `cb19c46f74` — rehash kitHash `bd97b778499a0655` + fingerprint `9c1aeae3…`,
  kvm/doctor/sc-map GREEN, suite 91+17 PASS.
- P2 còn lại: ghi chú thiết kế/môi trường — không code, để dành cho SF khác nếu layout đổi.
