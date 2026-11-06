---
name: token-review
description: Biến token usage đắt (team-usage) thành đề xuất sửa context pack/brief cho dispatch kế — theo mate, task đốt nhiều token thường là project không nói cho crew những gì nó cần. Use khi team-usage --top thấy dispatch bất thường, worker blocked/hỏi nhiều, hoặc trước khi tái dispatch cùng task. KHÔNG mở transcript worker trần — chỉ tổng số liệu từ bin.
---

# TOKEN REVIEW — usage đắt → sửa brief (Captain)

> Triết lý mate: *"task đốt nhiều token thường là project không nói cho crew
> những gì nó cần."* Token đắt không phải lỗi của worker — là lỗi của brief.
> Output của review này = đề xuất sửa context pack, KHÔNG phải lời phê worker.

## Nguyên tắc

1. **Chỉ tổng số liệu từ bin** (`team-usage --top` / `--why <pane>`). CẤM mở
   transcript session jsonl của worker để "đọc hộ" — số liệu đã đủ chẩn đoán,
   transcript trần là đốt token của chính captain.
2. **Mỗi con số → 1 giả thuyết → 1 đề xuất sửa brief** — không dừng ở "worker
   đốt nhiều", phải chỉ ra câu nào trong brief thiếu/sai.
3. Sửa brief xong mới tái dispatch — tái dispatch brief cũ = đốt lại đúng chỗ cũ.

## Chẩn đoán — số liệu → giả thuyết → đề xuất

| Dấu hiệu (từ `team-usage --why`) | Giả thuyết | Đề xuất sửa brief |
|---|---|---|
| `in`/`cacheR` khổng lồ, round-trips cao | Worker phải tự khảo sát codebase vì brief không chỉ file/entry point | Liệt kê sẵn file + hàm + dòng liên quan vào brief (context pack `team-session-brief`) |
| `BLOCKED` > 0 hoặc `hỏi` > 0 | Mục tiêu mơ hồ / thiếu quyền hoặc thông tin quyết định | Chốt sẵn lựa chọn trong brief (hoặc ghi rõ "quyền tự quyết: X"); bỏ mỏ neo gây hỏi |
| `cacheW` lớn lặp lại mỗi round-trip | Brief/context pack quá dài hoặc thay đổi giữa chừng | Cắt brief xuống phần đắt giá thật; giữ context ổn định từ đầu, không bổ sung dần |
| `dur` dài mà `msgs` thấp | Task quá rộng cho 1 dispatch | Chia nhỏ task; mỗi dispatch 1 outcome đo được (hand-back ①②③) |
| `total` nhỏ nhưng vẫn treo lâu | Worker stall (không phải token) | Không phải review này — skill crew-recovery (state → peek → respawn) |

## Quy trình

1. `~/.claude/bin/team-usage --room <room> --top 3` — rank dispatch đắt nhất
   (rank theo `in+out+cacheW`; `cacheR` rẻ, chỉ đọc để thấy scale).
2. Với dispatch bất thường (top 1-2 hoặc blocked > 0): `team-usage --why <pane>`.
3. Đối chiếu từng dòng số liệu với bảng chẩn đoán trên → chọn giả thuyết.
4. Đọc brief gốc đã nạp cho worker đó (source: `team-session-brief` + tin
   `worker-start` trong room) — chỉ ra câu/đoạn gây giả thuyết đó.
5. Viết đề xuất sửa brief cụ thể (thêm gì, bỏ gì, chốt gì) — post vào room
   dạng tin ngắn; tái dispatch với brief đã sửa.

## Khi nào KHÔNG phải lỗi brief

- Task thật sự lớn (khảo sát epic mới) → `in` cao là chính đáng; chỉ cần chia
  nhỏ dispatch, không cắt context.
- Worker mới spawn đang nạp kit/skills lần đầu (cacheW đợt đầu) → 1 lần, không
  lặp lại ở round-trip sau là bình thường.
