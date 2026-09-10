---
surface: kit-manifest-schema (kit-manifest.schema.json — binEntry additionalProperties)
old: schema không có alias_of (field lạ trên binEntry)
new: binEntry chấp nhận optional `alias_of: string` + provides[] có story-surface-lint (kit 2.4.0)
expires: 2026-12-09
owner: wakii (kit author)
---

# Migration guide: kit-manifest schema 2.3.x → 2.4.0 (bounded rewrite doctrine)

## What changed

Constitution VI mở rộng doctrine bounded rewrite (GH-30): rename surface công khai
đòi alias declaration + migration guide + expiry. Chính story này là consumer đầu
tiên — schema PIN `additionalProperties: false` của binEntry được MỞ thêm field
optional `alias_of`, và kit.json thêm bin `story-surface-lint` + bump 2.3.1 → 2.4.0
(schema mở là minor). Guide này chính nó là vật chứng L3/L4 của lint: dogfood test
đầu tiên của doctrine.

## Old→New map

| Old | New | Notes |
| --- | --- | --- |
| kit.json không có field `alias_of` trên binEntry | binEntry `alias_of: <tên cũ>` (optional) | alias chỉ trỏ — không mang logic, không nhận feature mới |
| kit 2.3.1 | kit 2.4.0 | minor: schema mở optional field + thêm bin mới, không breaking |
| expiry không tồn tại | `expires: YYYY-MM-DD` ở frontmatter guide này (một nguồn duy nhất) | `alias_of` KHÔNG mang ngày |

## Migration steps

1. Người maintain kit: khi rename bin/provides sau version này, thêm
   `"alias_of": "<tên-cũ>"` vào entry mới trong kit.json + tạo guide từ
   `kit/migration-guide-template.md` đặt expiry `YYYY-MM-DD`.
2. Người dùng kit cài local: không cần hành động gì — `alias_of` là metadata,
   runtime resolve hoãn; kit 2.4.0 cài đè như mọi bump (marker version tự cập nhật).
3. Chạy `story-surface-lint <base-ref>` trước merge khi đụng kit.json / kit/bin /
   docs meta.json — exit 1 có token `MISSING-*` / `BAD-DATE` / `EXPIRED` là thiếu
   vật chứng; `story-verify` gọi tự động (bước B2b).

## Notes

- Guide này track trong git (review P1-1: .gitignore negation `!docs/superpowers/migrations/`
  — nếu không, lint L3 không bao giờ thấy guide qua diff → MISSING-GUIDE vĩnh viễn).
- Hết hạn 2026-12-09: nếu `alias_of` chưa được dùng thật (chưa có rename thứ 2),
  cân nhắc chốt lại schema; nếu đã dùng — xoá alias hết hạn + entry tương ứng
  trong một commit.
- Convention lint-only: kit `alias_of` là metadata (runtime resolve hoãn đến khi
  làm install shim); docs `redirect_to:` là frontmatter convention (redirect thật
  hoãn đến `redirects()` implementation) — Principle VII, chưa đau.
