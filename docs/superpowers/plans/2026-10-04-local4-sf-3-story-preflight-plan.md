# Plan — LOCAL-4 sf-3: story-preflight check agent-alive-trên-primary + cảnh báo permission bypass

Nguồn: docs/superpowers/contexts/sf-3.md (pack CHÍNH THỨC) + mindmap local4-kit-launch-safety.wakii node sf-3.
Liên quan task_b4f5645b4cba. Story LOCAL — KHÔNG Linear; audit = evidence files.

## Phase 0 — Impact analysis (đã verify trên code, không đoán)

- **Vấn đề**: đêm 03/10 — pid 72180 chạy `claude --dangerously-skip-permissions` + 5-6 session
  trên primary, không công cụ nào cảnh báo tại cửa. `kit/bin/story-preflight` (110 dòng) chỉ có
  6 check: branch/tree/server/DB/node_modules/.env — không thấy agent sống, không thấy bypass.
- **Touch map (verified)**: `kit/bin/story-preflight` + `tests/story-preflight-tests.mjs` +
  manifest mô tả (kit.json provides entry + INDEX.md 1 dòng) + fence rehash
  (kitHash trong kit/kit.json → fingerprint trong resources/plugins/launch/bundled-plugins.json).
- **Consumer parse**: tests F1-F5 assert chuỗi output các check cũ — check mới PHẢI thêm dòng,
  không sửa dòng cũ. Không tool nào parse số-dòng-cố định (grep: chỉ tests + SKILL.md docs).
- **Second-order**: perf +1 lệnh ps + ≤2 lsof mỗi lần preflight (chấp nhận — chạy tại cửa);
  false-positive grep "claude" khống chế bằng loại helper (grep/awk/lsof/preflight) + scope cwd
  trong ROOT; WARN-level nên over-catch claude-artifact chấp nhận được (under-catch = failure mode).
- **Multi-dim**: Functional (đúng 2 check spec) · Security (cảnh báo bypass tại cửa, passive —
  không kill, không đọc nội dung) · Backward-compat (format dòng cũ nguyên vẹn, exit code không
  đổi khi chỉ WARN) · Maintenance (bash thuần theo pattern kit, python không cần) · Operational
  (fail-open khi thiếu tool; escape WAKII_GUARD_OFF) · Cross-platform (ps/lsof macOS+Linux;
  Windows → skip có ghi chú). Skip: Data/UX/Business — bin CLI thuần, không schema/UI/ROI.

## Tasks

- [x] T1 — TDD RED: thêm tests F6-F11 vào story-preflight-tests.mjs (synthetic agent process
      `exec -a claude-sim …`, fixture "primary" + "worktree" qua PREFLIGHT_WORKSPACES_DIR;
      bypass có/không; escape WAKII_GUARD_OFF; strict PREFLIGHT_STRICT_AGENT) — chạy thấy RED.
      ✅ RED 24 PASS / 7 FAIL (7 assert mới fail đúng thiết kế, F1-F5 nguyên vẹn).
      Bài học: `bash -c 'sleep N'` bị exec-optimize (mất argv[0]) — synthetic agent phải dùng
      compound command (`sleep 30 || true`) để bash ở lại giữ tên; `setsid` không có trên macOS.
- [x] T2 — GREEN: implement check 7 (primary-agent-alive) + check 8 (permission-bypass-detected)
      trong kit/bin/story-preflight — WARN mặc định, FAIL chỉ qua PREFLIGHT_STRICT_AGENT=1,
      escape WAKII_GUARD_OFF=1, fail-open khi ps/lsof thiếu/lỗi, Windows → skip ghi chú,
      header usage + mô tả kit.json/INDEX.md cập nhật 1 dòng — suite story-preflight GREEN.
      ✅ GREEN 31/31 PASS (`node tests/story-preflight-tests.mjs` exit 0). INDEX.md giữ nguyên
      (dòng bảng vẫn đúng); chỉ kit.json description cập nhật.
- [x] T3 — Rolling review: code-reviewer ĐỘC LẬP trên diff nhóm (T1+T2) → verdict
      evidence/local4-kit-launch-safety/sf-3/review-1.md (commit `git add -f`); fix P0/P1 nếu có.
      ✅ APPROVED — 0 P0/P1, 4 P2; fix P2-1 (HOME-unset fail-open) + P2-3 + P2-4 ở commit
      `1fb52f7389` (rehash kèm), P2-2 giữ nguyên có lý do. Reviewer deterministic: shellcheck
      0 warning code mới, suite 31/31 tại commit, ps-truncation probe OK.
- [x] T4 — Fence kit: chmod 755 bin vừa sửa TRƯỚC → computeKitHash → kit/kit.json kitHash →
      fingerprint bundled-plugins.json (verify-packaged-plugin-resources.cjs) → verify OK →
      commit --no-verify → suite node tests/*.mjs toàn bộ trong plugin dir.
      ✅ fence 2 vòng: `f1e0ecdd5d` (kithash b5659c8ae1350492) + `1fb52f7389` (264f995a79c85d1a,
      fingerprint 891e6e44…). Verify-packaged OK 2 plugins; kit-verify-manifest 30/30.
      Phát hiện ngoài scope: workfront-driver exec bit 644 pre-existing → `8e4d064878`.
      Full suite 41/42 (story-coordinator-pass C25 known-red 03/10 — Windows-sim, pre-existing).
- [x] T5 — CHECK 4 Rule 0 (CLI-equivalent): chạy story-preflight THẬT vừa sửa, PASSIVE
      (ps/lsof không kill): (a) sandbox primary fixture có agent sống → cảnh báo đúng pid;
      (b) fixture sạch → không cảnh báo ảo; (c) worktree fixture → im lặng; (d) primary thật
      (ILEC nếu có / wakii-main) → chạy không vỡ. Output lưu evidence/sandbox-run.txt.
      ✅ Điểm nhấn: primary THẬT ~/Desktop/projects/orca — WARN 4 pid claude sống thật +
      BYPASS 2 pid --dangerously-skip-permissions (32418, 66931) — đúng vi phạm LUẬT
      human-in-the-loop 24/09. Story worktree này → im lặng đúng. Evidence: sandbox-run.txt.
- [ ] T6 — Commit cuối sạch + push `wakii-dev HEAD:refs/heads/sf-3-story-preflight-check` +
      `~/.claude/bin/story-verify sf-3` resolve theo mindmap local4-kit-launch-safety.wakii.

## ACCEPTANCE (từ pack)

1. Preflight trên primary có agent sống → cảnh báo đúng pid đang sống; checkout sạch → không ảo.
2. Output mới không phá consumer hiện có (F1-F5 nguyên vẹn).
3. Suite kit xanh.

## Boundary

KHÔNG tự kill; KHÔNG block cứng mặc định; KHÔNG đụng story-guard-* hooks; KHÔNG commit
docs/superpowers/contexts/**; cross-platform macOS+Linux, Windows skip ghi chú.
