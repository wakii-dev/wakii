## NAV-20260930-1719-1 [open] Launch SF-1 FI-30 đúng tier — task 1 pin base trước
Lý do: SF chưa start; branch đích chung đang tiến (VU-14 docs, FI-28 code) — pin base
227081995d+ là tiền đề của mọi offset/CRLF logic phía sau.
## NAV-20260930-1719-2 [open] Tránh xung đột trên branch chung feature/clone-vs-vscode
Lý do: 3 story + VU-14 docs cùng đích; launch FI-30 đè thời điểm FI-28 verify
→ nên tuần tự hoặc nhánh riêng rồi merge theo thứ tự.
## NAV-20260930-1719-3 [open] Đối chiếu linear FI-31 khi Linear hồi phục
Lý do: rate-limit che states — approve/launch thiếu đối chiếu issue-side dễ dispatch trùng.
