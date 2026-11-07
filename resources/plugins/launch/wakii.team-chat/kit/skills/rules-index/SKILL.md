---
name: rules-index
description: Chỉ mục rule coding ECC trong rules/ của repo (nguồn affaan-m/ECC, MIT) + overlay Wakii. Use khi sắp sửa, review, hoặc viết test cho file code — đọc rule có glob khớp file TRƯỚC khi sửa; KHÔNG nhét cả bộ rule vào context.
---

# rules-index — load rule theo glob, on-demand

Rule sống ở `rules/` ở root repo (cấu trúc ECC NGUYÊN BẢN — không sửa file gốc, dễ update upstream).
Lớp phủ fork: `rules/wakii-overlay.md` — áp cho MỌI file.

## Quy tắc

1. **Đụng file nào → đọc rule có glob khớp TRƯỚC khi sửa.**
2. Load on-demand theo bảng — chỉ đọc đúng thư mục khớp + `common/` của chủ đề tương ứng + overlay.
   KHÔNG bao giờ đọc cả 39 file vào context.
3. Review code: diff vi phạm rule nào trong `rules/` phải cite `file:line`.

## Tờ khai báo per-project — `wakii.yaml`

Project có file `wakii.yaml` ở root với section:

```yaml
rules:
  declaration: rules/projects/<project>.json
```

→ đọc ĐÚNG tờ khai báo đó (path tương đối root) thay vì đoán: chỉ load các thư mục
rule trong `applicable` của tờ + `extraGlobs` của nó (overlay vẫn áp mọi file).
Không có `wakii.yaml` (hoặc thiếu section `rules`) → fallback tờ mẫu trong
`rules/projects/` — tờ nào có glob khớp file đang sửa thì load tờ đó.

## Bảng glob → rule

| File đang sửa | Đọc |
|---|---|
| `*.ts` `*.tsx` `*.js` `*.jsx` | `rules/typescript/` (5 file) |
| `*.tsx` `*.jsx`, `components/**`, `hooks/**`, `use-*.ts(x)` | `rules/react/` (cộng `rules/typescript/` nếu là TS) |
| `*.css` `*.scss` `*.html` `*.vue` `*.svelte`, UI components | `rules/web/` (7 file — có `design-quality` + `performance`) |
| `*.swift` `Package.swift` | `rules/swift/` (5 file) |
| `*.py` `*.pyi` (FastAPI: `app/**`, `*_api.py`) | `rules/python/` (6 file — có `fastapi`) |
| Mọi file | `rules/common/` (10 file) + `rules/wakii-overlay.md` |

Frontmatter `paths:` là nguồn thật — grep khi phân vân: `grep -A5 '^paths:' rules/typescript/coding-style.md`

Chi tiết xem: `rules/README.md`.
