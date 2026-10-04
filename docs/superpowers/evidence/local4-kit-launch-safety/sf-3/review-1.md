# review-1 — LOCAL-4 sf-3 story-preflight (nhóm T1+T2)

Reviewer: code-reviewer ĐỘC LẬP (subagent) — commit soi: `db04ecba52` qua `git show`
(không đọc working tree). Ngày: 2026-10-04.

## Verdict: APPROVED — 0 P0 / 0 P1 / 4 P2

Deterministic pass của reviewer: shellcheck (code mới 0 warning — SC1090 là pattern
config cũ), suite 31/31 trên extract commit, verifyPackagedPluginResources GREEN tại
HEAD (rehash f1e0ecdd5d), probe ps-truncation macOS (max line 5456 chars — check 8
không miss flag ở đuôi argv dài), hermeticity hậu-chạy (0 process/dir sót).
CHECKLIST-4Q: 4/4 PASS. Coverage pass: 3/3 file có finding hoặc "reviewed, clean".

## P2 + xử lý

| # | Finding | Xử lý |
|---|---------|-------|
| P2-1 | `set -u` crash khi HOME unset — `WS_P="${PREFLIGHT_WORKSPACES_DIR:-$HOME/orca/workspaces}"` chết giữa chừng (false-FAIL, vi phạm fail-open). Repro thật. | **FIX** commit `1fb52f7389` — `${HOME:-}` default; meta-test repro `env -u HOME` chạy đủ output tới dòng cuối |
| P2-2 | `/claude/` substring over-match (process có "claude" trong argv) → WARN ảo khả dĩ | **GIỮ NGUYÊN** — heuristic WARN đúng spec ("claude/node TUI"); under-catch là failure mode của SF; ghi nhận noise source |
| P2-3 | `/bin/bash` hardcode trong fixture → ENOENT Alpine/NixOS | **FIX** `1fb52f7389` — resolve `command -v bash` từ PATH, fallback `/bin/bash` |
| P2-4 | assert pid bằng substring (`pid 123` khớp nhầm `pid 1234`) | **FIX** `1fb52f7389` — thêm trailing space vào pattern (format luôn `pid N cwd=`) |

P2-1/P2-3 đụng bin/tests → rehash lại: kitHash `264f995a79c85d1a` + fingerprint
`891e6e44…` — verify-packaged-plugin-resources OK (2 plugins), kit-verify-manifest
30/30, suite story-preflight 31/31, full suite 41/42 (story-coordinator-pass C25
known-red 03/10 — Windows-sim, comment trong chính test, xref story-preflight = 0,
pre-existing trước CREATE).

## Phát hiện ngoài scope của reviewer (đã xác nhận)

- Fingerprint stale TẠI `db04ecba52` — do tách commit code/rehash; đã rehash ở
  `f1e0ecdd5d` ngay sau, GREEN tại HEAD. Đóng.
