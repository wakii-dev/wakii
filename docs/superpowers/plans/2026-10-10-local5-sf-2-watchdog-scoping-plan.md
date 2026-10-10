# Plan — LOCAL-5 sf-2: story-watchdog --launch-next scoping (fail-closed)

Nguồn: docs/superpowers/contexts/sf-2.md (pack CHÍNH THỨC, đồng bộ spec CHỐT qua
spec-critic 10/10) + mindmap local5-improve-kit.wakii node sf-2. Story LOCAL —
KHÔNG Linear; audit = evidence files + worktree comment.

## Phase 0 — Impact analysis (đã verify trên code, không đoán)

- **Vấn đề**: `launch_next` (kit/bin/story-watchdog:231-427) scan MỌI
  `mindmaps/*.wakii` + `brackets/*.md` trong MỌI repo root → repo đa-story (orca:
  11 stories) `--launch-next` không `--story` → launch story stale (incident
  04/10: FI-417/441/463/486/498 — dest không tồn tại, attempt chết giữa chừng,
  coordinator phải STOP mid-flight).
- **Touch map (verified)**: `kit/bin/story-watchdog` (launch_next + arg-parse;
  KHÔNG đụng resume/enforce-done/heartbeat/with-index) ·
  `tests/story-watchdog-wakii-tests.mjs` (fixture git thật — P1-1) ·
  `kit/kit.json` kitHash + `resources/plugins/launch/bundled-plugins.json`
  fingerprint (rehash ×2 — P0-2) · boundary doc (P1-4).
- **Second-order**: single-story repo giữ nguyên (W1-W5 regression) · dest-absent
  check ở launch path CHUNG chặn cả launch không-scoping (skip + warning, không
  đổi exit code — SKIP = exit 0) · ls-remote chỉ khi show-ref miss, 1 lần, cap
  30s · story-launch call path GIỮ NGUYÊN (chỉ lọc file nguồn đầu vào) · cron
  entry hiện tại KHÔNG có --launch-next → cron behavior không đổi.
- **Multi-dim**: Functional (6 acceptance có fixture) · Technical (bash 3.2 +
  set -u array guards — pattern có sẵn dòng 257-265) · Security (slug chỉ
  so-match, không bao giờ eval; git args quoted) · Perf (show-ref rẻ; ls-remote
  chỉ-on-miss) · Backward-compat (single-story regression bắt buộc) · UX (SKIP +
  reason + hint --story) · Maintenance (3 helper bash thuần + tests) ·
  Operational (dry-run an toàn; limitation sf-N-* chéo story ghi Boundary). Skip:
  Data (không schema), Business (n/a).
- **Alternatives (epic P0 đã fork, spec CHỐT thắng)**: fail-closed global SKIP
  (chọn) vs prompt-interactive (cần TTY) vs auto-pick-first (chính là bug).
  --story match: boundary-token dash-normalization (spec ví dụ `fi-458` ≡
  `fi458-distributed-bracket`) vs substring (`fi-45` khớp nhầm `fi458` — nguy
  hiểm) vs exact-chuỗi (hụt ví dụ spec).

## Decision — match semantics (từ ví dụ spec, không tự chế)

`norm(s)` = lowercase + bỏ mọi `-`. Keys(stem) = norm(stem) + norm(prefix cắt tại
mỗi dấu `-`). VD keys(`fi458-distributed-bracket`) = {fi458distributedbracket,
fi458, fi458distributed} → `--story fi-458` (norm `fi458`) khớp ✓; `--story
fi-45` (`fi45`) không khớp key nào ✓ exact. 0-match → warn + exit 0; >1-match →
warn mơ hồ + exit 0 (fail-closed — KHÔNG pick hộ).

## Tasks (map epic plan Task 2 — 9 tasks)

- [x] T1 — TDD RED: fixture git THẬT trong story-watchdog-wakii-tests.mjs (git
      init + dest branch thật — P1-1; makeFixture nâng cấp) + tests mới S1-S11:
      đa-story SKIP / --story launch đúng story / dash-normalization (fi-458 +
      fi458 mơ hồ → warn; full-stem khớp duy nhất) / 0-match → warn exit 0 /
      dest-absent (chung + --story) / bracket legacy tính union / dedupe
      same-stem / single-story regression — chạy RED, W1-W5 cũ không phá.
      ✅ RED 26 PASS / 19 FAIL (19 assert mới fail đúng thiết kế — tdd-red.log;
      W1-W5 + S8/S11 pins xanh trên code cũ).
- [x] T2 — GREEN: SKIP toàn cục đa-story (union stems dedupe per-repo >1, không
      --story → SKIP + warning liệt kê repos, exit 0, 0 launch).
- [x] T3 — GREEN: `--story <slug>` parse (trước/sau --launch-next đều được) +
      match dash-normalization + lọc file nguồn; 0-match → warn exit 0; mơ hồ →
      warn exit 0.
- [x] T4 — GREEN: dest-absent launch-path-chung: `git show-ref` local → 1 lần
      `git ls-remote` (cap 30s) → skip + warning; chạy cả khi không --story.
- [x] T5 — GREEN: --story CHỈ scope launch_next (test --auto-resume vẫn toàn cục
      khi có --story) + single-story regression → suite watchdog GREEN.
      ✅ GREEN 45 PASS / 0 FAIL (tdd-green.log). Real-world: trước = 25 stale
      launch plans trên 4 repo; sau = 0 launch, 7 repo đa-story SKIP (incl.
      `orca` 15 stories), exit 0 từ launch-next (exit 1 của run = section
      diagnose báo 4 SF STALLED-COLD — pre-existing, không liên quan).
      Bài học: `printf '%s'` không newline trong helper → consumer line-oriented
      (`read`/`sort -u`/`grep -c`) thấy 1 blob — match NOMATCH, count=1 (silent
      fail-closed sai chiều). Helper trả dòng PHẢI printf '%s\n'.
- [ ] T6 — Rolling review: code-reviewer ĐỘC LẬP trên diff T1-T5 → verdict vào
      evidence/sf-2-story-watchdog-launch/review-1.md; fix P0/P1 nếu có; verdict
      post lên worktree comment (LOCAL).
- [x] T7 — Boundary doc (P1-4): docs/reference/story-watchdog-launch-next-scoping.md
      — semantics --story + known limitation worktree-ownership `sf-N-*` chéo
      story (glob `sf-$n-*` ~368), lineage check = fix đúng — phase sau.
      ✅ Doc viết + INDEX.md dòng story-watchdog thêm chú thích scoping.
- [ ] T8 — Rehash ×2 (P0-2): computeKitHash → kit/kit.json → fingerprint →
      bundled-plugins.json → kit-verify-manifest GREEN (tests/kit-verify-manifest.mjs
      + plugin-tree-hash-lockstep test).
- [ ] T9 — Commit atomic + evidence B1 (evidence/sf-2-story-watchdog-launch/test-run.txt
      chứa hash HEAD + dòng tdd) + suite cuối GREEN.

## Acceptance → test mapping

1. Đa-story không --story → SKIP + warning, 0 launch, exit 0 — S1
2. --story slug (dest tồn tại) → launch SF kế đúng story — S2, S3 (dash full-stem)
3. --story không khớp mindmap nào → warn + exit 0 — S4 (0-match), S5 (mơ hồ fi-458/fi458)
4. Dest missing (local + remote miss) → SKIP + warning (launch path chung) — S6 (không --story), S7 (--story)
5. Single-story → hành vi cũ nguyên vẹn — S8 + W1-W5
6. Suite watchdog GREEN — toàn bộ file tests

## Boundary

- KHÔNG đụng logic verify/tick/driver — chỉ --launch-next path + arg-parse
- KHÔNG thêm auto-relaunch thời gian thực (driver --loop lo)
- P1-4 worktree-ownership sf-N chéo story → chỉ Boundary doc (T7), lineage check phase sau
- Không bump kit version (chỉ rehash); KHÔNG merge/ff vào story-local5-improve-kit
  (coordinator merge); KHÔNG đụng primary/main
