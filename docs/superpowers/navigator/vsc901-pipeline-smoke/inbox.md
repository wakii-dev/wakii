## NAV-20260930-1728-1 [open] Chạy smoke SF-1 VSC-901 một lần duy nhất khi automation sống
Lý do: story TEST chưa start (không branch/worktree); mục đích là bằng chứng pipeline
chạy được — chạy 1 lần, không lặp.
## NAV-20260930-1728-2 [open] Đóng/xoá mindmap test sau khi smoke xong
Lý do: story test nằm trong danh sách active chung sẽ nhiễu mọi pass navigator
sau (13 story quá tải ở những story chết).
## NAV-20260930-1728-3 [open] Ghi blocked-by-automation nếu vscode-sync chết
Lý do: smoke là của automation vscode-sync — nếu automation không sống, không
launch tay thay; ghi trạng thái để pass sau không thắc mắc.
