# SF-1 Context Pack — ⌘⇧P Command palette + unified registry
> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments. Epic spec: `docs/superpowers/specs/2026-09-21-editor-vscode-parity-design.md`. Bracket: `docs/superpowers/brackets/fi478-editor-vscode-parity.md`. Design: mock-prototype (designer phase TRƯỚC dev — 3 hướng HTML → user chọn).

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)
1. Palette lệnh mới mở bằng ⌘⇧P; tái dùng shadcn `CommandDialog` primitives (pattern QuickOpen).
2. Registry gộp 3 nguồn: core keybindings (`definitions-core-1..4`, flag palette-visible), plugin palette source, cmd-j quick-actions — tất cả qua `app-command-dispatch` hiện có.
3. **Contract `PaletteCommandEntry` (QĐ-12) — SF-1 SỞ HỮU, các SF khác code against**: `{ id: string (dot-namespaced, vd 'explorer.revealActive'), titleKey: string (i18n key, KHÔNG literal), category: 'file'|'edit'|'view'|'git'|'terminal'|'plugin', when?: PreconditionId, run: KeybindingActionId | (() => void), source: 'core'|'plugin'|'cmd-j' }`.
4. Fuzzy + recent-commands (persist); **5 truy vấn pinned** cho verify — tạo fixture khi implement, ghi danh sách query → expected top-command vào chính pack này (append section "Pinned verify queries" ở cuối).
5. ⌘⇧P binding: scope policy theo `TerminalShortcutPolicy` ('orca-first' | 'terminal-first' — đã có) — terminal focus thì KHÔNG capture.
6. i18n: SF-1 sở hữu catalog infra; platform labels (⌘/Ctrl) qua `shortcut-platform` — GỘP 1 task.
7. Startup budget: assert palette module KHÔNG nằm trong startup import graph (lazy mount như QuickOpen/lazyWithRetry pattern).
8. Tier-gate: acceptance CHỈ test lệnh 3 nguồn HIỆN CÓ. Lệnh mới SF-2/3/4 hiện trong palette là hệ quả contract — verify ở SF-6 convergence, KHÔNG gate SF-1.

## Touch map (files SF-N tạo/sở hữu)
- Sở hữu: component mới `src/renderer/src/components/command-palette/` (modal + registry glue); extension của `src/renderer/src/lib/app-command-dispatch.ts`; `activeModal` union trong `src/renderer/src/store/slices/ui/ui-slice-modal-actions.ts` (+ ripple `useModalReturnFocus`, `FeatureTipsModal` — task riêng); i18n catalog keys namespace `commandPalette.*`.
- Append-only (các SF khác cùng đụng): `src/shared/keybindings/definitions-core-*.ts` (thêm palette-visible flag — KHÔNG đổi union hiện có).
- READ-ONLY: `src/renderer/src/components/cmd-j/` (chỉ đọc catalog để surface qua dispatcher); `src/renderer/src/components/QuickOpen.tsx` (pattern tham khảo, KHÔNG sửa); `src/renderer/src/components/ui/command.tsx` (primitive, KHÔNG restyle — STYLEGUIDE gate).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)
- Nhấn ⌘⇧P (Ctrl+Shift+P trên Win/Linux): palette mở giữa màn hình, gõ được ngay.
- 100% core actions palette-visible có trong danh sách (verify đếm trực tiếp từ definitions-core-*.ts); 5 truy vấn pinned trả đúng command đứng đầu; Enter chạy đúng lệnh.
- Lệnh từ plugin (navigation-shortcuts) và cmd-j hiện đúng category; chạy được từ palette.
- Terminal đang focus → ⌘⇧P đi vào terminal (theo policy hiện có), không mở palette.
- Mở palette không làm chậm khởi động app (startup assert pass).

## Boundary (KHÔNG làm)
- KHÔNG sửa UI cmd-j (⌘J) hay QuickOpen (⌘P) — chúng giữ nguyên, chỉ bị surface qua registry.
- KHÔNG thêm lệnh của explorer/search/chrome — đó của SF-2/3/4 (chỉ bảo đảm contract nhận được).
- KHÔNG đụng Monaco keybindings hay tiptap shortcuts.
- KHÔNG hardcode Meta key (AGENTS.md cross-platform).
