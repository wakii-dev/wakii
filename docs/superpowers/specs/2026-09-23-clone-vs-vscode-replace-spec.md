# Spec: clone-vs-vscode phase 2 — Search Replace/Replace All + toolbar New buttons

Ngày: 2026-09-23 (rev.3 sau plan-critic) · Team: FI · Project: wakii · Nhánh: feature/clone-vs-vscode
Nguồn: phase0 (re-scope) + spec-critic rev.2 + plan-critic rev.3 + user decisions 1a/2a/4a

## IDEA-BRIEF (8 chiều)

- **Task**: (1) nút New File/New Folder vào explorer toolbar (feature có sẵn — gap discoverability); (2) Replace + Replace All trong search panel — tính năng mới hoàn toàn.
- **Output**: renderer-only (Direction A). 0 file main-process, 0 đổi wire contract (`statRuntimePath` đã có — `runtime-file-metadata-client.ts:26`, shape `{size, isDirectory, mtime}`).
- **Users**: dev dùng wakii trên worktree local + SSH.
- **Constraints**:
  - Mọi đọc/ghi qua `readRuntimeFileContent`/`writeRuntimeFile` (SSH boundary — CẤM `window.api.fs.*`).
  - **ENGINE KHÔNG TIN MATCH LIST LƯU SẴN (P0)**: match positions re-derive từ content tươi bằng query gốc + semantics verified; stored `SearchMatch` chỉ làm candidate-file-list + số liệu hiển thị ban đầu. Lý do: git-grep fallback whole-line, fabricated submatch `{0,1}`, rg byte-offset ≠ JS index.
  - TOCTOU: stat-recheck (mtime/size) ngay trước mỗi write; lệch → skip + liệt kê.
  - Skip file dirty + liệt kê ("skipped (unsaved editor)").
  - Self-write stamp sau mỗi write VÀ cả undo. No-op replace (newContent === oldContent) → skip write (không churn mtime — mtime là baseline của undo).
  - Cap 200 file/lần; CHẶN Replace All khi `results.truncated === true`; per-file matchCount>=100 không cần guard riêng nhờ re-derive.
  - Regex: JS `RegExp` semantics, `$1` capture; **block-up-front** compile thử — JS-invalid (vd `[[:alpha:]]`) → chặn Replace + message dù search có kết quả (bounds hiện chỉ check 8KB; search error bị nuốt — premise cũ SAI).
  - caseSensitive/wholeWord: re-derive bằng JS; wholeWord dùng **Unicode-aware boundary** (`\p{L}\p{N}_` lookaround + `u` flag) thay `\b` ASCII; lệch còn lại tài liệu hóa.
  - Stop taxonomy: transport/SSH error = DỪNG ngay (4a); content-error per-file (read-too-large, binary, permission) = categorize + tiếp tục; summary cuối: replaced/skipped-dirty/skipped-stale/error/unprocessed (sum == tổng file — có test). KHÔNG cargo-cult `runBatchDeletion` (nó continue-on-fail).
  - Preview: modal counts + top-10 diff + confirm 1 lần (1a). **Counts = dry-run re-derive** (runner mode no-write) — chính xác, không "ước lượng". Empty replace term = xóa match, cho phép, preview hiện removal.
  - Coordination: Batch 1 đã merge (commit `f60d34f484` tại đỉnh feature branch — plan-critic verify); task 0 = git gate thuần pin base commit; worker worktree fork TỪ base commit được pin SAU gate.
- **Input**: phase0 + spec-critic + plan-critic + user decisions.
- **Context**: inline-input flow có sẵn (`startNew(type, parentPath, depth)` — 3 tham số); DiffViewer có sẵn; undo replace-all dùng closure RIÊNG của search panel (không đụng fileExplorerUndoRedo của explorer).
- **Success criteria**:
  1. Toolbar 2 nút New → inline input (parent = folder select, fallback root) → tạo + undo (local + SSH).
  2. Ô Replace → Replace All → preview (dry-run counts + top-10 diff) → confirm → thay trên đĩa; summary có test accounting; nút Undo trong search panel (sống theo store — mở lại panel vẫn thấy nếu lastReplaceOp còn; clear sau undo — double-undo không tác động).
  3. Agent-conflict: stat lệch → "skipped (changed on disk)"; dirty → "skipped (unsaved editor)"; CRLF/BOM roundtrip qua write thật giữ nguyên EOL.
  4. Chặn: truncated; >200 file; regex JS-invalid (+message).
  5. Cancel: nút Cancel hủy; **đóng panel/đổi worktree = cancelRequested (wiring + test thuộc task 6)**; file đã ghi giữ nguyên + summary.
  6. Gates: vitest touched (đúng config) + `pnpm tc` + `check:code-quality:changed` + `lint:design-system` (report) + browser walkthrough theo ELECTRON protocol.
- **Out-of-scope**: cut/copy/paste; replace vào dirty buffer; host-side RPC (Direction B); web renderer; mobile; Batch 1 items.

## Verify-first unknowns (3 — rút gọn sau 2 vòng critic)

1. `readRuntimeFileContent` preserve CRLF/BOM? — engine string-raw hay byte-safe.
2. Offset semantics `column`/`displayColumn` — chỉ ảnh preview highlight.
3. Dirty-detect API per path.

## SF-1 — Tier 0, 1 executor, sequential

**What (demo đầu-cuối):** explorer có 2 nút New tạo file/folder; search có ô Replace → Replace All → preview dry-run → confirm → thay trên đĩa (local + SSH worktree), summary tường minh, Undo trong panel.

**Tasks (10 — DAG tường minh: [0]→[1]→[2]→[3]→([4],[5],[6])→[7]→[9]; [8]: [0]→[8]→[9]):**

0. **Dependency gate (git thuần)**: `git merge-base --is-ancestor <batch1-commit> feature/clone-vs-vscode` pass + PIN base commit (`f60d34f484` hoặc mới hơn nếu Batch 1 push thêm) — worker worktree fork TỪ pin này. Exit: pinned SHA ghi vào plan.
1. **Verify-first cluster**: CRLF/BOM; offset semantics (preview highlight); dirty-detect API. Output: design notes ghi vào TASK REPORT (không sửa plan file giữa run).
2. **Replace engine `search-replace-engine.ts`** — re-derive toàn bộ match; flags caseSensitive/wholeWord-Unicode/regex-$1; EOL/BOM preserve theo [1]. Exit tests: literal, regex-$1, **caseSensitive on/off**, **multi-line match** (regex gặp `\n`), tiếng-VN multi-byte, wholeWord-Unicode vs `\b`, EOL-preserve, empty-replace-term (=xóa).
3. **Replace state store slice** — replaceQuery, replaceAllInProgress, cancelRequested, lastReplaceOp (chỉ 1 op gần nhất; clear sau undo). Exit: unit slice.
4. **Replace field UI** `SearchQueryRow.tsx` — toggle + input + nút Replace All (disabled: truncated/>200/regex-invalid+message/đang chạy); block-up-front compile. Exit: test disabled matrix.
5. **Preview modal** — **dry-run re-derive counts** (chính xác) + top-10 DiffViewer + confirm/cancel; empty-term hiện removal. Exit: counts khớp engine dry-run; cancel → 0 ghi.
6. **Replace-all runner `search-replace-all-runner.ts`** — sequential per file: read fresh → engine → stat-recheck → skip lệch/dirty → no-op skip → write → stamp; taxonomy transport=stop/content=continue; cancel check giữa mỗi file; **wiring: unmount panel + đổi worktree → cancelRequested (owner của criterion 5)**. Exit tests: TOCTOU-skip, dirty-skip, cap, truncated, stop-on-transport + unprocessed≠error, continue-on-content-error, **summary accounting (sum == tổng)**, empty-term end-to-end, **CRLF/BOM roundtrip qua writeRuntimeFile thật**, cancel-mid-run + cancel-on-unmount.
7. **Undo** — button trong search panel (state từ slice: còn lastReplaceOp → hiện, cả khi mở lại panel); cùng stat-recheck + skip-dirty + stamp + summary; clear lastReplaceOp sau undo (double-undo no-op); cancel giữa undo = cùng policy runner. Exit tests: undo full, undo sau fail-một-phần (chỉ restore phần đã ghi), undo-stat-recheck-skip, undo-dirty-skip, double-undo no-op.
8. **Toolbar New buttons** — `FileExplorerToolbar.tsx`, `startNew(type, parentPath=selection||root, depth)`; exit: tạo + undo, local + SSH.
9. **Verify + walkthrough** — vitest touched (đúng config; KHÔNG bare vitest run — alias @/) + `pnpm tc` + `check:code-quality:changed` + `lint:design-system` (report); **ELECTRON protocol**: `ORCA_BACKGROUND_LAUNCH=1`, hidden renderer, cấm `show()/focus()/bringToFront()`, qua `$electron` skill + Playwright CDP; walkthrough: toolbar create, replace-all confirm, agent-conflict giả lập touch giữa preview→confirm, cancel-mid-run, undo; **SSH case**: nếu máy có SSH host configured trong app → chạy replace-all + undo trên 1 SSH worktree; KHÔNG có host → ghi "SSH verified by construction (cùng runtime clients với create/rename đã SSH-proven) + unit SSH-guard pass" vào report (down-scope có lý do, không im lặng). Screenshots `.evidence-clone-vs/`.

**RUN-COMPLETE CHECKLIST** (plain — KHÔNG checkbox; FI-191): code-reviewer độc lập (OUTBOX verdict — coordinator ghi file) → gates 1-4 → **snapshot merge khuyến nghị sau tier (3,4,5)** → merge worker→feature/clone-vs-vscode theo merge-playbook (merge-ngược + update-ref FULL refname + 2 guards; `feature/clone-vs-vscode` đang checkout ở fi28-coordinator — KHÔNG `git worktree add` thẳng branch này; KHÔNG áp dest-sync/`branch -f` lên feature branch — nó đã diverge từ wakii-dev, reset = mất Batch 1) → comment hash lên sub-issue → story-post-merge → Linear Done. **Sync freeze**: coordinator KHÔNG merge origin/wakii-dev vào feature branch trong lúc run.

**ACCEPTANCE** = 6 Success criteria.

**Boundary:** không main-process/IFilesystemProvider/wire; không contracts C1-C4; không cut/copy/paste; scope change → REQUIREMENT-GAP comment epic + cập nhật bracket.

## Rủi ro & unknowns

1. TOCTOU residual (stat-recheck thu hẹp, không zero) — tài liệu trong summary.
2. wholeWord Unicode tự viết — test VN bắt lỗi.
3. SSH rớt — stop + summary; unprocessed ≠ error.
4. Preview top-10 — còn lại số liệu.
