# SF-4 Context Pack — Editor chrome & tabs parity
> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-21-editor-vscode-parity-design.md`. Bracket: `docs/superpowers/brackets/fi478-editor-vscode-parity.md`. Design: none — extend surface có sẵn. Reference behavior: `~/Desktop/projects/vscode` (`workbench/browser/parts/editor/*`, tabs contributions).

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)
1. **Breadcrumbs path-level** trong `EditorPanelHeaderPath` (folder › folder › file), toggle setting. Symbol-level Out-of-scope (LSP).
2. **Preview tab**: data model đã có `Tab.isPreview` — single-click mở ở chế độ preview (italic title), mở file khác → preview nhường chỗ; double-click hoặc edit → thành tab chính thức (pin semantics giữ riêng).
3. **Pin UX**: context menu Pin/Unpin + persistence qua workspace session (shape hiện tại không đổi).
4. **Tab context menu parity**: Close Others / Close Right / Close Saved / Copy Path / Reveal in Explorer (reveal → explorer qua store event, KHÔNG sửa explorer).
5. **Split keyboard**: ⌘\ split editor sang phải (infra có sẵn: `openFilePreviewToSide` đã tạo right split), ⌘1/2/3 focus group theo thứ tự.
6. Settings mới: sticky scroll toggle, breadcrumb toggle — mở rộng `GeneralEditorSettingsSection`.
7. **Mobile wire-safety**: `isPreview/isPinned` đã nằm trong `runtime-mobile-session-tab-contracts` — nếu wire shape đổi thì additive-only + ratchet parity test pass.
8. Lệnh mới register qua contract SF-1 (`PaletteCommandEntry`).
9. **Edge với SF-5 (lý do thật)**: preview-tab yield semantics + nghĩa "active editor" lúc capture selection ảnh hưởng ⌘K — giữ hành vi deterministic (preview tab vẫn capture được, ghi activeGroupId chuẩn).

## Touch map (files SF-N tạo/sở hữu)
- Sở hữu: `EditorPanelHeaderPath.tsx`, `editor-header.ts`, breadcrumbs component mới, tab context menu component mới, `store/slices/tabs/tabs-layout.ts` + `tabs-secondary-actions.ts` extensions, split shortcut entries trong `definitions-core-3.ts` (append-only — SF-3 append F4 cùng file, KHÔNG đụng dòng nhau), settings section mở rộng.
- READ-ONLY: `shared/tab-types.ts` (**KHÔNG đổi shape** `Tab.isPreview/isPinned`/`TabGroupLayoutNode`), `runtime-mobile-session-tab-contracts.ts` (ratchet target), `MonacoEditor.tsx` core (SF-5 đụng input bindings — coordinate qua pack), viewers (DiffViewer, RichMarkdown*).
- Append-only chung: `create-editor-slice.ts` + `editor-slice.ts` (2 dòng).

## ACCEPTANCE (user-visible)
- Mở file: breadcrumb `worktree › src › components › App.tsx` hiện trên editor; tắt được trong settings.
- Single-click file ở QuickOpen → tab italic preview; mở file khác → preview bị thay; double-click → tab chính.
- Chuột phải tab: Close Others đóng mọi tab khác, Close Right đúng hướng, Copy Path copy tuyệt đối.
- ⌘\ tạo editor pane bên phải; ⌘1/⌘2 nhảy focus đúng group.
- Sticky scroll on → dòng scope dính đầu viewport (Monaco option).
- Mobile session ratchet parity pass (không vỡ projection); viewers (markdown/diff/ipynb) không vỡ render model.

## Boundary (KHÔNG làm)
- KHÔNG đổi `shared/tab-types.ts` shape (additive-only nếu bắt buộc — flag coordinator).
- KHÔNG đụng explorer (SF-2), search (SF-3), palette (SF-1), ⌘K (SF-5).
- KHÔNG thêm symbol breadcrumbs.
- KHÔNG restyle `components/ui/` primitives (STYLEGUIDE gate).
