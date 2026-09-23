# Story: FI-30 — clone-vs-vscode: search replace parity

Destination: feature/clone-vs-vscode

## SF-1 Search Replace/Replace All + toolbar New buttons
Tier: 0
linear: FI-31
Design: none
What: mở explorer thấy 2 nút New File/New Folder trên toolbar tạo file/folder như VS Code (inline input, undo được); mở search panel bật ô Replace → Replace All → modal preview dry-run (counts chính xác + diff top-10) → confirm → toàn bộ match thay trên đĩa qua runtime file commands (local + SSH worktree), summary tường minh replaced/skipped-dirty/skipped-stale/error/unprocessed, nút Undo trong panel khôi phục các file đã ghi; agent đổi file giữa preview→confirm → skip có tên; chặn truncated/>200 file/regex JS-invalid; cancel bằng nút/đóng panel/đổi worktree.
Depends on: —
Tasks: dependency-gate-pin-base / verify-first-cluster-crlf-offset-dirty / replace-engine-rederive-unicode-eol / replace-state-store-slice / replace-field-ui-block-matrix / preview-modal-dryrun-diff / replace-all-runner-toctou-taxonomy-cancel / undo-panel-statrecheck-closure / toolbar-new-buttons-startnew / verify-gates-electron-walkthrough

Context pack: docs/superpowers/contexts/sf-1-clone-vs-vscode.md
Spec: docs/superpowers/specs/2026-09-23-clone-vs-vscode-replace-spec.md (rev.3)
Ghi chú: nhánh đích = feature/clone-vs-vscode (deviation có chủ đích khỏi story/<epic>-<slug> — feature branch đã chứa Batch 1 pre-work; merge worker về feature branch theo merge-playbook, KHÔNG dest-sync/branch -f).
