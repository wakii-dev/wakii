---
name: session-handoff
description: >-
  Nén conversation hiện tại thành handoff document cho agent/session kế
  nhận việc: trạng thái đang làm · next steps · suggested skills (skill
  agent kế nên invoke) · redact secrets/PII. KHÔNG trùng nội dung đã có ở
  specs/KB/rules — chỉ tham chiếu path. Lưu chỗ tạm OS-agnostic
  ($TMPDIR || /tmp).
  Use khi: Captain restart/chuyển session, bàn giao worker cho worker kế,
  bàn giao room, hoặc kết turn mà việc dở dở dang dang cần ai đó tiếp.
---

# session-handoff — handoff doc chuẩn khi restart/chuyển session

Nguyên tắc: **agent kế chỉ biết những gì nằm trong file** — conversation hiện
tại chết cùng session. Handoff doc là cây cầu duy nhất; viết nó như viết cho
người lạ có repo nhưng không có ngữ cảnh cuộc trò chuyện.

## 1. Xác định người nhận

Có argument/brief của người bàn giao → dùng nó định hướng doc (việc kế tập
trung gì). Không có → viết cho trường hợp chung: "session kế tiếp việc này".

## 2. Viết doc — 4 mục bắt buộc

Ghi file vào chỗ tạm OS-agnostic (`$TMPDIR` nếu có, không thì `/tmp`; không
bao giờ ghi vào workspace — handoff là văn bản tạm, không phải sản phẩm):

```markdown
# Handoff: <việc đang dở>

## Trạng thái đang làm
<Việc đứng ở đâu NGAY LÚC HANDOFF: bước cuối đã chạy, lệnh đang treo,
file đã sửa chưa commit, gate đang chờ ai duyệt.>

## Next steps
<Việc kế tiếp, đánh số, mỗi việc 1 dòng hành động được. Việc kế làm đầu tiên
để lên đầu.>

## Suggested skills
<Skill agent kế nên invoke qua Skill tool, mỗi skill 1 dòng + vì sao.
Chỉ liệt kê skill thật sự cần — không treo đủ bộ.>

## Ngữ cảnh + tham chiếu
<Quyết định đã chốt và LÝ DO — thứ không nằm trong bất kỳ file nào.
Mọi thứ ĐÃ có chỗ khác: KHÔNG chép lại, chỉ tham chiếu path/link —>
spec/plan/KB/rule/ADR/commit/diff. Doc trùng nội dung file khác = hai nguồn
sự thật, cái nào stale cũng lừa người đọc.>
```

## 3. Redact trước khi gửi

Quét doc lần cuối: API key, token, password, PII (email/số điện thoại/tài
khoản thật) → thay `<REDACTED-<loại>>` kèm chỉ dẫn lấy ở đâu (vault/env/1Password)
nếu người nhận cần. Handoff nằm ở /tmp — file tạm cũng không được chứa secret.

## 4. Trình bày handoff

Bàn giao = gửi path của doc + 1 dòng tóm tắt việc dở. Người nhận việc đầu
tiên: đọc doc + mở các path tham chiếu, rồi mới hành động. Nếu nhận qua
team-chat/room: gửi path (file nằm ngoài repo, không attach được → kèm nội
dung doc trong tin nếu room là kênh duy nhất).

## Cấm

- Chép lại nội dung specs/KB/rules đã có — chỉ tham chiếu path.
- Ghi secret/PII vào doc.
- Lưu doc vào workspace/repo (đây là văn bản tạm).
- Bàn giao mà không có doc ("tôi nhắn lời" = mất cùng session).
