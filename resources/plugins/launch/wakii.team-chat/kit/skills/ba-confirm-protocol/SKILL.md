---
name: ba-confirm-protocol
description: >-
  Protocol BA confirm nghiệp vụ khi Captain hỏi — tra KB TRƯỚC, trả lời kèm
  nguồn; không có trong KB → thành thật "chưa nắm, đang hỏi CEO", gom câu hỏi
  nhóm theo chủ đề, CEO trả lời thì ghi KB ngay rồi báo lại Captain.
  Use khi: Captain hỏi/confirm nghiệp vụ, rule, ý nghĩa yêu cầu; BA sắp trả
  lời câu hỏi nghiệp vụ nào đó; CEO vừa trả lời open question.
---

# ba-confirm-protocol — BA confirm nghiệp vụ cho Captain

## RULE CỐT LÕI (nguyên văn từ `kit/agents/ba.md` — không bao giờ vi phạm)

> **KHÔNG ĐOÁN BẤT CỨ ĐIỀU GÌ · NẮM MỌI rule+nghiệp vụ · CHƯA HIỂU → HỎI CEO**

CẤM trả lời cho có. Trả lời sai nghiệp vụ tệ hơn trả lời "chưa nắm" — Captain
dựa vào câu trả lời đó quyết định cả epic.

## Protocol 4 bước

### Bước 1 — Tra KB TRƯỚC

Nhận câu hỏi nghiệp vụ → mở KB project (`~/.claude/chat/kb/<project>.md`,
xem `kit/skills/ba-knowledge-base`) và tra mục liên quan. Tra trước, không trả
lời từ trí nhớ.

### Bước 2 — Có trong KB → trả lời + CITE NGUỒN

```
<Nội dung trả lời>
Nguồn: KB <project> — mục "<mục>", CEO chốt <ngày>
```

Cite nguồn là bắt buộc: Captain (và CEO khi soát) phải biết câu trả lời đến
từ quy tắc đã chốt hay từ ghi chú chưa xác nhận.

### Bước 3 — Không có trong KB → "chưa nắm, đang hỏi CEO"

- Trả lời Captain thành thật: "Chưa nắm mục này, đang hỏi CEO."
- Hỏi CEO: **gom câu hỏi, nhóm theo chủ đề** — không rải 10 tin rời; 1 tin
  nhóm theo mục (thuật ngữ / luồng / scope / edge case).
- Trả lời Captain đúng câu hỏi với trạng thái thật, không trả lời đại.

### Bước 4 — CEO trả lời → ghi KB NGAY + báo Captain

1. Ghi câu trả lời vào KB ngay (chuyển open question thành "Quy tắc đã CEO
   chốt" kèm ngày/nguồn — xem `kit/skills/ba-knowledge-base` §3).
2. Báo lại Captain câu trả lời đã có nguồn — vòng confirm đóng.

## Ví dụ phân biên

- ✅ "Checkout cần xác thực OTP cho đơn > 10tr — KB billflow mục 'Luồng chính',
  CEO chốt 07/11 room #orca-test."
- ✅ "Chưa nắm quy định hoàn tiền cross-border, đang hỏi CEO — sẽ báo khi có."
- ❌ "Hmm chắc là hoàn được, thông thường các sàn đều cho hoàn…" — ĐOÁN, cấm.

## Liên quan

- `kit/skills/ba-knowledge-base` — KB là nguồn tra ở Bước 1 và nơi ghi ở Bước 4.
- `kit/skills/ba-requirements-authoring` — yêu cầu chưa rõ nghiệp vụ đi qua
  protocol này TRƯỚC khi viết story.
- `kit/agents/ba.md` — nhiệm vụ gốc của BA.
