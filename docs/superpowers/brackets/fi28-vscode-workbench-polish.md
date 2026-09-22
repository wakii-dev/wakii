# Story: FI-28 — VS Code-grade workbench polish

Destination: story/fi28-vscode-workbench-polish

## SF-1 Workbench polish: icon colors + sticky scroll + F2 rename
Tier: 0
linear: FI-29
Design: none
What: mở app trên worktree có code đa định dạng, explorer tree + tab bar + QuickOpen + search results + SCM rows hiện icon file có màu phân biệt theo nhóm loại file (12 surfaces cùng ánh xạ, simulator tab không tô, unknown giữ muted); bật Settings→Editor→Sticky scroll rồi cuộn file TypeScript dài thấy scope header giữ chỗ (default OFF, không leak vào diff/peek/automation); bấm F2 trên file trong explorer đổi tên được (rebindable, Enter vẫn chạy). Renderer-only, không IPC mới.
Depends on: —
Tasks: color-tokens-light-dark-contrast / icon-color-classifier-literal-map / apply-colors-six-primary-surfaces / apply-colors-six-secondary-surfaces-simulator-guard / color-mapping-precedence-tests / sticky-scroll-probe-ternary-four-builders / sticky-scroll-setting-and-wire / f2-rename-keybinding-end-to-end / verify-gates-cdp-walkthrough

Context pack: docs/superpowers/contexts/sf-1-vscode-workbench-polish.md
Spec: docs/superpowers/specs/2026-09-22-vscode-workbench-polish-spec.md (rev.3)
