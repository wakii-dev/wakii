# Wakii Overlay — luật riêng của fork Wakii

> Lớp phủ áp lên toàn bộ rule ECC trong `rules/`. File này KHÔNG thay thế file ECC —
> chỉ bổ sung luật fork. Chi tiết đầy đủ luôn sống ở file được trỏ, không trùng lặp ở đây.
> Nguồn ECC: https://github.com/affaan-m/ECC (MIT) — không sửa file ECC gốc, dễ update upstream.

## 1 · Fork naming — định danh kỹ thuật GIỮ NGUYÊN qua mọi đợt sync

Sản phẩm là **Wakii** (rebrand từ Orca), nhưng các định danh kỹ thuật dưới đây không bao giờ rename:

- `@orca/*` package imports (ví dụ `@orca/process-host`)
- `ORCA_*` environment variables (ví dụ `ORCA_BACKGROUND_LAUNCH`, `ORCA_E2E_*`)
- appId / bundleId `com.stablyai.orca*`, protocol `orca://`
- `orcad` family (daemon identifiers/paths/env), `~/.orca`, `.orca/`, `orca.yaml`, `orca-plugin.json`
- wire/protocol values: bare `'orca'` provider, `orca:<channel>` event names, `X-Orca-Agent-Hook-Token`
- Brand luôn viết hoa: **Wakii** / **Orca** (lowercase `orca` đơn lẻ trong locale values = CLI refs)

Chi tiết xem: AGENTS.md mục **Rebrand Wakii — never-touch list** + gate `node scripts/rebrand-verify.mjs`.

## 2 · UI tokens — cấm hex tự bịa

Mọi UI work (layout, color, typography, spacing, component) phải dùng token trong
`src/renderer/src/assets/main.css` (nguồn chuẩn) + shadcn primitives trong
`src/renderer/src/components/ui/`, theo `docs/STYLEGUIDE.md`. Không tự tạo giá trị màu,
font size, shadow tier khi token đã có vai tương ứng.

Chi tiết xem: kit skill `wakii-tokens-workflow` + `docs/STYLEGUIDE.md`.

## 3 · i18n — 12 locale, không ghép string

Không nối chuỗi khi ghép câu (dùng interpolation key của i18n). Test pseudo-locale trước khi ship.
Fork naming trong locale (`starWakii`…) phải sống sót qua merge — upstream rename sang `Orca` variants.

Chi tiết xem: skill `skills/i18n-ui-layout`.

## 4 · Commit — KHÔNG trailer AI

Không bao giờ đính trailer `Co-Authored-By: <AI>` vào commit (user ruling 04/10).
Conventional Commits: `<type>(<scope>): <subject>` — subject tiếng Việt, mệnh lệnh, không kết thúc bằng dấu chấm.

Chi tiết xem: AGENTS.md mục **Git Commit Message & Format**.

## 5 · Electron — verify UI nền qua CDP

Luôn chạy test và app do agent launch với `ORCA_BACKGROUND_LAUNCH=1`. Cấm steal focus:
không `show()`/`showInactive()`/`bringToFront()`/`app.focus()`. Screenshot renderer ẩn qua CDP.

Chi tiết xem: kit skill `electron-renderer` + AGENTS.md mục **Electron UI Validation**.
