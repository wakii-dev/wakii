# Phase 0 — Impact analysis — LOCAL-4 sf-3 story-preflight

Ngày: 2026-10-04 · Executor: task-executor SF-3 · Task orchestration: task_b4f5645b4cba
Nguồn: docs/superpowers/contexts/sf-3.md (pack CHÍNH THỨC, đã kiểm dòng đầu) +
mindmap local4-kit-launch-safety.wakii node sf-3.

## Problem framing
Đêm 03/10: pid 72180 chạy `claude --dangerously-skip-permissions` (cwd=master ILEC) +
5-6 session trên primary — không công cụ nào cảnh báo tại cửa. `kit/bin/story-preflight`
(110 dòng) chỉ có 6 check: branch / tree / server / DB / node_modules / .env.

## Touch map (đã verify trên code, không đoán)
- `kit/bin/story-preflight` — thêm check 7 (primary-agent-alive) + 8 (permission-bypass)
- `tests/story-preflight-tests.mjs` — F6-F11 (hermetic, synthetic claude-sim)
- `kit/kit.json` — description entry story-preflight (1 dòng) + kitHash rehash
- `resources/plugins/launch/bundled-plugins.json` — fingerprint rehash (1 dòng)
- Phát hiện ngoài scope: `workfront-driver` exec bit 644 (pre-existing từ commit
  driver trước CREATE) — chmod 755 + update-index --chmod=+x để suite xanh.

## Second-order effects
- Consumer parse: F1-F5 assert chuỗi check cũ — check mới CHỈ thêm dòng; không tool
  nào parse số-dòng-cố định (grep toàn plugin: chỉ tests + SKILL.md docs).
- Perf: +1 ps +≤2 lsof batch mỗi preflight — chạy tại cửa, chấp nhận.
- False-positive: grep /claude/ khống chế bằng loại helper (awk|grep|lsof|story-preflight)
  + scope cwd trong ROOT_P (physical path, trailing-slash case) — over-catch claude-artifact
  ở mức WARN chấp nhận được; under-catch = failure mode của SF này.
- exec-optimization bash: synthetic process phải dùng compound command (`sleep N || true`)
  nếu không argv[0] claude-sim biến mất khỏi ps.

## Multi-dimensional (in-scope)
- Functional: 2 check đúng spec — demo (a2)/(d)/(f) WARN đúng pid.
- Security: passive-only (ps/lsof), không kill, không đọc nội dung file — chỉ meta-process.
- Backward-compat: format dòng cũ nguyên vẹn; exit 0 khi chỉ WARN; FAIL chỉ qua flag.
- Maintenance: bash thuần theo pattern kit; helper _pid_cwd 1 chỗ.
- Operational: fail-open khi thiếu ps/lsof/quyền; escape WAKII_GUARD_OFF=1 có ghi nhận.
- Cross-platform: macOS+Linux (lsof/ps); Windows → skip ghi chú (không lsof).
- Skip có lý do: Data/UX/Business — bin CLI thuần, không schema/UI/ROI.
