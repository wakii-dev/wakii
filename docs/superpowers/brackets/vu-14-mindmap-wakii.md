# Story: VU-14 — mindmap.wakii — story mindmap file + Wakii viewer
Destination: story/vu-14-mindmap-wakii

Spec: docs/superpowers/specs/2026-09-27-mindmap-wakii-viewer-design.md (51e4efac5a).
Phase checkpoint: tier 0+1 xong = shippable (file sinh + mở được); SF-4 = convergence QA.

## SF-1 Schema + sinh file .wakii
Tier: 0
linear:
What: chạy story-launch ở story có bracket → file .wakii xuất hiện với đủ 3 lớp (tiến độ epic/sf/task + logic steps flows-to + impact area/file từ touch map và story-impact); chạy lại với nguồn không đổi → file byte-identical; context pack thiếu touch map → vẫn ra file lớp tiến độ, không vỡ; story-verify giữ thuần-đọc
Depends on: —
Tasks: schema-v1-decoder / story-mindmap-bin / context-pack-parse / story-impact-fan-in / lifecycle-trigger-wrappers / idempotent-atomic-write / kit-manifest-provides-rehash / gitignore-mindmaps-allowlist / golden-fixture-tests

## SF-2 App mở file .wakii
Tier: 1
linear:
What: double-click file .wakii trên mac (dmg) và Windows (NSIS) và Linux deb/rpm → app Wakii nhận file qua file association, decode schema v1; file hỏng/schema lạ → bề mặt lỗi rõ ràng (error payload) thay vì im lặng; app cũ không đụng event của đuôi lạ; mở cùng file lần 2 → refresh tab theo content-hash chứ không mở trùng
Depends on: SF-1
Tasks: wakii-open-capture-state / ipc-pull-push-contract / preload-bridge / mac-association-owner / windows-nsis-progid-default / linux-mime-deb-rpm / packaging-config-asserts / authorize-external-path

## SF-3 Viewer mindmap tương tác
Tier: 1
linear:
Design: mock-prototype
What: mở file .wakii → mindmap hiển thị trong editor tab floating workspace với 2 chế độ xem toggle (Tiến độ / Logic & Impact); click node → side panel chi tiết (state, linear link, evidence summary); hover → sáng node + hàng xóm; pan/zoom; file schema hỏng → error state rõ ràng; màu chỉ dùng token hệ design
Depends on: SF-1
Tasks: editor-tab-surface / graph-layout-hierarchy / progress-view / logic-impact-view / node-detail-panel / decode-error-state / pan-zoom-filter / design-token-colors

## SF-4 Convergence round-trip + docs
Tier: 2
linear:
What: round-trip đầu-cuối tự động — story thật (fixture) sinh file → app nhận → viewer render đúng node/edge/state ở cả 2 chế độ; manual checklist double-click 3 OS chạy khi release build; docs reference format .wakii gồm limitation AppImage (drag-drop) và phân biệt với thư mục runtime /.wakii/
Depends on: SF-2, SF-3
Tasks: e2e-roundtrip-fixture / render-golden-tests / manual-checklist-3os / docs-wakii-format / appimage-limitation-note / final-verify
