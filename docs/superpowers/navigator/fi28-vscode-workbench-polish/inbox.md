## NAV-20260930-1717-1 [open] Chạy verify-gates (task 9) trên tip merged FI-28
Lý do: 7/9 task đã merge lên wakii-dev nhưng task 9 (verify-gates-cdp-walkthrough) không có
dấu vết — thiếu bằng chứng verify trước khi tuyên bố epic xong.
## NAV-20260930-1717-2 [open] Đối sách task 6 sticky-scroll-probe (không thấy commit riêng)
Lý do: task 6 không có commit trên branch đích; cần xác nhận probe đã chạy (gộp vào task 7)
hoặc chạy bổ sung — nếu bỏ xót thì sticky-scroll chưa được probe trên 4 builders.
## NAV-20260930-1717-3 [open] Đóng vòng FI-28: mindmap pending→merged + linear FI-29 + epic DONE
Lý do: code đã trên cả 2 integration branches nhưng mindmap vẫn "pending" và Linear
rate-limited chưa đối chiếu — state ba nơi lệch nhau, cần khớp khi Linear hồi phục.
