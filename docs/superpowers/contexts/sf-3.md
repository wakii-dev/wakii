# SF-3 Context Pack — Search & Replace toàn workspace
> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-21-editor-vscode-parity-design.md`. Bracket: `docs/superpowers/brackets/fi478-editor-vscode-parity.md`. Design: none — extend `SearchResultsPane` hiện có theo STYLEGUIDE + pattern cmd-j/QuickOpen. Reference behavior: `~/Desktop/projects/vscode/src/vs/workbench/contrib/search/browser/` (`searchView.ts`, `replace.ts`, `searchResultsView.ts`, `searchWidget.ts`, `patternInputWidget.ts`).

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)
1. Content-search IPC mới (rg content mode, sibling của `filesystem-search-file-paths.ts` — WSL-aware, authorized-path, rg-missing fallback như local). RPC: `files.*` hiện có **18 methods** trong `src/main/runtime/rpc/methods/files.ts` (gồm `files.search`, `files.searchPaths` — enumerate thật khi implement); streaming qua `defineStreamingMethod` nếu cần; **opcode mới → capability-negotiate** (remote-wire-compat).
2. Results tree group-theo-file + highlight match + **cap: per-file 50 matches, tổng 200 file / 1000 matches, chỉ báo truncated** [QĐ-11].
3. Toggles case/word/regex (VSCode-parity) + preserve-case toggle cho replace.
4. Replace field + per-match/per-file/Replace All (confirm dialog).
5. Open-dirty reconciliation: file đang mở có dirty draft → loại khỏi replace-all + liệt kê cảnh báo; file mở sạch → apply qua editor write pipeline.
6. **Batch-write service — TÁCH 2 TASK, core land TRƯỚC UI polish (SF-5 phụ thuộc)**:
   - Core: nhận `{path,newContent}[]`, **byte-preserve** (chỉ span match đổi, EOL/BOM/encoding giữ nguyên), **self-write suppression qua `recordSelfWrite`** (`editor-self-write-registry.ts`) + external-watch suppression — KHÔNG ghi fs thuần.
   - Semantics: **stale-check** (re-stat so `(size,mtime)` snapshot lúc search, mismatch → SKIP + báo cáo "đổi ngoài, thử lại"), **partial failure** fail-stop + báo cáo 3 lớp (đã ghi / skip / chưa đụng), SSH verdict `live/unverifiable/exited` — response mất = unverifiable, không tự báo failed-when-maybe-applied.
7. Remote thiếu rg → search + replace disable trên host đó + guidance cài rg (pattern QuickOpen) [QĐ-7]. KHÔNG fallback fetch-content-search-local.
8. Keyboard: Enter mở result, F4 next (binding SF-3 sở hữu trong `definitions-core-3.ts` — append-only).
9. Search history (recent queries persist).
10. **Fixture pinned cho verify**: script tạo sandbox 5 file `.ts` chứa symbol `editorVscodeProbe` (tổng 7 matches); whole-word replace → `editorVscodeProbeReplaced`; diff 5 file pinned trong pack (append khi implement).
11. Folder workspace: không có .gitignore → search tất cả (hidden theo toggle hiện có) — chủ ý, ghi trong UI help.

## Touch map (files SF-N tạo/sở hữu)
- Sở hữu: `SearchResultsPane.tsx`, `useFileSearchPanel.ts`, `SearchQueryRow.tsx`, `SearchResultItems.tsx`, `file-search-include-pattern.ts`, `store/slices/editor/search/*` + `actions/file-search-actions.ts` (mở rộng), IPC mới `src/main/ipc/` (content search + batch write), batch-write service module mới, F4 entry `definitions-core-3.ts` (append).
- READ-ONLY (CONSUME — không sửa): `editor-self-write-registry.ts` (`recordSelfWrite`), `useEditorExternalWatch*`, `editor-autosave-controller.ts`, `rpc/methods/files.ts` (thêm method mới theo pattern — coordinate nếu cần catalog update).
- Append-only chung: `create-editor-slice.ts` + `editor-slice.ts` (2 dòng), `definitions-core-3.ts` (F4).

## ACCEPTANCE (user-visible)
- ⌘⇧F: gõ `editorVscodeProbe` → tree 5 file group, 7 match highlight; cap hoạt động trên repo lớn (truncated indicator).
- Bật whole-word + replace `editorVscodeProbeReplaced` → Replace All → confirm → đúng 7 chỗ đổi; file không mở ghi thẳng disk, file mở sạch cập nhật buffer, **zero giả-banner** (banner ExternalFileChangeBanner không hiện do self-write).
- File đang mở có edit chưa lưu → bị loại + cảnh báo liệt kê tên.
- Giữa search và Replace All, sửa 1 file ngoài → file đó SKIP + báo cáo "đổi ngoài, thử lại".
- SSH worktree: chạy trọn flow trên execution host; host thiếu rg → guidance, không treo.
- Folder workspace: search + replace chạy đầy đủ.

## Boundary (KHÔNG làm)
- KHÔNG đụng explorer rows/context menu (SF-2), breadcrumbs/tab chrome (SF-4), palette modal (SF-1).
- KHÔNG làm in-buffer replace cho file dirty (chỉ loại + cảnh báo — QĐ-4).
- KHÔNG normalize EOL khi ghi (byte-preserve là hard requirement).
- i18n: add entries thôi, không dựng infra.
