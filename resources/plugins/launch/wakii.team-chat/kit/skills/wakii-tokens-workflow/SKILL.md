---
name: wakii-tokens-workflow
description: Bản đồ token ↔ tình huống + quy trình thêm token mới cho UI Wakii desktop. Use khi viết/sửa component renderer, chọn màu/spacing/shadow/radius, thêm token mới vào main.css, fix review về restyle/hardcode hex, hoặc soi dark/light parity trước khi nộp PR.
---

# Wakii Tokens Workflow — chọn đúng token, không bịa giá trị

> Canonical source: `src/renderer/src/assets/main.css` (token values) +
> `docs/STYLEGUIDE.md` (roles & rules). File này là bản đồ tra nhanh — khi hai
> nguồn va nhau, main.css + STYLEGUIDE thắng. Gate gắt nhất:
> `pnpm run check:code-quality:changed` fail khi restyle primitive `components/ui/`,
> dùng raw palette color, hoặc dựng `className` computed.

## 1 · Bản đồ token ↔ tình huống

| Tình huống | Token / class | Không được dùng |
|---|---|---|
| Nền canvas app | `bg-background` | hex trắng/đen tự bịa |
| Panel nổi khỏi canvas | `bg-card` + `text-card-foreground` | — |
| Menu/dialog nổi | `bg-popover` + `text-popover-foreground` | card cho popover |
| Nền form field | `bg-input` (chỉ nền field) | input cho panel |
| Panel sidebar worktree | `--worktree-sidebar*` | sidebar* ra ngoài sidebar |
| Nền Monaco/markdown | `bg-editor-surface` | editor-surface cho chrome app |
| Body copy | `text-foreground` | muted cho body |
| Caption/placeholder/disabled | `text-muted-foreground` | — |
| Hành động khẳng định duy nhất của flow | `primary` (1 lần/flow) | primary cho hover/decoration/nút phụ |
| Nút phụ thấp hơn | `secondary` | — |
| Hover/active nền ghost button, list row | `bg-accent` | accent làm filled button (dùng secondary) |
| Delete/hủy không phục hồi + error | `destructive` | destructive cho Cancel |
| Hairline mọi nơi | `border-border` | — |
| Focus ring / selection halo | `ring` | ring làm decoration thường trực |
| Git status | `--git-decoration-*` | dùng cho state khác git |
| Row "đang chọn" | `bg-accent` + `data-current="true"` | tự bịa màu "selected" |
| Đường phân cắt | `--split-divider` (>3:1 trên card, `--border` quá nhạt) | border cho split |
| Trạng thái agent | `--agent-question` / `--agent-working` | tự chọn orange/yellow |
| Charts | `--chart-1..5` | palette mới |
| tint nhẹ từ token có sẵn | `color-mix(in srgb, var(--token) N%, var(--background))` | hex mới |

**Typography** — sans `Geist` (`--font-sans`), mono `var(--font-mono)` cho path/code/terminal. Scale: 14px body + button default, 13px sidebar/dense, 12px sub-text, 11px meta uppercase `font-semibold tracking-wider`. Dùng `text-2xs` (11px) / `text-3xs` (10px) — không `text-[11px]`/`text-[10px]`.

**Radius** (`--radius: 0.625rem`, main.css:200): button/input `rounded-md`, Card `rounded-xl`, badge `rounded-full`. Match primitive đang có, không thêm bậc mới.

**Elevation — đúng 3 bậc**: (1) hairline `border` mặc định; (2) `shadow-xs` + border 1 token cho outline button/card nhúng; (3) `shadow-floating` (main.css:179) chỉ cho popover thoát khỏi editor surface. Cần bậc 4 = thực ra bạn cần `ring`.

**Spacing**: scale Tailwind chuẩn (`--spacing` 0.25rem), không tự bịa số lẻ ngoài scale.

## 2 · Quy trình thêm token mới

1. Thêm biến thô ở **cả** `:root` (main.css:195) và `.dark` (main.css:323) — cặp đôi, không một bên.
2. Expose ở `@theme inline` (main.css:57) dạng `--color-<tên>: var(--<tên>)` để thành Tailwind class.
3. Dùng class `bg-<tên>`/`text-<tên>`/`border-<tên>` trong component.
4. Gate: `pnpm run check:code-quality:changed` — fail trên raw palette/hex mới.

Ví dụ thật (commit `0f5c05356e5`, SF-1 hover card blame): cần chữ avatar trên lane màu → thêm `--avatar-foreground-on-lane` ở `:root` (main.css:311) **và** `.dark` (main.css:516), expose `--color-avatar-foreground-on-lane` (main.css:174), dùng `text-avatar-foreground-on-lane` trong `git-blame-hover-card.tsx`. Cùng commit expose bộ diff: `--color-diff-added/-removed/-added-background/-removed-background` (main.css:175-176).

Lưu ý: repo này KHÔNG có bước "sync ui-kit" — main.css là nguồn duy nhất (STYLEGUIDE.md:3, 23).

## 3 · Dark/light parity checklist (~8 điểm)

- [ ] Token mới có giá trị ở CẢ `:root` và `.dark` (soi 2 block, không chỉ 1)
- [ ] Không hex hardcode trong component — mọi màu đi qua var/class
- [ ] Tint dùng `color-mix` với token có sẵn — parity tự động, không thêm hex
- [ ] Cặp surface+foreground đạt contrast ở **cả 2 theme** (token là cặp, luôn dùng cùng nhau — STYLEGUIDE.md:29)
- [ ] Ảnh/icon: 2 bản (light/dark) hoặc `currentColor`/mask — không chôn màu vào SVG
- [ ] Shadow hợp lý cả 2 theme (nếu không, override riêng trong `.dark` như `.dark .orca-diff-card` dùng `shadow-xs` đè base popover — main.css:3167)
- [ ] Không tự phát minh màu "selected" — recipe `data-selected='true'` có sẵn (main.css:1452)
- [ ] Content đè lên pane xterm (luôn nền tối) dùng biến `--terminal-pane-title-on-dark-*`, không theo theme app
- [ ] Verify bằng mắt: đổi theme trong app soi cả 2 — automation thì screenshot CDP cả light + dark

## 4 · Anti-patterns + phạt

| Anti-pattern | Ví dụ | Sửa |
|---|---|---|
| Hex tự bịa | `bg-[#f5f5f5]` | `bg-secondary` |
| Font size ngoài token | `text-[11px]` | `text-2xs` |
| Shadow bậc 4 tự chế | `shadow-[0_2px_8px_rgba(...)]` | chọn trong 3 bậc, hoặc `ring` |
| Raw palette | `bg-red-500` cho state riêng | `destructive` / token vai trò tương ứng |
| `Inter`/system sans | `font-family: Inter` | `Geist` qua `--font-sans` |
| accent làm filled button | `bg-accent text-accent-foreground` nút chính | `secondary` |
| destructive cho Cancel | nút "Huỷ" đỏ | ghost, không màu (STYLEGUIDE.md:75) |
| Nhiều primary trong 1 flow | 2 nút đen | 1 `primary` + còn lại `secondary`/`outline` |

## 5 · Before/after từ task thật (SF-1 hover card blame, `0f5c05356e5`)

**Before (mockup HTML)** — màu chôn trong prototype, chưa map token.
**After** — card dựng từ cặp token đúng vai trò:

```tsx
// git-blame-hover-card.tsx — popover pair + hairline + elevation bậc 3 (card nổi)
<div className="w-[420px] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md">
  <span className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-avatar-foreground-on-lane">
```

Điểm **chưa chuẩn** ngay trong commit đó (bài học reviewer): `font-mono text-[11px]` thay vì `text-2xs` ở vài chỗ (`git-blame-commit-detail-dialog.tsx:99,128`) — sống sót vì lint size-gate chỉ ép hard trong `components/native-chat/`; đừng nhân rộng.

## 6 · Khi nào được phá lệ + hỏi ai

Resolution order khi STYLEGUIDE im lặng (STYLEGUIDE.md:89-96):

1. Code liền kề trong `src/renderer/src/components/` — theo sibling gần nhất.
2. Primitive có sẵn trong `src/renderer/src/components/ui/` đã mã hoá pattern.
3. Câu hỏi token → `main.css` là phán quyết; có thì dùng, không thì thêm mới cả light lẫn dark.
4. Vẫn chưa giải được → **hỏi trước khi bịa**: worker báo Captain qua team-chat, Captain trình CEO. Không tự chế token/values ngoài hệ.

Vi phạm có chủ đích (ví dụ editor theme riêng biệt `data-code-editor-theme`) phải có comment WHY + không đụng primitive `components/ui/` (gate chặn restyle).

---

### Nguồn (file:line, kiểm tại wakii-dev `095e93f3306`)

- Token values: `src/renderer/src/assets/main.css` — `@theme` :48, `@theme inline` :57, `:root` :195, `.dark` :323, `--radius` :200, `--shadow-floating` :179, `text-2xs/3xs` :49-52, `--split-divider` :315, jump-palette selected :1452, diff-card dark override :3167
- Roles & rules: `docs/STYLEGUIDE.md` — tokens :21-26, color :27-39, typography :41-48, radius/elevation :50-53, components :55-66, UX :68-78, cross-platform :80-87, resolution order :89-96
- Ví dụ thêm token: commit `0f5c05356e5` — main.css diff (avatar :174/:311/:516, diff :175-176), `git-blame-hover-card.tsx`
