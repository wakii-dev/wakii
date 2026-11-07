---
name: ba-requirements-authoring
description: >-
  BA dịch yêu cầu CEO thành user stories (As a/I want/So that) + acceptance
  criteria Gherkin (Given/When/Then) ĐO ĐƯỢC; scope IN/OUT + edge cases
  nghiệp vụ liệt kê tách mục; yêu cầu chưa rõ → hỏi CEO qua ba-confirm-protocol
  TRƯỚC, không tự điền.
  Use khi: cần viết user story/acceptance criteria từ yêu cầu CEO, Mason cần
  criteria làm acceptance test, hoặc yêu cầu nhận được còn mơ hồ nghiệp vụ.
---

# ba-requirements-authoring — user stories + acceptance criteria

## RULE CỐT LÕI (nguyên văn từ `kit/agents/ba.md` — không bao giờ vi phạm)

> **KHÔNG ĐOÁN BẤT CỨ ĐIỀU GÌ · NẮM MỌI rule+nghiệp vụ · CHƯA HIỂU → HỎI CEO**

Story viết trên nền đoán = sai từ gốc: dev code đúng story sai, test pass trên
nghiệp vụ sai. Yêu cầu chưa rõ nghiệp vụ → đi qua
`kit/skills/ba-confirm-protocol` TRƯỚC, không tự điền cho có gì để viết.

## 1. Đầu vào hợp lệ

Chỉ viết story sau khi yêu cầu đã rõ trên 1 trong 2 nền:
- Quy tắc/quyết định CEO đã chốt (có trong KB — xem `kit/skills/ba-knowledge-base`);
- Trả lời CEO mới cho chính câu hỏi đó (qua ba-confirm-protocol, Bước 4).

## 2. User story

Format bắt buộc:

```markdown
### US-<n>: <tên ngắn>
As a <vai>, I want <khả năng>, so that <giá trị nghiệp vụ>.
```

- `<giá trị nghiệp vụ>` phải trả lời được "tại sao" ở tầng nghiệp vụ, không
  phải tầng kỹ thuật.
- 1 story = 1 mối quan tâm; ghép nhiều ý → tách.

## 3. Acceptance criteria — Gherkin ĐO ĐƯỢC

```gherkin
Scenario: <tên tình huống>
  Given <trạng thái đầu cụ thể, kiểm chứng được>
  When  <hành động cụ thể>
  Then  <kết quả quan sát được, có giá trị so sánh được>
```

- **ĐO ĐƯỢC là bắt buộc** — Mason dùng trực tiếp làm acceptance test (xem
  `kit/agents/ba.md`). Criteria kiểu "hoạt động mượt", "UX tốt" = FAIL, viết lại.
- Số liệu phải có mốc rõ: "> 10 triệu", "≤ 3 giây", "đúng 1 email" — không
  "nhanh", "ít".
- Phủ cả nhánh lỗi (thất bại, từ chối, edge) — không chỉ happy path.

## 4. Scope + edge cases — liệt kê TÁCH MỤC

```markdown
## Scope IN
## Scope OUT
## Edge cases nghiệp vụ
- <tình huống> — <hành vi mong đợi / đang hỏi CEO>
```

- Edge case chưa rõ hành vi nghiệp vụ → ghi "đang hỏi CEO" kèm link câu hỏi,
  KHÔNG chọn hộ hành vi.
- Scope OUT ghi rõ để dev/test không tự mở rộng.

## Bẫy thật

- Yêu cầu CEO nói lời qua chat dễ thiếu điều kiện biên (số tiền, vai, thời
  điểm) — hỏi bổ sung qua ba-confirm-protocol, không chốt thay CEO.
- Criteria copy từ story project khác cho nhanh = đoán ngữ cảnh — mỗi mốc
  số phải có nguồn (KB/ngay trả lời CEO).
- "CEO đã duyệt tổng thể" ≠ mọi edge case đã rõ — duyệt tổng thể không trả
  lời thay edge case còn bỏ ngỏ.

## Liên quan

- `kit/skills/ba-confirm-protocol` — đường hỏi CEO cho mọi chỗ chưa rõ.
- `kit/skills/ba-knowledge-base` — nguồn quy tắc để neo criteria.
- `kit/agents/ba.md` — nhiệm vụ gốc của BA (Mason dùng criteria làm acceptance test).
