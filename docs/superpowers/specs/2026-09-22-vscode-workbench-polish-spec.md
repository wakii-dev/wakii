# Spec: VS Code-grade workbench polish (story 1-SF)

Ngày: 2026-09-22 (rev.3 sau plan-critic) · Team: FI · Project: wakii · Nguồn: session audit 2026-09-22 + phase0-impact-analyst + spec-critic + plan-critic

## IDEA-BRIEF (8 chiều)

- **Task**: đóng 3 gap cuối cùng để right-sidebar + editor đạt chuẩn UX VS Code: màu icon theo loại file, sticky scroll, F2 rename.
- **Output**: thay đổi renderer-only trong desktop app (Electron). Không IPC mới, không main-process change, không đụng SSH boundary.
- **Users**: dev dùng wakii chạy agent + review code theo worktree.
- **Constraints**:
  - Giữ nguyên layout: right sidebar + activity bar + editor surface — chỉ thêm màu/setting/keybind.
  - Màu icon PHẢI qua design tokens trong `src/renderer/src/assets/main.css`; class áp qua LITERAL MAP (contract C1) — gate `check:code-quality:changed` cấm raw palette + computed className.
  - F2 PHẢI qua hệ thống keybindings tập trung; defaultBindings per-platform (darwin/linux/win32).
  - Setting additive (`settings?.key ?? default`) theo pattern `editorMinimapEnabled`.
  - Mọi browser verify theo Electron validation protocol: `ORCA_BACKGROUND_LAUNCH=1`, CDP screenshots, không focus steal, `$electron` skill — KHÔNG DOM-query thay visual.
- **Input**: phase0 analysis + spec-critic rev.2 + plan-critic rev.3 + user decisions (12 surfaces đồng bộ; token mới; story 1 SF).
- **Context**: 90% trải nghiệm "giống VS Code" đã ship. Monaco semantic validation CỐ Ý tắt (`monaco-setup.ts:44-60`) — KHÔNG đụng.
- **Success criteria** (đo được):
  1. Icon có màu phân biệt GIỮA CÁC NHÓM ở cả 12 render surfaces, cùng ánh xạ; simulator tab không tô; unknown → muted; folder/symlink không đổi.
  2. Settings → Editor toggle "Sticky scroll" (default OFF, persist); bật + file TS dài → scope header giữ chỗ khi cuộn; file không folding → không render gì (không phải bug); không leak vào diff/peek/automation editors.
  3. F2 rename hoạt động trong explorer; rebind qua keybindings UI được; Enter vẫn rename (bất đối xứng có chủ đích); F2 khi rename input đang mở không lồng.
  4. `pnpm tc` + `check:code-quality:changed` + suites liên quan xanh; browser walkthrough có CDP screenshots BEFORE/AFTER.
- **Out-of-scope**: LSP/semantic validation; breadcrumbs; replace-all; đổi minimap default; auto-reveal toggle; mobile; nhúng VS Code.

## Inventory: 12 render surfaces (verified)

`getFileTypeIcon` match theo TÊN FILE (extension table + name-based `.env`→FileLock, `dockerfile`→FileCog, `makefile`→FileTerminal) — hàm màu phải cover cả hai nhánh. 12 consumers: FileExplorerRow:112, QuickOpen:173, SearchResultItems:67, combined-diff-file-tree-row:98, ConflictReviewFileTree:168, RemoteFileBrowserEntryList:94, WorktreeSymlinksSection:184, **EditorFileTab:76** (guard simulator tab), **TabDragPreview:14**, **git-history-commit-files:32**, **uncommitted-entry-row:74**, **branch-entry-row:36**.

## Contract chốt

- **C1 — Icon-color contract**: giữ nguyên `getFileTypeIcon`. Classifier nội bộ dùng chung + export `getFileTypeIconColor(fileName): GroupKey`. Class màu áp qua **literal map** `Record<GroupKey, 'text-<token>'>` — class literals đầy đủ trong bảng (Tailwind v4 scanner bắt literals; CẤM hàm trả chuỗi class computed rồi nhét `className`). 12/12 call sites adopt trong SF này.
- **C2 — Mapping nhóm → màu**: bảng 9 nhóm như rev.2 (Code TS/JS, Code khác, Data/Config, Markup/Doc, Web/Style, Shell, Binary/Build, Asset, Name-based). Unknown → `text-muted-foreground`; folder + symlink không đổi. Token names chính thức chốt ở task 1; **phương pháp contrast**: tính ratio cho cả light/dark, ghi số liệu vào PR description (`lint:design-system` chỉ là report, không phải gate).
- **C3 — F2 keybinding contract**: action id `fileExplorer.rename`, scope `'fileExplorer'`, `allowBareKeybindings: true` (precedent `fileExplorer.delete` darwin); default per-platform F2 trên cả 3 OS; **mac fn-key limitation ghi vào `title` của action** (vd "Rename file (F2)") — `KeybindingDefinition` không có field `description`, ShortcutsPane chỉ render `.title` (types.ts:144-155, ShortcutsPane.tsx:195) — KHÔNG thêm field/UI mới (scope creep). Enter giữ hardcoded (bất đối xứng có chủ đích + test case).
- **C4 — Precedence màu**: icon giữ màu loại file; git statusColor giữ trên filename text — có test assertion riêng (icon class ≠ status color element).

## SF-1 — Workbench polish (Tier 0, 1 executor, sequential)

**What (demo đầu-cuối):** explorer tree + tab bar + QuickOpen + search results + SCM rows hiện icon file có màu phân biệt theo loại; bật Settings→Editor→Sticky scroll rồi cuộn file TS dài thấy scope header giữ chỗ; F2 trên file trong explorer đổi tên được.

**Tasks (9 — deps ngầm: 1→2→(3,4)→5; 6→7; mọi task: atomic commit + tick plan ngay khi xong):**

1. **Color tokens** — định nghĩa tokens 9 nhóm trong `main.css` (light+dark), áp C2; exit: tokens tồn tại + contrast ratios tính cho cả 2 theme, số liệu ghi trong PR.
2. **Classifier + `getFileTypeIconColor`** — theo C1 literal-map pattern; exit: hàm export + unit test mapping (extension, name-based, unknown→muted).
3. **Áp màu 6 surfaces chính** — explorer row, QuickOpen, search results, combined-diff tree, conflict tree, remote browser; exit: 6 surfaces hiển thị màu đúng map, không computed class.
4. **Áp màu 6 surfaces còn lại** — settings symlinks, EditorFileTab (guard simulator tab), TabDragPreview, git-history-commit-files, uncommitted-entry-row, branch-entry-row; exit: 6 surfaces + guard test simulator.
5. **Tests màu** — `file-type-icons.test.ts` mở rộng + surface adoption + assertion C4 (icon class ≠ status color element); exit: suites xanh.
6. **Probe stickyScroll** — verify option trên monaco 0.55; ENUMERATE quyết định cho cả 4 option builders: file editor (`MonacoEditor.tsx`), diff (`DiffEditor` sub-editors), peek (`monaco-peek-preview-options.ts:8` đã pin false), automation (`automation-editor-prompt-options.ts:37` đã pin false). Kết quả ternary: (a) file-editor-only OK → tiếp 7; (b) leak mặc định → 7 kèm pin `stickyScroll.enabled:false` cho diff sub-editors; (c) option hỏng → drop 6-7, comment epic + cập nhật bracket (không tự improvising).
7. **Setting + wire sticky scroll** — `editorStickyScroll` additive default OFF + toggle GeneralEditorSettingsSection + wire theo kết quả probe; exit: toggle persist, file TS dài giữ scope header, diff editor không đổi hành vi.
8. **F2 end-to-end** — definition theo C3 + wire `useFileExplorerKeys` + tests (F2 rename, F2 khi rename input mở, rebind không phá Enter, Enter vẫn chạy); exit: F2 rename chạy được + xuất hiện ShortcutsPane với default per-platform + conflict scan sạch.
9. **Verify + walkthrough** — `pnpm tc`, `check:code-quality:changed`, suites liên quan; browser walkthrough THEO ELECTRON PROTOCOL (`ORCA_BACKGROUND_LAUNCH=1`, không focus steal): CDP screenshots BEFORE/AFTER cho 4 success criteria; exit: screenshots + gates xanh.

**RUN-COMPLETE CHECKLIST** (plain list — KHÔNG tick, trạng thái ghi Linear comment; không phải part của task checkboxes):
1. Code-reviewer độc lập review diff trước merge.
2. Gates: story-preflight → story-diff-review → story-test → story-snapshot-env.
3. Merge theo `references/merge-playbook.md` (merge PARENT vào sf-branch trước + update-ref full refname + ancestor guards — KHÔNG naive merge).
4. Comment merge hash lên sub-issue → story-post-merge gate → Linear Done (coordinator).

**ACCEPTANCE** = 4 Success criteria.

**Boundary:** không sửa main-process/IPC/wire; không đụng `monaco-setup.ts`; không đổi keybinding hiện có; không đổi minimap default; không đổi return shape `getFileTypeIcon`; scope change (vd nhánh (c) probe) PHẢI comment epic + cập nhật bracket.

## Rủi ro & unknowns

1. Token màu mới + contrast: phương pháp đã chốt (C2, tính tay ghi PR).
2. F2 mac fn-key: limitation vào `title` (C3) — không chờ máy mac.
3. stickyScroll: ternary contingency + enumerate 4 builders (task 6) — rủi ro thật là leak-default, không phải option thiếu.
4. 12 call sites + literal-map: typecheck + quality gate bắt vi phạm; simulator guard là test bắt buộc.
