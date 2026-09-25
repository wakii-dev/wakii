# Context pack — SF-1: Workbench polish (icon colors + sticky scroll + F2 rename)

Spec nguồn: `docs/superpowers/specs/2026-09-22-vscode-workbench-polish-spec.md` (rev.2 — đã qua spec-critic). Đọc spec TRƯỚC khi làm bất cứ việc gì; pack này chỉ là slice vận hành, không thay spec.

## Spec slice

SF này làm đúng 3 việc, nothing else:

1. **Màu icon theo loại file** — thêm classifier màu dùng chung + áp ở đúng 12 render surfaces (inventory liệt kê trong spec, từng dòng đã verify). Contract C1: giữ nguyên `getFileTypeIcon`, thêm `getFileTypeIconColor` trả GroupKey; class màu áp qua **literal map** `Record<GroupKey, 'text-<token>'>` — CẤM chuỗi class computed (Tailwind v4 scanner + `check:code-quality:changed`). Contract C2: mapping nhóm→màu theo bảng trong spec (unknown → muted, folder/symlink không đổi); contrast ratios tính cho cả light/dark, ghi PR. Contract C4: icon màu loại file, git statusColor giữ trên filename — có test assertion riêng. Guard bắt buộc: simulator tab (synthetic label "mobile emulator") không được tô.
2. **Sticky scroll** — probe TRƯỚC build (spec task 6, ternary contingency + enumerate cả 4 option builders: file/diff/peek/automation — peek + automation đã pin false sẵn); setting `editorStickyScroll` additive default OFF + toggle ở GeneralEditorSettingsSection + wire file-editor scope (nhánh leak → pin false cho diff sub-editors; nhánh hỏng → drop + comment epic).
3. **F2 rename** — action `fileExplorer.rename` qua keybindings system theo contract C3 (union + per-platform defaults + allowBareKeybindings); **mac fn-key limitation ghi vào `title` của action** (KeybindingDefinition không có description field — không thêm UI mới); wire vào useFileExplorerKeys song song Enter hardcoded (bất đối xứng có chủ đích, có test).

## Touch map

Primary:
- `src/renderer/src/lib/file-type-icons.ts` (+ test cùng thư mục lib)
- 12 consumer files (danh sách đúng theo spec — grep lại `getFileTypeIcon` khi làm để chống drift)
- `src/renderer/src/assets/main.css` — color tokens mới (light + dark)
- `src/renderer/src/components/editor/MonacoEditor.tsx` — stickyScroll option
- Settings: store slice settings + `GeneralEditorSettingsSection.tsx` + `src/shared/global-settings-types.ts` + `default-global-settings.ts` (pattern `editorMinimapEnabled`)
- `src/shared/keybindings/types.ts` + `definitions-core-*.ts` — action id mới (shared file, typecheck bắt side effect)
- `src/renderer/src/components/right-sidebar/useFileExplorerKeys.ts` — wire F2

Regression candidates (tests phải xanh):
- `file-type-icons.test.ts`, explorer keys tests, keybindings tests, settings tests, tab bar tests (simulator guard), `check:code-quality:changed` (token rule)

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm theo đây)

1. Worktree có code đa định dạng: icon có màu phân biệt giữa các nhóm ở CẢ 12 surfaces, cùng ánh xạ; simulator tab không bị tô; file unknown vẫn muted; folder/symlink không đổi.
2. Settings → Editor toggle "Sticky scroll" (default OFF); bật + mở file TS dài → scope header giữ chỗ khi cuộn; file không folding → không render gì (không phải bug).
3. F2 rename hoạt động khi focus file trong explorer; rebind F2 trong keybindings UI được; Enter vẫn rename; F2 khi rename input đang mở không lồng.
4. `pnpm tc` + `pnpm run check:code-quality:changed` + suites liên quan xanh; browser walkthrough flow đầy đủ.

## Boundary

- KHÔNG sửa main-process / IPC / wire format (SSH boundary không đổi).
- KHÔNG đụng `monaco-setup.ts` (semantic validation tắt là documented decision).
- KHÔNG đổi keybinding hiện có, KHÔNG đổi minimap default, KHÔNG làm replace-all/LSP/breadcrumbs.
- KHÔNG đổi return shape `getFileTypeIcon`.
- Scope change bất kỳ (vd nhánh (c) probe stickyScroll) PHẢI comment lên epic + cập nhật bracket, không tự quyết lặng lẽ.

## Run protocol (bắt buộc)

- **Mỗi task**: atomic commit + tick plan file ngay khi xong (`- [ ]` → `- [x]`) — panel đọc progress từ checkbox.
- **Browser verify**: Electron protocol — `ORCA_BACKGROUND_LAUNCH=1`, CDP screenshots BEFORE/AFTER cho 4 success criteria, không focus steal, `$electron` skill; KHÔNG DOM-query thay visual (Rule 0).
- **Run-complete checklist** (plain numbered — KHÔNG đưa vào checkbox tasks, FI-191): code-reviewer độc lập → gates 1-5 → merge theo `references/merge-playbook.md` (merge PARENT vào sf-branch trước + update-ref full refname + ancestor guards, KHÔNG naive merge) → comment hash lên sub-issue → story-post-merge → Linear Done (coordinator).
