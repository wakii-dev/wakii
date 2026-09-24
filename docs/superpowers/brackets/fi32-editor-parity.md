# Story: FI-32 — clone-vs-vscode phase 3: editor parity

Destination: feature/clone-vs-vscode

## SF-1 Editor parity: suggest/options + minimap stamp + breadcrumbs + quick outline
Tier: 0
linear: FI-33
Design: none
What: mở file ts/js gõ code thấy suggestions (word-based + snippets) mà không xuất hiện squiggle nào; breadcrumb bar trên editor hiển thị path, click segment cấp trên reveal file trong explorer đúng worktree; Shift+Alt+F format JSON, undo được, draft giữ nguyên; minimap bật mặc định cho cả profile cũ (one-shot stamp migration); Settings → Editor có các toggle bracket colorization/smooth caret/renderWhitespace; Ctrl+Shift+O trong editor mở quick outline còn ngoài editor vẫn mở markdown preview như cũ. Renderer-only, 0 file main-process.
Depends on: —
Tasks: probe-cluster-symbols-suggest-format / suggest-options-explicit-enum / bracket-smoothcaret-whitespace-settings / minimap-default-on-stamp-migration-two-stores / format-reuse-bridge-verification / breadcrumb-bar-matrix-reveal / i18n-six-locales / quick-outline-chord-policy-gated / verify-gates-electron-walkthrough

Context pack: docs/superpowers/contexts/sf-1-editor-parity.md
Spec: docs/superpowers/specs/2026-09-24-editor-parity-spec.md (rev.3 — phase0 + spec-critic ×2 + plan-critic)
Ghi chú: nhánh đích = feature/clone-vs-vscode (deviation có chủ đích); merge worker → feature theo merge-playbook, post-merge sync fi28-coordinator bằng reset --hard (KHÔNG dest-sync).
