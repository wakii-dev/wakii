---
surface: <tên surface bị rename — kit-provides / kit-bin / docs-route / config-key>
old: <tên cũ>
new: <tên mới>
expires: YYYY-MM-DD
owner: <ai chịu trách nhiệm alias>
---

# Migration guide: <old> → <new>

## What changed

<Một đoạn: surface nào đổi tên, tại sao, từ version nào. Alias cũ chỉ trỏ —
single source of truth ở tên mới; alias không nhận feature mới (maintenance mode).>

## Old→New map

| Old | New | Notes |
| --- | --- | --- |
| `<old>` | `<new>` | <ghi chú ngắn nếu có> |

## Migration steps

1. <bước 1 — người dùng surface cũ làm gì>
2. <bước 2>
3. <bước 3 — update tham chiếu trong code/docs/scripts của họ>

## Notes

- Alias hết hạn `expires` ở frontmatter → lint FAIL nhắc xoá; xoá alias cùng lúc
  xoá mục tương ứng (entry `alias_of`, file guide) — một commit.
- Alias KHÔNG mang logic: runtime resolve của alias là convention (kit `alias_of`
  là metadata, docs `redirect_to:` là frontmatter) — shim thật chỉ làm khi đau.
