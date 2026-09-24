# Spec: clone-vs-vscode phase 3 — editor parity (options + breadcrumbs)

Ngày: 2026-09-24 (rev.3 sau plan-critic) · Team: FI · Project: wakii · Nhánh: **feature/clone-vs-vscode**
▶️ CONTINUED song song với embed VS Code epic (native Monaco giữ vai trò review/diff). Verify code trên `fi28-coordinator` checkout, KHÔNG wakii-dev.

## IDEA-BRIEF (8 chiều)

- **Task**: surface khả năng Monaco đã có nhưng chưa bật/wire + breadcrumb UI — KHÔNG đụng LSP/semantic.
- **Output**: renderer-only; settings optional trừ minimap migration; i18n ×6 locales.
- **Constraints**:
  - Ranh giới bất khả xâm phạm: `monaco-setup.ts:56-62` — 0 squiggle mới (đo `getModelMarkers`).
  - Settings optional (pattern editorStickyScroll); minimap default ON đi kèm **one-shot stamp migration** (Task 4).
  - **Reuse built-in Monaco actions** — không re-register trùng chord.
  - Option mới chỉ áp FILE EDITOR; giữ pin DiffEditor/peek/automation.
  - i18n ×6; STYLEGUIDE tokens; breadcrumb ẩn autoHeight.
- **Input**: phase0 + spec-critic round 2 + plan-critic rev.3 + user decisions.
- **Context**: workers sẵn; formatters kèm bundle; built-in actions đã register.
- **Success criteria**:
  1. Breadcrumb bar path file, click parent → reveal đúng worktree trong explorer (folder workspace OK); toggle default ON; chỉ file editor.
  2. Gõ ts/js → suggestions (word-based + snippets) mà 0 squiggle mới (markers count).
  3. Shift+Alt+F format JSON + undo + draft intact (verify built-in, KHÔNG re-register).
  4. Bracket colorization hiển thị (verify default); smooth caret setting ('on' default); renderWhitespace 'selection' setting.
  5. Minimap ON cho mọi user (default + one-shot stamp cả 2 store); tắt thủ công giữ OFF.
  6. Chord Mod+Shift+O: editor focused + language có provider → quick outline; markdown-source → preview giữ nguyên; ngoài editor → openMarkdown như cũ.
  7. Gates: vitest touched + `pnpm tc` + `check:code-quality:changed` + `lint:design-system` + walkthrough ELECTRON.
- **Out-of-scope**: LSP; symbol breadcrumbs; rulers; prettier; semantic validation; mobile; web renderer.

## Verify-first probes (3)

1. DocumentSymbolProvider per language → gates Task 8 + cho data policy chord (language nào có provider).
2. Suggest defaults hiện tại (`quickSuggestions` default `{other:'on',comments:'off',strings:'off'}`; `wordBasedSuggestions` enum string; `snippetSuggestions` enum 'top'|'bottom'|'inline'|'none' — TỒN TẠI trên 0.55.1) → task 2 là "thêm" hay "explicit hóa".
3. **Shift+Alt+F hiện trạng** (built-in `editor.action.formatDocument` đã register cho 4 ngôn ngữ — `formatActions.js:187-219`) + consumer enumeration MonacoEditor qua `editor-lazy-views` (autoHeight list; IpynbCellEditor/AutomationEditorPromptEditor/MonacoCodeExcerpt là editor riêng — ra matrix).

## SF-1 — Editor parity (Tier 0, 1 executor, sequential)

**What (demo đầu-cuối):** mở file ts → gõ có suggestions 0 squiggle; breadcrumb click segment reveal; Shift+Alt+F format JSON undo được; minimap ON cả profile cũ; chord Ctrl+Shift+O trong editor mở outline, markdown-source vẫn preview.

**Tasks (9 — DAG: [1]→[2]→[3]→[4]→([5],[6],[7],[8])→[9]; [3]+[4] cùng sửa MonacoEditor.tsx — GIỮ TUẦN TỰ; mọi task: atomic commit + tick plan):**

1. **Probe cluster** — DocumentSymbolProvider per language; suggest defaults; Shift+Alt+F hiện trạng; consumer enumeration + autoHeight list; dirty-detect API. Output: design notes vào TASK REPORT (không sửa plan giữa run).
2. **Suggest explicit hóa** — enum strings đúng 0.55.1; exit: test + runtime markers count 0 mới.
3. **Editor options + settings (bracket/smoothCaret/renderWhitespace)** — bracketPair verify default ON (`textModelDefaults.js:12-14` enabled:true) → chỉ explicit + setting nếu probe cần; **thay hardcode smoothCaret `'off'` tại `MonacoEditor.tsx:269`** bằng setting enum ('on' default, valid 'explicit'); renderWhitespace 'selection' explicit + setting. Exit tests cụ thể: options block đọc setting (unit); toggle components cập nhật store (unit).
4. **Minimap default ON + one-shot stamp migration** — (i) default `default-global-settings.ts:52` → true; (ii) stamp field theo precedent `terminalAllowOsc52ClipboardDefaultedOnForAllUsers` (`default-global-settings.ts:122` + `src/shared/osc52-clipboard-settings.ts`); (iii) wire **CẢ 2 store**: desktop `prepare-loaded-terminal-settings.ts:114` + web `web-preferences-store.ts:40` (desktop site đúng là 114 — normalize-loaded-global-settings.ts:100 chỉ là spread site); (iv) **site fallback `MonacoEditor.tsx:250` (`?? false`) → `?? true`** (pre-hydration không flash-off). Semantics chốt: stamp flip cả explicit opt-out (persist dense không phân biệt được). Exit tests: cũ-false flip 1 lần / cũ-true KHÔNG downgrade / mới ON / tắt-sau-stamp giữ OFF / **wiring test cả 2 store** / **fallback pre-hydration test**.
5. **Format reuse + bridge verification** — theo probe [1.3]: built-in đã format → task = verification + test draft-intact qua content-sync; chỉ bổ sung scoping nếu thiếu (readOnly để built-in precondition tự chặn — KHÔNG tự thêm handler). Scope language: javascript/typescript/json/css (+scss/less qua css worker — verify có formatter không). Exit: format JSON → undo → draft intact (test).
6. **Breadcrumb bar** — CHỈ file editor. **Matrix đã pin (component × kỳ vọng)**: `EditorEditFileSurface` file-editor = breadcrumb ON; `EditorEditFileSurface` markdown-source = breadcrumb ON (path vẫn có ý nghĩa); liveTail readOnly = ON; `EditorConflictReviewSurface` selected view = ON; inline overview (`autoHeight:true`, :235) = OFF; floating workspace editor = ON; KHÔNG breadcrumb: `IpynbCellEditor`, `AutomationEditorPromptEditor` (pin riêng), `MonacoCodeExcerpt` (colorize-only). Click parent → `revealInExplorer(worktreeId-của-file, filePath)` (machinery: `explorer-dir-state.ts:61` + `useFileExplorerReveal`/`useFileExplorerAutoReveal` — explorer/clone work, KHÔNG phải SF-1); folder workspace OK. Setting `editorBreadcrumbsEnabled` default ON. Exit: render test + matrix test từng ô như pin.
7. **i18n ×6 locales** — strings mới tasks 3/4/6; exit: keys đủ 6 files + parse OK (đã verify en-runtime-required.json không chứa editor settings strings — không cần action).
8. **Quick outline + chord policy (re-derived)** — **eater thật của Mod+Shift+O: (1) `useMarkdownPreviewShortcut.ts:53-78` (active khi file là markdown qua `canOpenMarkdownPreview`, không check editor focus); (2) `floating-workspace-shortcut-policy.ts:18-24` (floating panel capture from anywhere)** — dispatcher `use-global-keybindings.ts` chỉ match 4 action khác, KHÔNG liên quan. Policy: yield chỉ khi **editor focused AND language có DocumentSymbolProvider** (probe [1]); markdown-source giữ preview (không có provider — tránh dialog "no providers" regress đúng use case của chord). Probe thêm: hiện trạng outline per-language trên ts/js hôm nay (nếu đã chạy sẵn → task thu nhỏ còn gate-policy + tests). Exit tests: (i) ts/js focused → outline; (ii) markdown-source focused → preview giữ; (iii) focus vào widget con `.monaco-editor` (find/suggest widget) tính là editor; (iv) 2 editors mount (main + floating) — gate theo `event.target` không focus-blind.
9. **Verify + walkthrough** — vitest touched (đúng config) + `pnpm tc` + `check:code-quality:changed` + `lint:design-system`; ELECTRON walkthrough (ORCA_BACKGROUND_LAUNCH=1, CDP) cover **đủ 7 SC**: breadcrumbs render/click-reveal (SC1), suggestions markers count (SC2), format+undo+draft (SC3), bracket+caret+whitespace visuals (SC4), minimap với **profile cũ seed qua localStorage tại web 5173** (SC5), chord 2 chiều per policy (SC6), settings toggles; screenshots `.evidence-editor-parity/`.

**RUN-COMPLETE CHECKLIST** (plain — coordinator-owned, KHÔNG phải task của worker): reviewer độc lập (OUTBOX verdict — coordinator ghi file) → gates 1-4 → **merge worker→feature/clone-vs-vscode** (merge-ngược + update-ref FULL refname + guards) → **post-merge sync: dirty-check rồi `git -C fi28-coordinator reset --hard`** (đây là sync checkout sau update-ref, KHÔNG phải dest-sync/branch -f; dev app user chạy từ checkout này — hot-reload sẽ tự áp) → hash comment lên sub-issue → story-post-merge → sub-issue Done. Sync freeze: coordinator không merge wakii-dev vào feature branch trong run.

**ACCEPTANCE** = 7 Success criteria.

**Boundary:** không đụng diagnosticsOptions (chỉ bổ sung comment); không LSP/symbol-breadcrumbs/rulers/prettier; settings optional trừ stamp; KHÔNG re-register built-in actions; KHÔNG đụng pin DiffEditor/peek/automation; tab.openMarkdown policy thay đổi có chủ đích + test 2 chiều; scope change → REQUIREMENT-GAP comment epic + cập nhật bracket.

## Rủi ro & unknowns

1. Stamp minimap flip cả explicit opt-out — chấp nhận có chủ đích (Task 4).
2. Chord policy yield theo focus + language-provider — thiếu case → regress markdown preview (Task 8 tests chặn).
3. DocumentSymbolProvider probe — drop path rõ (Task 8).
4. TS worker spin-up lần đầu — chấp nhận.
5. [3]+[4] cùng file MonacoEditor.tsx — giữ tuần tự, không parallelize.
