# Story: FI-305 — Superpowers on Android — story workflow từ điện thoại (view + gates + notifications)
Destination: story/fi305-superpowers-android

## SF-1 Desktop RPC foundation + gate notifications
Tier: 0
linear:
Design: none
What: client mobile paired gọi được RPC để list stories (group per worktree), xem story detail kèm gates, và resolve gate pending; gate mở/đóng trên desktop đẩy notification mang đủ routing fields (gateId/storyId nullable/worktreeId/title); contract types (§3b spec) + fixture bracket sanitized commit vào location mobile import được — mobile code chống contract thật, không chống paper
Depends on: —
Tasks: bracket-parse-shared-module / story-list-method / story-detail-method / gate-resolve-method-pending-guard / mobile-allowlist-entries-enforcement-test / notification-source-union-routing-payload / gate-transition-store-hooks / gate-story-derivation-db-probe / wire-compat-doc-update / fixture-parity-test-vs-plugin / contract-types-shared-location

## SF-2 Mobile story screens + Linear status
Tier: 1
linear:
Design: none
What: mở app là thấy story list group theo worktree (parse error/unknown không crash), vào story thấy SF tiers + tiến độ + status; màn render từ cache ngay và tự refresh sau reconnect; SF status lấy từ Linear sub-issue khi connect, 'unknown' khi không
Depends on: SF-1
Tasks: contract-conformance-smoke-test / host-scoped-story-routes-boundary-test / story-list-data-module-cache-reconnect / story-detail-data-module / story-list-ui-group-worktree / story-detail-ui-tiers-progress / linear-subissue-status-read-desktop / strings-inline-convention-probe / stale-malformed-handling / responsive-dark-pass

## SF-3 Gate resolve UX + notification handling
Tier: 1
linear:
Design: none
What: phone thấy pending gates (kể cả nhóm "khác" không map worktree), resolve được qua choice buttons (theo options) hoặc free-text + confirm dialog; gate-open/gate-closed events giữ pending list tươi kể cả qua reconnect; mọi lỗi resolve (đã resolved/timeout/offline) refresh state sạch, re-tap an toàn không side effect
Depends on: SF-1
Tasks: contract-conformance-smoke-test / pending-gates-surface-other-group / resolve-flow-options-freetext-confirm / resolve-error-states-safe-retry / gate-events-pending-list-handling / reconnect-catchup-verification / resolve-unit-tests

## SF-4 Convergence QA + deep-link wiring
Tier: 2
linear:
Design: none
What: flow đầu-cuối chạy thật trên Android: thấy story → gate mở → notification ≤5s → tap về đúng màn story/gate → resolve → agent trong terminal tiếp tục; desktop restart giữa chừng phone không trắng màn (cache + refresh ≤10s); old-build hiển thị notification lạ an toàn; security review surface mới sạch
Depends on: SF-2, SF-3
Tasks: deep-link-route-wiring / device-session-e2e-serialized / security-review-allowlist-guard / wire-compat-regression-unit-test / multi-root-multi-host-assertion / strings-audit / docs-update-mobile-notifications
