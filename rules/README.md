# rules/ — ECC coding rules (load on-demand)

Rule ECC nguồn `affaan-m/ECC` (MIT), cấu trúc NGUYÊN BẢN — không sửa file gốc, dễ update upstream.
Lớp phủ fork Wakii: [`wakii-overlay.md`](./wakii-overlay.md) — áp cho MỌI file.

## Quy tắc load

**Agent đụng file nào → đọc rule có glob khớp TRƯỚC khi sửa.** Load on-demand theo bảng dưới —
KHÔNG nhét cả 39 file vào context; chỉ đọc đúng thư mục khớp glob của file diff, cộng `common/`
của chủ đề tương ứng và `wakii-overlay.md`.

## Bảng glob → rule

| Glob khớp file đang sửa | Đọc rule |
|---|---|
| `*.ts` `*.tsx` `*.js` `*.jsx` | [`typescript/`](./typescript/) |
| `*.tsx` `*.jsx`, `components/**`, `hooks/**`, `use-*.ts(x)` | [`react/`](./react/) (cộng `typescript/` nếu là TS) |
| `*.css` `*.scss` `*.html` `*.vue` `*.svelte`, UI components | [`web/`](./web/) |
| `*.swift` `Package.swift` | [`swift/`](./swift/) |
| `*.py` `*.pyi` (FastAPI: `app/**`, `*_api.py`) | [`python/`](./python/) |
| Mọi file | [`common/`](./common/) + [`wakii-overlay.md`](./wakii-overlay.md) |

Mỗi thư mục ngôn ngữ gồm 5–7 file theo chủ đề: `coding-style` · `hooks` · `patterns` ·
`security` · `testing` (web thêm `design-quality` + `performance`; python thêm `fastapi`).
`common/` gồm 10 file nền: `agents` · `code-review` · `coding-style` · `development-workflow` ·
`git-workflow` · `hooks` · `patterns` · `performance` · `security` · `testing`.

Frontmatter `paths:` của từng file là nguồn thật của glob — grep khi phân vân:

```sh
grep -A5 '^paths:' rules/typescript/coding-style.md
```

## Update upstream

Tải lại per-file qua contents API (giữ LF/UTF-8 nguyên bản), rồi rehash kit nếu file nào
nằm trong plugin launcher đã đóng gói. Overlay và README là file riêng — không bao giờ
sửa file ECC gốc.

## Projects — tờ khai báo rule per-project (1 room ↔ 1 issue; project ↔ tờ)

| Project | Tờ khai báo | Applicable |
|---|---|---|
| Wakii desktop | `rules/projects/wakii-desktop.json` | common, typescript, react, web, swift, python, overlay |
| MF boilerplate | `rules/projects/mf-boilerplate.json` | common, typescript, react, web (+ extraGlobs app/**, platform/**) |
| Wakii site | `rules/projects/wakii-site.json` | common, web |

Agent mở project nào → đọc tờ khai báo tương ứng → load đúng bộ rule theo applicable.

## Team ops
| Rule | Áp dụng |
|---|---|
| `team-ops/dispatch.md` | Quy trình điều phối worker — 5 điều chống spawn-fail/báo-nhầm (07/11) |
