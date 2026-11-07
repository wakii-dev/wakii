---
name: ba-teach-workspace
description: >-
  Cấu trúc KB của BA theo pattern teach-workspace: MISSION.md (lý do học —
  grounding cho mọi điều học), learning-records dạng ADR (insight phi-trực
  quan, có thể revise), reference cheat sheets (tinh chất đọng để tra nhanh),
  zone of proximal development (học tiếp điều vừa đủ thách thức).
  KB nghiệp vụ docs/knowledge/<project>.md GIỮ NGUYÊN vai trò nguồn sự thật —
  skill này chỉ BỔ SUNG cấu trúc learning-records quanh nó.
  Use khi: BA bắt đầu học project/đề tài mới, session học định kỳ (batch
  tuần), insight học được cần ghi để session kế tiếp tiếp, hoặc KB phẳng
  không biết học tới đâu.
---

# ba-teach-workspace — KB của BA nâng cấp theo pattern teach

Nguyên tắc: **học là trạng thái nhiều session** — insight chỉ nằm trong đầu
session này thì session kế học lại từ đầu. Workspace biến việc học thành
artifact tích lũy: mỗi session học thêm 1 chút, ghi lại 1 record, biết được
mình đang ở đâu.

## Cấu trúc workspace

Tự rễ tại thư mục học (`docs/knowledge/teach/<đề-tài>/`; đề tài gắn 1 project
thì đặt cạnh KB của project đó):

```
<đề-tài>/
├── MISSION.md            # LÝ DO học — grounding mọi điều học
├── NOTES.md              # sở thích cách học + ghi chú làm việc của BA
├── learning-records/     # 0001-<dash-case>.md — ADR của việc học
│   └── 0001-<ten>.md
└── reference/            # cheat sheets — tinh chất đọng để tra nhanh
    └── <chu-de>.md
```

## MISSION.md — ghi đầu tiên, revisable

Lý do BA/đội cần học đề tài này — dùng để grounding: điều gì học được mà không
phục vụ mission = kiến thức trang trí. Mission chưa rõ → HỎI CEO trước khi học
(KHÔNG đoán mission). Mission đổi khi học sâu hơn → cập nhật MISSION.md + ghi
1 learning record mới về lý do đổi, confirm CEO trước khi đổi nếu mission do
CEO đặt.

## learning-records/ — ADR của việc học

Số thứ tự tăng dần (`0001-`, `0002-`…), mỗi record 1 insight PHI-TRỰC QUAN
hoặc bài học CÓ THỂ REVISE sau — không ghi điều ai đọc docs cũng biết (cái đó
vào KB project). Mẫu:

```markdown
# 0001 - <tên insight>

<Insight 1-2 câu. Nguồn: học từ đâu (docs/code/CEO — kèm ngày).>

**Revise khi:** <dấu hiệu nào xuất hiện thì insight này sai/cần sửa>
```

Record NGUỒN CEO là cao nhất (ghi kèm ngày như KB project). Record mâu thuẫn
nhau → record mới ghi rõ nó sửa record nào.

## reference/ — cheat sheets

Tinh chất đọng của việc học: thuật ngữ (glossary), quy trình tóm tắt, bảng
đối chiếu. Khác learning-record: record là insight + lý do; reference là
tài liệu tra nhanh KHÔNG kể chuyện. Glossary một khi lập ra → dùng từ đó
NHẤT QUÁN trong mọi record và cheat sheet sau.

## Zone of proximal development — session kế học gì

Đầu mỗi session học: đọc learning-records → chọn điều học KẾ tiếp vừa đủ
thách thức (nếu học ngay bây giờ: hơi khó nhưng làm được với hỗ trợ — không
quá dễ thành nhàm, không quá xa thành vô nghĩa). Chưa có record nào → bắt
đầu từ điều nền tảng nhất phục vụ MISSION.md.

## Tích hợp KB hiện có

`docs/knowledge/<project>.md` GIỮ NGUYÊN vai trò — vẫn là nguồn sự thật
nghiệp vụ (rule CEO chốt, domain model, open questions). Workspace teach
không thay thế nó:

- Rule/ng fact CEO chốt → KB project (như cũ, qua ba-knowledge-base).
- Insight quá trình học + mission + cheat sheet → workspace teach.
- Hai chỗ dẫn nhau bằng path; không chép lại nội dung qua lại.

## Cấm

- Học không mission (không biết học để làm gì thì dừng lại hỏi trước).
- Record ghi điều rõ ràng ai đọc docs cũng thấy — chỉ insight phi-trực quan.
- Chép nội dung KB project vào workspace teach (hoặc ngược lại).
- Bỏ qua zone of proximal development — học tuỳ hứng theo thứ tự gặp gì học nấy.
