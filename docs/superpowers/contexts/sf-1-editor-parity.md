# Context pack — SF-1 editor parity (options + breadcrumbs)

Spec nguồn: `docs/superpowers/specs/2026-09-24-editor-parity-spec.md` (rev.2 — 2 vòng spec-critic trên ĐÚNG cây feature). Verify code trên `fi28-coordinator` checkout.

## Spec slice

4 nhóm việc, nothing else:
1. **Suggest explicit hóa** — quickSuggestions/wordBasedSuggestions (enum string `'currentDocument'`)/snippetSuggestions ('inline') trên file-editor options; 0 squiggle mới (đo `getModelMarkers`).
2. **Editor options + settings** — bracketPairColorization (verify default ON — explicit hóa + toggle nếu probe cần), **thay hardcode `cursorSmoothCaretAnimation: 'off'` tại MonacoEditor.tsx:269** bằng setting enum ('on' default), renderWhitespace 'selection' explicit + setting; **minimap default ON + one-shot stamp migration** theo precedent osc52 (`terminalAllowOsc52ClipboardDefaultedOnForAllUsers`): stamp field + wire CẢ desktop store và web localStorage normalization + site fallback `MonacoEditor.tsx:250` (`?? false`) đổi theo; semantics: stamp flip cả explicit opt-out (persist dense không phân biệt được) — đã chốt.
3. **Format reuse** — KHÔNG re-register: probe Shift+Alt+F hiện trạng; nếu built-in đủ → task = verification + draft-intact test; bổ sung scoping chỉ khi thiếu (readOnly để built-in precondition tự chặn); scope ngôn ngữ: javascript/typescript/json/css (+verify scss/less qua css worker).
4. **Breadcrumb bar** — CHỈ file editor (surface khác opt-in tường minh qua task-1 notes); path segments; click parent → `revealInExplorer(worktreeId-của-file, filePath)` (machinery explorer: explorer-dir-state.ts:61 + useFileExplorerReveal/AutoReveal — KHÔNG phải SF-1); folder workspace hoạt động; setting default ON; ẩn autoHeight.
5. **Quick outline (probe-gated)** — **eater thật của Mod+Shift+O: `useMarkdownPreviewShortcut.ts:53-78` (markdown files) + `floating-workspace-shortcut-policy.ts:18-24` (floating panel) — dispatcher use-global-keybindings KHÔNG liên quan.** Policy yield: editor focused AND language có DocumentSymbolProvider (probe); markdown-source giữ preview (không provider — tránh dialog regress); widget con `.monaco-editor` tính là editor; test 2 editor mount. Không có provider → drop + comment epic.

## Touch map

- `src/renderer/src/components/editor/MonacoEditor.tsx` (options block + 2 fallback sites 249-250, 269)
- `src/renderer/src/components/editor/use-monaco-editor-mount.ts` (action/keybinding registration)
- `src/renderer/src/components/editor/EditorEditFileSurface.tsx` (breadcrumb slot; markdown source-mode only)
- Component mới: breadcrumb bar + settings components kiểu StickyScrollSetting.tsx
- `src/shared/global-settings-types.ts` + `default-global-settings.ts` + `src/shared/osc52-clipboard-settings.ts` (pattern) + `normalize-loaded-global-settings.ts` (wire cả desktop + web store)
- `GeneralEditorSettingsSection.tsx`; `src/shared/keybindings/definitions-core-2.ts` (verify chord) + chord gate sites: `useMarkdownPreviewShortcut.ts:53-78` + `floating-workspace-shortcut-policy.ts:18-24`
- Regression: DiffViewer/DiffSectionBody pins, automation prompt options, peek options — KHÔNG đụng

## ACCEPTANCE (user-visible — verifier kiểm)

1. Breadcrumb bar trên file editor: segments path, click parent reveal đúng worktree (folder workspace OK); markdown-preview/rich không có; autoHeight không có; setting default ON tắt được.
2. Gõ ts/js: suggestions word-based + snippets; `getModelMarkers` count 0 mới (0 squiggle).
3. Shift+Alt+F trên JSON: format + undo + draft intact; readOnly tab không format.
4. Bracket colorization hiển thị; smooth caret ON; renderWhitespace toggle 'selection'.
5. Minimap ON trên profile CŨ (đã persist false) SAU stamp — flip đúng 1 lần; tắt thủ công giữ OFF; profile mới ON.
6. Quick outline trong editor focused (nếu probe đạt); Ctrl+Shift+O ngoài editor vẫn mở markdown như cũ.
7. Gates: vitest touched đúng config + tc + check:code-quality:changed + lint:design-system + ELECTRON walkthrough CDP screenshots `.evidence-editor-parity/`.

## Boundary

- KHÔNG đụng diagnosticsOptions/monaco-setup validation stance (chỉ bổ sung comment ranh giới).
- KHÔNG đụng pin DiffEditor/peek/automation; KHÔNG LSP/symbol-breadcrumbs/rulers/prettier.
- Settings optional TRỪ minimap stamp (stamp field theo osc52 pattern).
- KHÔNG re-register built-in Monaco actions trùng chord; KHÔNG sửa plan file giữa run (design notes → task report).
- Scope change → REQUIREMENT-GAP comment epic + cập nhật bracket.

## Run protocol

- Atomic commit + tick plan sau MỖI task. Dev app user đang chạy ở 5173 từ fi28-coordinator — KHÔNG restart/kill; worktree riêng có dev instance riêng nếu cần screenshots.
- ELECTRON protocol mọi browser check (ORCA_BACKGROUND_LAUNCH=1, CDP, cấm focus steal). Walkthrough cover ĐỦ 7 success criteria (chord 2 chiều + minimap profile-cũ seed qua localStorage web 5173).
- RUN-COMPLETE (plain list — coordinator-owned, KHÔNG phải task worker): reviewer độc lập (OUTBOX verdict — coordinator ghi file) → gates 1-4 → merge worker→feature/clone-vs-vscode (merge-ngược + update-ref FULL refname refs/heads/feature/clone-vs-vscode + ancestor guards; branch checkout ở fi28-coordinator — KHÔNG worktree add thẳng) → post-merge sync: dirty-check rồi `git -C fi28-coordinator reset --hard` (đây là sync checkout, KHÔNG phải dest-sync/branch -f) → hash comment lên sub-issue → story-post-merge → sub-issue Done.
- Sync freeze: coordinator không merge wakii-dev vào feature branch trong run.
