---
name: ba-knowledge-base
description: >-
  Xây + giữ knowledge base nghiệp vụ cho BA — 1 file/project, ghi mọi rule
  CEO đã chốt kèm ngày/nguồn, thuật ngữ, domain model, luồng chính; open
  question chưa rõ KHÔNG điền cho khít.
  Use khi: BA bắt đầu project mới, CEO chốt rule/mạch nghiệp vụ mới cần ghi,
  open question được trả lời cần chuyển thành quy tắc, hoặc KB cần rà soát
  trước khi confirm cho Captain.
---

# ba-knowledge-base — KB nghiệp vụ của BA

## RULE CỐT LÕI (nguyên văn từ `kit/agents/ba.md` — không bao giờ vi phạm)

> **KHÔNG ĐOÁN BẤT CỨ ĐIỀU GÌ · NẮM MỌI rule+nghiệp vụ · CHƯA HIỂU → HỎI CEO**

KB là nơi "nắm mọi rule" trở thành hiện thực: kiến thức nằm trong FILE, không
nằm trong đầu — đổi session không mất. Mục nào chưa rõ thì ghi vào **Open
questions**, KHÔNG điền cho khít.

## 1. Nguồn học KB

| Nguồn | Ghi gì |
|---|---|
| CEO (room/chat) | Mọi rule/mạch nghiệp vụ CEO chốt — NGUỒN CAO NHẤT, ghi kèm ngày |
| docs/ của repo | Đặc tả, ADR, hướng dẫn hiện hành |
| code | Luồng thật đang chạy — ghi chú "đọc từ code, chưa CEO xác nhận" nếu chưa rõ ý định nghiệp vụ |
| Linear issue | Yêu cầu + acceptance criteria đã duyệt |
| Lịch sử room | Quyết định/context rơi vãi trong chat |

## 2. Format KB — 1 file/project

Vị trí đề xuất: `docs/knowledge/<project>.md`. Cấu trúc bắt buộc:

```markdown
# KB — <project>
## Domain model
## Thuật ngữ
| Term | Nghĩa | Nguồn |
|---|---|---|
## Luồng chính
## Quy tắc đã CEO chốt
- <rule> — CEO chốt <ngày> (nguồn: room #x / chat)
## Open questions đang hỏi CEO
- <câu hỏi> — hỏi <ngày>, chờ trả lời
```

## 3. Cập nhật KB (2 luồng bắt buộc)

1. **CEO chốt điều mới** → ghi NGAY vào "Quy tắc đã CEO chốt" kèm ngày + nguồn.
   Không gom để sau — sau là quên.
2. **Open question được trả lời** → chuyển entry sang "Quy tắc đã CEO chốt"
   (kèm ngày trả lời), xoá khỏi Open questions.

## 4. Rule không đoán áp vào KB

- Mục nào chưa rõ nghiệp vụ → ghi thẳng vào **Open questions**, để trống phần
  trả lời. KHÔNG điền "suy đoán hợp lý" cho khít trang.
- Kiến thức đọc từ code mà chưa CEO xác nhận → ghi rõ nhãn "từ code, chưa
  xác nhận" — không trộn lẫn với quy tắc đã chốt.

## 5. Bảo mật

**KHÔNG ghi data nhạy cảm vào KB**: token, API key, password, secret, PII.
KB là file dạng text sống trong `~/.claude/chat/` — mọi thứ ghi vào có thể
được nạp vào context của agent khác.

## Liên quan

- `kit/skills/ba-confirm-protocol` — Captain hỏi nghiệp vụ → tra KB theo
  protocol này trước khi trả lời.
- `kit/skills/ba-requirements-authoring` — viết user story phải dựa trên KB
  đã chốt, phần chưa rõ đi qua ba-confirm-protocol.
- `kit/agents/ba.md` — nhiệm vụ gốc của BA.
