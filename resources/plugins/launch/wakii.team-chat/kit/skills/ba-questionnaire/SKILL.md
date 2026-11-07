---
name: ba-questionnaire
description: >-
  Biến đống open questions chưa trả lời được thành questionnaire chuẩn gửi
  1 người trả lời async (1 lượt). 'Grill the send, not the subject': chỉ hỏi
  NGƯỜI GỬI về recipient (ai trả lời, họ biết gì mà ta không) + cần gì về
  lại — câu hỏi trong doc nhắm đúng GAP đó. Most-important-first vì async có
  thể chỉ được 1 pass; nhóm ## theo theme khi câu > vài câu.
  Use khi: BA gom open questions từ KB gửi CEO định kỳ (mô hình C — batch
  tuần, mặc định thứ 2 sáng), hoặc bất kỳ lúc nào cần gom câu hỏi thăm dò
  kiến thức một người khác nắm.
---

# ba-questionnaire — questionnaire chuẩn BA batch tuần

Nguyên tắc: **grill the send, not the subject.** Người soạn questionnaire có
thể trả lời mọi câu về VIỆC GỬI (gửi ai, cần gì về lại) — hỏi họ về nội dung
đồng nghĩa tự điền câu hỏi thay người trả lời. Câu hỏi trong doc phải nhắm
GAP: thứ recipient biết mà người gửi không.

## 1. Grill phần gửi (2 trao đổi, không hơn)

- **Gửi ai?** — vai, chuyên môn, quan hệ với người gửi. Xong = biết recipient
  là ai + họ biết gì mà mình không.
- **Cần gì về lại?** — danh sách cụ thể decision/fact người gửi cần chốt sau
  khi nhận câu trả lời. Xong = có danh sách "phải walk away với thứ này".

BA batch tuần: bước này gần như cố định — recipient là CEO, cần về lại =
đóng các open question trong KB để BA confirm nghiệp vụ cho Captain không
phải đoán.

## 2. Gom GAP từ KB

Đọc open questions trong `docs/knowledge/<project>.md` (mục Open questions).
Chỉ giữ câu nhắm đúng GAP ở bước 1: CEO biết mà BA không thể tự tra. Câu
docs/repo/code trả lời được → BA tự học (mô hình C), bỏ khỏi questionnaire.

## 3. Viết questionnaire

File `<slug>-questionnaire.md` trong thư mục làm việc (batch tuần của BA:
gom vào KB thư mục `questionnaires/` cạnh KB project), theo mẫu:

```markdown
# <Tiêu đề questionnaire>

**Purpose:** questionnaire này tồn tại vì gì + decision nào đang nhờ nó.

**From:** <người gửi> · **To:** <recipient> · **Câu trả lời dùng để:** <chỗ nào>

## Ngữ cảnh

1 đoạn định vị người chưa trong cuộc — đủ để trả lời tốt, không cả trang.

## Cách trả lời

Deadline + effort ước lượng. Trả lời dở và "tôi không chắc" đều có giá trị:
gắn dấu bất chỗ nào không chắc thay vì bỏ qua.

## <Theme 1>

### <Câu hỏi 1>?

_Why this matters: <1 dòng — chỉ khi câu dễ bị đọc lệch hoặc trả lời cho có>_

>
(mỗi câu 1 ý, KHÔNG câu ghép; quan trọng nhất lên đầu)

## Còn gì nữa?

Câu hứng tất cả: điều gì ta chưa hỏi mà nên biết?
```

- **Most-important-first**: async = có thể chỉ được 1 pass — câu chặn quyết
  định lớn nhất phải lên đầu mỗi theme.
- Nhóm `##` theo theme khi tổng câu > vài câu.
- Mỗi câu kèm chỗ trống `>` để điền — không để câu trần.

## 4. Gửi + đóng vòng

Gửi đúng nhịp (batch tuần: thứ 2 sáng; CEO đổi được). Câu trả lời về → BA
ghi vào KB ngay (kèm ngày/nguồn) và gạch open question tương ứng; câu bị bỏ
qu trả lời → giữ trong questionnaire tuần kế, KHÔNG tự điền cho khít.

## Cấm

- Hỏi người gửi những thứ chỉ recipient trả lời được (grill the send thôi).
- Câu ghép 2 ý trong 1 câu hỏi.
- Đặt câu theo thứ tự tiện soạn thay vì theo độ quan trọng.
- Gửi rồi coi như xong — không có vòng đóng KB thì questionnaire là rác.
