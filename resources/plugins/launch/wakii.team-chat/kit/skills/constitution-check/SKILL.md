---
name: constitution-check
description: >-
  Validate nguyên tắc bất invariant ngược vào file spec/plan trước khi execute —
  đọc rules/wakii-overlay.md + AGENTS.md, check pattern cấm (trailer AI, hex tự
  bịa, metaKey hardcode, shell:true, child_process trực tiếp), quét marker
  **[CHƯA RỐ: …]** còn bỏ ngỏ. Script: kit/lib/constitution-check.mjs.
  Use khi: "check constitution", "validate spec", "kiểm ngược nguyên tắc",
  hoặc trước khi execute spec/plan do agent generate.
---

# constitution-check — kiểm ngược nguyên tắc bất invariant

Mượn 2 pattern github/spec-kit (MIT): constitution check + [NEEDS CLARIFICATION]
markers. Vi phạm nguyên tắc phát hiện ở tầng spec rẻ hơn 100× so với phát hiện ở
code đã merge — spec vi phạm = RED, không execute.

## Quy trình 4 bước

1. **Đọc rules** — script tự trích statement in đậm (line bắt đầu `**` hoặc
   `- **`) từ `rules/wakii-overlay.md` + `AGENTS.md` (root repo). Không đọc tay.
2. **Validate spec/plan** — chạy script lên file md cần validate:

   ```sh
   node --input-type=module -e "import {constitutionCheck} from '<kit>/lib/constitution-check.mjs';const r=constitutionCheck(process.argv[1]);console.log(JSON.stringify(r,null,2));process.exit(r.valid?0:1)" <spec.md>
   ```

   Output: `{valid, violations: [{rule, source, evidence}], markers}` —
   exit 1 = RED.
3. **Report violations** — mỗi violation có `rule` (statement nguyên tắc gốc) +
   `source` (file:line) + `evidence` (line spec vi phạm). Vi phạm → sửa spec
   ngay tại chỗ, chạy lại tới GREEN; không execute spec RED.
4. **Gắn heartbeat** — kết quả GREEN/RED + số marker chưa rỏ ghi vào room
   heartbeat (room-info `tcGate` pattern) để Captain nhìn thấy mà không mở spec.

## Marker [CHƯA RỐ]

Spec có thiếu thông tin cần CEO quyết → đánh dấu inline ngay khi generate, không
đoán thay:

```markdown
Retry policy: **[CHƯA RỐ: chọn retry 3 lần hay dead-letter queue]**
```

`markers` trong output gom lại thành card [HỎI] gửi CEO (qua ba-confirm-protocol
hoặc chat room). CEO trả lời → cập nhật spec (xóa marker, điền câu trả lời) →
chạy lại check. Spec execute được chỉ khi `valid: true` VÀ `markers` rỗng.

## Liên quan

- `kit/skills/rule-authoring` — nơi quy tắc sống + cú pháp marker.
- `kit/skills/ba-requirements-authoring` — marker dùng khi viết story/criteria.
- `kit/lib/constitution-check.mjs` — script (`extractImmutableRules`,
  `scanClarificationMarkers`, `constitutionCheck`).
