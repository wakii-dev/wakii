# Story: FI-34 — Native GitLens-lite: inline blame + hover

Destination: feature/clone-vs-vscode

## SF-1 GitLens-lite: git.blame dual-path + blame hook + toggle
Tier: 0
linear:
Design: none
What: mở file trong worktree → cursor lên dòng nào → cuối dòng hiện `author, relative-date · subject` muted; hover lên dòng bất kỳ → popup chi tiết commit (hash, author, date, subject) an toàn injection; worktree SSH hoạt động như local còn host cũ thì feature tự im lặng không báo lỗi; Settings → Editor có toggle Inline Blame (default ON); dòng chưa commit và dòng mới gõ hiện "You"; agent commit file đang mở → blame refresh đúng kể cả khi nội dung đĩa không đổi. Renderer + main git + runtime surface git.blame dual-path; không mobile/relay parity.
Depends on: —
Tasks: shared-blame-types-porcelain-parser / main-git-blame-provider-layer / runtime-rpc-wiring-relay-skip-boundary / desktop-ipc-preload-degrade-taxonomy / web-expose-verify-implement / blame-hook-cache-headchange-taxonomy / settings-i18n-strings / optin-prop-wiring-surfaces / verify-gates-electron-walkthrough / prepare-merge-report

Context pack: docs/superpowers/contexts/sf-1-gitlens-lite.md
Spec: docs/superpowers/specs/2026-09-25-gitlens-lite-spec.md (rev.3)
Ghi chú: nhánh đích = feature/clone-vs-vscode (deviation có chủ đích — batch clone work đang ở đó); merge worker → feature theo merge-playbook, post-merge sync fi28-coordinator bằng reset --hard (KHÔNG dest-sync). Real GitLens (GitLens/ESLint đầy đủ) thuộc embed epic openvscode-server — Direction B.
