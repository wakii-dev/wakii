---
name: ba-grilling
description: >-
  Phỏng vấn theo design tree cho đến khi shared understanding — upgrade của
  card [HỎI]. Mỗi round hỏi CẢ frontier (toàn bộ câu hỏi khả dụng ngay, câu
  nào kèm ĐÁP ÁN ĐỀ XUẤT, gõ "yes"/"a" = nhận đề xuất). Facts tự tra bằng
  tools/sub-agent, KHÔNG hỏi user điều tra được; chỉ DECISIONS mới đưa lên.
  Frontier rỗng = xong — không còn gì ngầm giả định.
  Use khi: Captain cần CEO chốt nghiệp vụ/decisions trước khi trình plan,
  BA cần CEO bổ sung kiến thức thiếu, hoặc bất kỳ design/decision nào có
  nhiều nhánh phụ thuộc chưa rõ.
---

# ba-grilling — phỏng vấn design tree (mỗi round = 1 card [HỎI])

Nguyên tắc: **hỏi cho khít rồi mới hành động** — câu hỏi rời rạc từng cái một
làm CEO trả lời thiếu ngữ cảnh; đoán thay câu hỏi làm cây design mọc trên
giả định. Grill = làm việc theo CÂY: mỗi decision là 1 nhánh, decision đã chốt
mở khóa các decision con treo dưới nó.

## 1. Dựng cây trước khi hỏi

Liệt kê mọi decision của việc đang làm + các nhánh phụ thuộc. Từ cây tính
**frontier** — mọi decision mà các tiền đề của nó ĐÃ chốt hết (câu hỏi có thể
hỏi NGAY mà không phải đoán). Question phụ thuộc câu chưa trả lời → để round
sau, KHÔNG nhét vào round này.

## 2. Trước mỗi round: tự tra facts

Câu frontier nào chỉ cần FACT (đường dẫn, config, schema, số liệu) → tự chạy
lệnh/grep/sub-agent để tra. CẤM đưa fact tra được lên card hỏi CEO. Chỉ
DECISION (lựa chọn có hậu quả) mới vào frontier — và decision nào phụ thuộc
fact đang tra → câu đó chờ, phần còn lại của frontier hỏi bình thường.

## 3. Round = 1 card [HỎI] đầy frontier

Mỗi round gom TOÀN BỘ frontier vào 1 card `team-chat ask` (CEO trả lời 1 lượt
kiểu `1a 2yes` — không hỏi rải rác):

```bash
~/.claude/bin/team-chat ask "1. <câu hỏi>? (a) <hướng A> (b) <hướng B>
2. <câu hỏi>? (a) <hướng A> (b) <hướng B>" --from captain --role captain
```

- **Mỗi câu kèm ĐÁP ÁN ĐỀ XUẤT**: viết câu hỏi sao cho trả lời `yes`/`(a)`
  = nhận đề xuất của mình. Đề xuất phải có lý do ngắn trong tiêu đề câu hỏi.
- Đánh số mỗi câu, 1 câu 1 ý, không câu ghép.
- Gửi xong → CHỜ. Không tự suy diễn câu CEO chưa trả lời.

## 4. Cập nhật cây sau mỗi round

Câu trả lời chốt decision → mở khóa nhánh con → tính lại frontier → round kế
(gồm cả câu mới mở khóa). Lặp đến khi frontier rỗng.

## 5. Frontier rỗng = xong — nhưng chưa hành động

Frontier rỗng nghĩa là mọi nhánh đã đi, không còn gì ngầm giả định. Trước khi
hành động: tóm tắt shared understanding (các decision đã chốt, 1 dòng mỗi
câu) → chờ CEO confirm câu tóm tắt đó → MỚI chạy. Tóm tắt bị sửa ở đâu →
quay lại cây, cập nhật nhánh đó, chạy tiếp vòng grill nếu sửa mở ra decision
mới.

## Áp dụng

| Ai | Khi nào |
|---|---|
| Captain | hỏi CEO nghiệp vụ/decisions trước khi trình plan — thay vì [HỎI] rời rạc nhiều lần |
| BA | thiếu kiến thức nghiệp vụ → grill CEO theo cây, ghi kết vào KB ngay sau mỗi round |
| Worker | brief mù mờ → grill qua room trước khi code, KHÔNG tự điền cho khít |

## Cấm

- Hỏi fact tra được (grep/tool có đáp án).
- Nhét câu phụ thuộc câu chưa trả lời vào cùng round.
- Hành động sau round cuối mà không có bước confirm shared understanding.
- Tự trả lời hộ CEO câu chưa được trả lời.
