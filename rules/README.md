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

## Projects — tờ khai báo per-project

Project nào load nhóm rule nào khai bằng 1 tờ JSON dưới [`rules/projects/`](./projects/)
(format + cách tạo: kit skill `rule-authoring`; thêm 1 tờ khi có project mới):

| Tờ | Project | `applicable` | `extraGlobs` |
|---|---|---|---|
| [`wakii-desktop.json`](./projects/wakii-desktop.json) | wakii-desktop | common, typescript, react, web, swift, python, wakii-overlay | — |
| [`mf-boilerplate.json`](./projects/mf-boilerplate.json) | mf-boilerplate | common, typescript, react, web | `app/**`, `platform/**` |
| [`wakii-site.json`](./projects/wakii-site.json) | wakii-site | common, web | — |

Format tờ: `{project, applicable: [thư mục rule], extraGlobs: [glob riêng project], overlay: "wakii-overlay.md"}`.
Mọi tờ khai `overlay` — quy tắc load vẫn là overlay áp cho MỌI file. Rule riêng của
1 project đặt ở thư mục `rules/<project>/`, không trộn vào thư mục ECC chung.

Frontmatter `paths:` của từng file là nguồn thật của glob — grep khi phân vân:

```sh
grep -A5 '^paths:' rules/typescript/coding-style.md
```

## Update upstream

Tải lại per-file qua contents API (giữ LF/UTF-8 nguyên bản), rồi rehash kit nếu file nào
nằm trong plugin launcher đã đóng gói. Overlay và README là file riêng — không bao giờ
sửa file ECC gốc.
