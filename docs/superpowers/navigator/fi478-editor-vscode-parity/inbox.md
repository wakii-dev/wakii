## NAV-20260930-1732-1 [open] Sao lưu story branch FI-478 lên remote
Lý do: 15 commits SF-1 (code + review verdict + evidence) chỉ ở local —
một sự cố branch/máy là mất toàn bộ; push tên hợp convention.
## NAV-20260930-1732-2 [open] Backfill linear IDs 6 SF FI-478 khi Linear hồi phục
Lý do: `linear:` rỗng trong bracket — automation đọc sẽ sinh id giả
(memory đã index); cần id thật trước khi launch SF tier 1.
## NAV-20260930-1732-3 [open] Verdict SF-1 chốt rồi launch SF-2 theo tier
Lý do: SF-1 đã fix P1 + có evidence; reviewer hậu-chứng xác nhận verdict là
tiền đề launch SF-2 (memory merge-trước-review); probe run-list trước approve
để tránh lặp sự cố 2 runs song song.
