# Plan — SF-1 Schema + sinh file .wakii (VU-14)

Worktree: sf-1-schema-sinh-file · Nhánh: wakii-dev/sf-1-schema-sinh-file · Đích: story/vu-14-mindmap-wakii
Nguồn: context pack docs/superpowers/contexts/vu-14-mindmap-wakii/sf-1.md + spec 2026-09-27-mindmap-wakii-viewer-design.md

## 9 tasks (bracket) → thực thi

| # | Task | File đích | Ghi chú |
|---|---|---|---|
| 1 | schema-v1-decoder | `kit/bin/story-mindmap` (mode `--decode <file>`) | luật spec slice mục 2: bắt buộc / INVALID / drop-unknown+warning / edge thắng parent |
| 2 | story-mindmap-bin | `kit/bin/story-mindmap` (mới, zero-dep node) | CLI `--bracket <file> [--out <path>] [--json] [--mermaid-md <path>] [--decode <file>]` |
| 3 | context-pack-parse | trong bin | steps từ mục Spec slice đánh số (flows-to theo thứ tự, best-effort GHI RÕ); touch map: Sở hữu/Append-only → `writes`, Read-only → `impacts`; glob/free-text bỏ |
| 4 | story-impact-fan-in | trong bin | `story-impact --json` (seam `STORY_IMPACT_BIN`) khi có base → area `computed: true` + edge epic→area `impacts`; chết/timeout → bỏ lớp + decodeWarnings, exit 0 |
| 5 | lifecycle-trigger-wrappers | `kit/bin/story-mindmap-trigger` (mới) + chèn 3-5 dòng vào `story-launch` (sau create) + `story-close` (trước cleanup) | wrapper fail-open: nuốt missing-bin/throw, timeout 30s khi có `timeout`; `--commit` cho close (force-add + commit) |
| 6 | idempotent-atomic-write | trong bin | so payload loại-trừ generatedAt; giống → không ghi; khác → temp+rename |
| 7 | kit-manifest-provides-rehash | `kit/kit.json` (provides +2 entry, category enum) + kitHash rehash + `bundled-plugins.json` rehash + lockstep qua `pnpm test` + `verify-packaged-plugin-resources` | KHÔNG đụng version |
| 8 | gitignore-mindmaps-allowlist | `.gitignore` | `!docs/superpowers/mindmaps/` + `!docs/superpowers/mindmaps/**` (mẫu negate migrations) |
| 9 | golden-fixture-tests | `tests/story-mindmap-tests.mjs` | golden byte-match (trừ generatedAt) + decoder verdicts + idempotent + fail-open wrapper + pack thiếu touch map |

## Quyết định thiết kế (SF-level, ghi RÕ — spec cấp story đã chốt hướng)

- Trigger (b) sweep: story-coordinator-pass/story-watchdog KHÔNG nằm trong touch map → không sửa. Wrapper `story-mindmap-trigger --reason sweep` là bề mặt chịu gọi ngoài; wiring vào sweep bins = việc owner bins (REQUIREMENT-NOTE, không blocker).
- Task node state: không có nguồn cấu trúc per-task → `pending` + GHI RÕ trong file; SF state từ `orca orchestration task-list --json` (seam `STORY_ORCA_BIN`, fail-open → pending + warning); epic derive complete/in-progress.
- Decoder: node drop vì unknown-enum → edge/parent trỏ vào nó cũng drop + warning (giữ forward-compat); dangling tới id CHẲNG TỪNG tồn tại → INVALID. `parent` ≠ edge `contains` → không invalidate, edge là nguồn sự thật (decoder giữ nguyên dữ liệu, precedence ghi trong header bin cho SF-3).
- `meta.linear` / node.linear: bỏ hẳn khi bracket `linear:` rỗng (Linear deferred) — không emit chuỗi rỗng.
- Touch map extraction: chỉ backtick-path có `/`, không space, không `*` (glob `*.wakii` là output — bỏ).
- Golden fixture: nhúng trong test file (hermetic, temp repo) — KHÔNG commit .wakii thật từ SF worktree (single-writer: canonical chỉ ở checkout đích).

## Acceptance → case test

1. Golden 3 lớp byte-match (trừ generatedAt) → c1
2. Nguồn không đổi ×2 → lần 2 không ghi (mtime) → c2; payload đổi → generatedAt bump → c3
3. Duplicate-id / dangling / unknown-enum → verdict đúng → c4
4. story-impact chết/timeout → 2 lớp + decodeWarnings + exit 0 → c6
5. Wrapper thiếu bin / bin throw → exit 0 im lặng → c7; close --commit force-add → c8
6. kit-verify-manifest + lockstep + verify-packaged → gates cuối
7. Suite *-tests.mjs 35→36 exit 0 → gates cuối
