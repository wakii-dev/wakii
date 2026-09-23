# Context pack — SF-1 clone-vs-vscode: Search Replace/Replace All + toolbar New buttons

Spec nguồn: `docs/superpowers/specs/2026-09-23-clone-vs-vscode-replace-spec.md` (rev.3 — qua phase0 + spec-critic + plan-critic). Đọc spec TRƯỚC; pack này là slice vận hành.

## Spec slice

3 việc, nothing else:
1. **Toolbar New File/New Folder** — wire `startNew(type, parentPath=selection||root, depth)` vào `FileExplorerToolbar.tsx` (flow inline-input + undo có sẵn).
2. **Replace + Replace All** — engine re-derive match từ content tươi (KHÔNG tin match list — git-grep whole-line/fabricated submatch/byte-offset), runner sequential với TOCTOU stat-recheck + skip-dirty + stop-taxonomy (transport=stop, content=continue) + cap 200/chặn truncated + block-up-front regex JS-invalid + preview dry-run + cancel (nút + unmount + đổi worktree) + Undo riêng của search panel (stat-recheck + skip + clear sau undo).
3. **Verify-first cluster** — CRLF/BOM, offset semantics, dirty-detect API → design notes vào task report (không sửa plan file giữa run).

## Touch map

Primary: `SearchQueryRow.tsx`, `useFileSearchPanel.ts`, store slice search (mới), `search-replace-engine.ts` + `search-replace-all-runner.ts` (mới — tên domain, không "helpers"), `FileExplorerToolbar.tsx`, preview modal (mới, dùng DiffViewer), runtime clients (chỉ dùng: `readRuntimeFileContent` @ runtime-file-read-client.ts:27, `writeRuntimeFile` @ runtime-file-mutation-client.ts:32, `statRuntimePath` @ runtime-file-metadata-client.ts:26, `recordSelfWrite` @ editor-self-write-registry.ts).
Regression candidates: file-explorer tests, search tests, keybindings tests (không đụng nhưng nằm cùng panel).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Toolbar 2 nút New → inline input → tạo + undo, local + SSH.
2. Replace → Replace All → preview dry-run (counts chính xác + top-10 diff) → confirm → thay trên đĩa; summary replaced/skipped-dirty/skipped-stale/error/unprocessed (sum == tổng — có test); Undo trong panel (double-undo no-op), cùng stat-recheck/skip.
3. Agent-conflict + dirty → skip có tên trong summary; CRLF/BOM roundtrip giữ nguyên EOL (test qua write thật).
4. Chặn: truncated >2000; >200 file; regex JS-invalid (+message).
5. Cancel: nút + đóng panel + đổi worktree → cancelRequested; file đã ghi giữ nguyên + summary.
6. Gates: vitest touched (ĐÚNG `--config config/vitest.config.ts`; bare vitest run = đỏ giả alias @/) + `pnpm tc` + `check:code-quality:changed` + `lint:design-system` + browser walkthrough ELECTRON protocol (ORCA_BACKGROUND_LAUNCH=1, CDP, cấm focus steal); SSH case: host configured → live verify; không → ghi "verified by construction" có lý do.

## Boundary

- KHÔNG main-process/IFilesystemProvider/wire contract; KHÔNG contracts C1-C4; KHÔNG cut/copy/paste; KHÔNG Batch-1 files ngoài scope.
- Sync freeze: coordinator không merge origin/wakii-dev vào feature branch trong run.
- Merge: worker → feature/clone-vs-vscode theo merge-playbook (merge-ngược + update-ref FULL refname + guards); branch đang checkout ở fi28-coordinator — KHÔNG worktree add thẳng; KHÔNG dest-sync/branch -f lên feature branch.
- Scope change → REQUIREMENT-GAP comment epic + cập nhật bracket; design notes → task report.

## Run protocol

- Mỗi task: atomic commit + tick plan. Snapshot merge khuyến nghị sau tier (3,4,5).
- ELECTRON protocol cho mọi browser check.
- RUN-COMPLETE (plain list): reviewer độc lập (OUTBOX) → gates 1-4 → merge playbook → hash comment → story-post-merge → Linear Done.
