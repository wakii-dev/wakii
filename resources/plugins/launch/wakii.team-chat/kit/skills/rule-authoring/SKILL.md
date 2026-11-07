---
name: rule-authoring
version: 1.0.0
description: >-
  Hướng dẫn tạo rule chuẩn ECC cho scope team hoặc per-project: cấu trúc 5 chủ đề,
  frontmatter `paths:` bắt buộc, tờ khai báo rules/projects/<project>.json, đăng ký
  index, quy tắc nội dung chống trùng lặp. Use khi: "tạo rule", "thêm rule ECC",
  "rule cho project X", "ghi luật coding thành rule", "tờ khai báo rule", hoặc
  Captain review rule mới trước khi merge.
---

# rule-authoring — tạo rule chuẩn ECC

Nguồn ECC: https://github.com/affaan-m/ECC (MIT) — giữ cấu trúc NGUYÊN BẢN, **KHÔNG
sửa file ECC gốc** (dễ update upstream). Lớp phủ fork Wakii sống riêng ở
`rules/wakii-overlay.md` và áp cho MỌI file — luật fork chỉ viết vào overlay hoặc
rule per-project, không cài vào file ECC.

## 1. Cấu trúc ECC — 5 chủ đề (hoặc 1 chủ đề lẻ)

Mỗi thư mục ngôn ngữ/framework gồm 5 file theo chủ đề:

| File | Chủ đề |
|---|---|
| `coding-style.md` | đặt tên, format, immutability, cấu trúc hàm |
| `hooks.md` | hook/CI/git-hook phải có và cấm |
| `patterns.md` | pattern kiến trúc khuyến khích trong scope đó |
| `security.md` | luật bảo mật (secret, input, auth) |
| `testing.md` | ranh giới test, yêu cầu coverage, style test |

Một số thư mục có file lẻ thêm: `web/` có `design-quality.md` + `performance.md`,
`python/` có `fastapi.md`; `common/` gồm 10 file nền (thêm `agents`, `code-review`,
`development-workflow`, `git-workflow`, `performance`).

Frontmatter `paths:` là glob BẮT BUỘC — nó là nguồn thật cho bảng glob trong
`rules/README.md`, không có glob thì rule không bao giờ được load:

```markdown
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
```

Rule mở rộng một rule common thì khai báo ngay đầu body (sau frontmatter):
`> This file extends [common/coding-style.md](../common/coding-style.md) with ...` —
đọc người phải thấy ngay nền nào được mở rộng, không đoán.

## 2. Đặt file đúng nơi

- Ngôn ngữ/framework ECC có sẵn (`common/` `typescript/` `react/` `web/` `swift/`
  `python/`) → thêm vào thư mục đó theo chủ đề, giữ nguyên framing upstream.
- Wakii-specific / project-specific (không thuộc 6 thư mục trên) → thư mục mới
  `rules/<project>/` đặt theo tên project (ví dụ `rules/wakii-desktop/`), cùng
  cấu trúc 5 chủ đề, KHÔNG tạo thư mục trùng tên ngôn ngữ có sẵn.
- Một rule chỉ sống ở đúng 1 nơi; cần dùng ở scope khác → trỏ link, không copy.

## 3. Tờ khai báo per-project — `rules/projects/<project>.json`

Scope áp rule cho project khai bằng 1 tờ JSON, 1 tờ/project, thư mục
`rules/projects/` (tạo mới khi project đầu tiên):

```json
{
  "project": "mf-boilerplate",
  "applicable": ["common", "typescript", "react", "web"],
  "extraGlobs": ["app/**", "platform/**"],
  "overlay": "wakii-overlay.md"
}
```

- `project` — tên thư mục/toàn cục của project, trùng tên file không có đuôi.
- `applicable` — danh sách thư mục rule project này load (glob của chúng khớp
  file diff nào thì rule đó bật). Entry `wakii-overlay` = overlay fork.
- `extraGlobs` — glob riêng của project thêm vào bảng glob chung (ví dụ
  `app/**` của MF boilerplate). Rỗng `[]` nếu không có.
- `overlay` — luôn `"wakii-overlay.md"`; overlay áp cho MỌI file của mọi project.

Thêm entry tờ mới khi có project mới; sau khi tạo/sửa tờ: validate JSON parse +
mọi entry `applicable` trỏ đến thư mục tồn tại dưới `rules/` (hoặc đúng slug
overlay) — tờ trỏ thư mục chết thì rule load im lặng, không báo lỗi cho ai.

## 4. Đăng ký

- `rules/README.md` — thêm dòng bảng glob → rule (scope team-wide) và ghi nhận
  tờ khai báo mới trong mục Projects.
- Kit skill `rules-index` (bảng glob team-wide cho crew) — cập nhật bảng cùng
  nội dung khi rule là team-wide; rule per-project chỉ cần tờ + README.

## 5. Quy tắc nội dung

- 1 rule = 1 ý tưởng, kèm ví dụ WRONG/CORRECT (đúng format ECC: khối code
  pseudocode đúng/sai + rationale ngắn).
- Cite nguồn khi rule tổng hợp từ đợt sửa lỗi thật: `file:line` hoặc link commit.
- KHÔNG trùng rule có sẵn — grep trước khi viết:
  `rg -il "<từ-khóa-chủ-đề>" rules/` — trùng thì sửa rule cũ, không thêm file mới.
- KHÔNG trùng tri thức kit skills đã có — rule trỏ sang skill đó thay vì copy
  nội dung (một tri thức, một nhà; skill đổi thì rule không mục nát).

## 6. Quy trình 5 bước

1. Xác định scope: team-wide (thêm vào thư mục ECC có sẵn) hay per-project
   (thư mục `rules/<project>/` + tờ khai báo); chủ đề nào trong 5 chủ đề.
2. Viết rule: 1 ý tưởng + ví dụ WRONG/CORRECT; grep `rules/` trước để không trùng.
3. Frontmatter `paths:` glob chuẩn + dòng "extends common" nếu mở rộng common.
4. Đăng ký: `rules/README.md` (bảng glob + mục Projects nếu tờ mới) + kit
   `rules-index` nếu team-wide.
5. Review Captain: đúng nơi, đúng frontmatter, không trùng, tờ JSON validate
   pass — rồi mới tính là DONE.
