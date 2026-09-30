## NAV-20260930-1733-1 [open] Chốt REQUIREMENT-GAP B3 trong bracket LOCAL-1
Lý do: bracket ghi "chờ USER ruling" từ 19/09 — nếu ruling đã có (Linear-deferred
sạch = READY-TO-DONE) thì cập nhật bracket để mọi pass sau khỏi đoán; nếu chưa,
hỏi user 1 lần rồi ngừng nhắc.
## NAV-20260930-1733-2 [open] Epic DONE verdict LOCAL-1
Lý do: 3 SF shipped + CLOSE merge đã trên integration — epic treo chỉ tạo nhiễu.
## NAV-20260930-1733-3 [open] Smoke automation ca trực coordinator-pass
Lý do: story này là infra 24/7 — orchestration chết (guide-gate) không xác nhận
được cron còn sống; cần 1 lần smoke khi hồi phục.
