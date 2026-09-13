# Story: FI-458 — Bracket phân tán đa máy trong mạng local (distributed bracket execution)
Destination: story/fi458-distributed-bracket

## SF-1 Claim core + distributed config (Phase 1/2 — shippable: launch an toàn 1 máy, sẵn sàng đa máy)
Tier: 0
linear: FI-459
Design: none
What: (repo nguồn: ~/Desktop/projects/story-team-kit) 2 máy chạy story-launch cùng lúc trên 1 bracket không còn trùng SF — claim = label Linear claimed/<machine-id> (mutex LWW) + claim comment renew chủ động; git-guard: push nhánh SF lên remote NGAY lúc launch (serialization point atomic P0 — áp tầng vendored orca; repo kit remote fail = known gap, mixed-version test SF-4 phủ); fail-closed chỉ khi enabled; tắt = zero-diff
Depends on: —
Tasks: pre-flight-launcher-dirty-clean-va-pr47-merge-truoc-T1 / gitignore-negation-brackets-contexts / dest-contract-wakii-dev-push-fetch-race / distributed-config-schema-fail-open / claim-storage-label-plus-comment-renew-voi---list-claims-json-export / linear-mutation-atomicity-verify-partial-claim-label-race / claim-takeover-stale-2x-ttl-revoke-comment / git-guard-push-sf-branch-sf-n-slug-at-launch-vendored-tier / fail-closed-inversion-zero-diff-test-5-mat / machineid-sanitize-graphql / heartbeat-renew-agent-liveness-gated-linear-server-ts / version-bump-2.12.0-sync-kit-marker-checklist / race-harness-2-process / linear-offline-fail-closed-error-classification

## SF-2 Remote-safe verify (Phase 1/2)
Tier: 1
linear: FI-460
Design: none
What: story-verify B4 và resume thấy dest đã push từ máy khác (fetch remote trước merge-base, gated sau distributed.enabled — single-machine zero-diff). Ghi chú: --host passthrough đã tách follow-up (dead code trong Direction C). Repo nguồn: ~/Desktop/projects/story-team-kit; regen vendored tập trung ở SF-4
Depends on: SF-1
Tasks: b4-fetch-gated-after-enabled / b4-zero-diff-regression / fetch-fail-stale-fallback / resume-dest-fetch / resume-dest-fetch-e2e

## SF-3 Panel ⚙ Machines read-only + worker ops (Phase 1/2)
Tier: 1
linear: FI-461
Design: none
What: (repo nguồn: ~/Desktop/projects/local.superpowers-launcher — pre-condition: launcher repo sạch/đã land, xem pre-flight SF-1; PR #47 merge trước T1) plugin hỗ trợ CẢ HAI mode cùng 1 build, chuyển bằng config runtime: OFF (1 máy — mặc định, zero-diff: claims polling + targeting OFF, section hiển thị collapsed với CTA bật) và ON (đa máy: machine-id + claims bảng derive Linear+git + stale highlight + launch targeting); fail-closed phân loại lỗi (thiếu key ≠ mạng chết); KHÔNG hứa live progress chéo máy; regen vendored tập trung ở SF-4
Depends on: SF-1
Tasks: distributed-config-op-get-set / claims-derive-tu-linear-git / machines-section-ui-collapsed-cta / mode-switch-runtime-off-on / stale-claim-highlight / zero-local-storage-assumption / fail-closed-error-classification

## SF-4 Claim-protocol infra — 2-machine simulation (Phase 2/2 — release checkpoint)
Tier: 2
linear: FI-462
Design: none
What: (regen vendored orca TẬP TRUNG ở đây — T1 chỉ commit repo nguồn) **PRE: Phase 1 checkpoint — cut kit 2.12.0 + release TRƯỚC khi bắt đầu SF-4** (phased-release rule). Harness mô phỏng 2 máy là HẠ TẦNG bắt buộc (không phải QA once): race/takeover 2×TTL/git-guard worst-case/mixed kit-version/enabled-false regression 5 mặt đều green; cách ly Linear thật (bracket riêng + machine-id prefix sim-); STORY-COMPLETE derive từ Linear (sửa story-watchdog/story-verify); README distributed setup thuộc KIT REPO (prereqs per-machine: orca app + workspace + linear-key + push quyền + kit sync)
Depends on: SF-1, SF-2, SF-3
Tasks: phase1-checkpoint-cut-2.12.0 / sim-harness-2-clone-linear-isolated-sim-prefix / takeover-2x-ttl-e2e / git-guard-worst-case-e2e / mixed-kit-version-test / enabled-false-regression-5-mat / story-complete-derive-linear-watchdog-verify / regen-bundled-vendored-orca-bundled-hash / readme-distributed-setup-kit-repo
