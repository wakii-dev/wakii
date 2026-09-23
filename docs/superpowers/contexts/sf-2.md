# SF-2 Context Pack — Explorer VSCode-parity
> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-21-editor-vscode-parity-design.md`. Bracket: `docs/superpowers/brackets/fi478-editor-vscode-parity.md`. Design: mock-prototype (designer phase TRƯỚC dev). Reference behavior: `~/Desktop/projects/vscode/src/vs/workbench/contrib/files/browser/views/` (`explorerView.ts`, `explorerViewer.ts`, `openEditorsView.ts`) — clone behavior, không vendor code.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)
1. **Reveal active file**: mở file ở editor (bất kỳ đường nào) → cây explorer auto-reveal + scroll tới file, ĐÚNG 1 LẦN (debounce 150ms). Verify: switch worktree 5 lần liên tiếp → 0 reveal event cho file worktree cũ. Setting toggle on/off.
2. **Open Editors section**: collapsible phía trên cây, liệt kê tab đang mở của worktree hiện tại; click focus tab; middle-click close; dirty indicator.
3. Indentation guides trong cây (VSCode-parity).
4. Keyboard nav: ↑↓ di chuyển, ←→ collapse/expand, Enter mở, F2 rename inline, Delete xóa, type-ahead (gõ chữ nhảy tới entry).
5. Context menu thêm: Reveal in Finder (local) / mở terminal tại thư mục. (Copy path đã có — giữ.)
6. New file/folder inline: giữ flow hiện có, chuẩn hóa focus/commit/cancel như VSCode (Enter commit, Esc cancel, auto-edit-name mới tạo).
7. Delete: local (kể cả folder workspace) → OS trash (đã có `shell.trashItem` + WSL fallback); **remote SSH host → xóa VĨNH VIỄN sau confirm dialog nói rõ "xóa vĩnh viễn (remote không có thùng rác)"** [QĐ-8].
8. Compact folders (folder 1-con gộp node) — setting on/off.
9. Settings: **section RIÊNG `ExplorerSettingsSection`** (KHÔNG thả vào GeneralEditorSettingsSection — tránh đụng chạm SF-4): auto-reveal, compact folders.
10. Lệnh mới register vào palette qua contract SF-1 (`PaletteCommandEntry`, source 'core').

## Touch map (files SF-N tạo/sở hữu)
- Sở hữu: `src/renderer/src/components/right-sidebar/FileExplorer*.tsx`, `file-explorer-row-context-menu.tsx`, `file-explorer-inline-input-row.tsx`, `useFileExplorerKeys.ts`, `useFileExplorerMoveDrop.ts`, `use-file-explorer-name-filter.ts`, explorer slice action files MỚI (1 concern/file theo pattern `store/slices/editor/actions/*`), `ExplorerSettingsSection` mới.
- Append-only 2 dòng mỗi field (đụng chung, CẨN THẬN merge): `src/renderer/src/store/slices/editor/create-editor-slice.ts` (combiner), `store/slices/editor/types/editor-slice.ts`, `src/shared/global-settings-types.ts`, `src/main/persistence/applying-settings/settings-update.ts`, `src/main/persistence/loading-store/normalize-loaded-global-settings.ts`. Lưu ý: toggle explorer hiện có (gitignored/dotfiles) KHÔNG nằm trong global-settings — promote lên settings schema theo pattern SF-4 dùng.
- READ-ONLY: `EditorPanel*`/tab model (SF-4 sở hữu — đọc active-tab qua store thôi); `shared/tab-types.ts`; search panel files (SF-3).

## ACCEPTANCE (user-visible)
- Mở `src/App.tsx` từ QuickOpen → explorer cuộn tới và highlight `App.tsx` ngay, 1 lần.
- Open Editors hiện đúng tab đang mở; middle-click đóng; tab dirty có chấm.
- Bàn phím: ↓↑ đi lại, Enter mở file, F2 rename giữ focus trong cây, Delete xóa vào trash (local).
- Trên SSH worktree: xóa file → dialog "xóa vĩnh viễn", confirm mới mất.
- Folder workspace (non-git): toàn bộ flow trên chạy không lỗi.

## Boundary (KHÔNG làm)
- KHÔNG đụng search panel / results (SF-3), tab context menu / breadcrumbs / split (SF-4), palette modal (SF-1 — chỉ register entries).
- KHÔNG đổi tab model shape (`shared/tab-types.ts`).
- KHÔNG tự dựng i18n scaffolding — add entries vào catalog SF-1.
- KHÔNG đổi hành vi drag-drop hiện có ngoài spec.
