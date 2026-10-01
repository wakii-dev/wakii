## NAV-20260930-1717-1 [ack] Chạy verify-gates (task 9) trên tip merged FI-28
→ chấp nhận: đã chạy 30/09–01/10 — B1/B2b/B4 PASS + CDP 6/7; epic DONE (b2a424b41b)
Lý do: 7/9 task đã merge lên wakii-dev nhưng task 9 (verify-gates-cdp-walkthrough) không có
dấu vết — thiếu bằng chứng verify trước khi tuyên bố epic xong.
## NAV-20260930-1717-2 [ack] Đối sách task 6 sticky-scroll-probe (không thấy commit riêng)
→ chấp nhận: wiring + unit test là bằng chứng đủ; headful pass = G2 optional
Lý do: task 6 không có commit trên branch đích; cần xác nhận probe đã chạy (gộp vào task 7)
hoặc chạy bổ sung — nếu bỏ xót thì sticky-scroll chưa được probe trên 4 builders.
## NAV-20260930-1717-3 [ack] Đóng vòng FI-28: mindmap pending→merged + linear FI-29 + epic DONE
→ chấp nhận: mindmap ticked 01/10; Linear FI-29/epic ⏳ defer (workspace FI unreachable)
Lý do: code đã trên cả 2 integration branches nhưng mindmap vẫn "pending" và Linear
rate-limited chưa đối chiếu — state ba nơi lệch nhau, cần khớp khi Linear hồi phục.
## NAV-20260930-2330-4 [ack] Xác minh branch story/fi28-vscode-workbench-polish biến mất
→ từ chối (false alarm): branch sống trên remote wakii-dev — đã xác minh
Lý do: pass trước git log được branch này, pass nay unknown revision — cần biết xoá chủ động
hay bị dọn; nếu nhầm, khôi phục từ wakii-dev trước khi cần audit tip gốc.
Cập nhật 14:20: lần 2 liên tiếp unknown local; remote-tracking còn tip 2a73662b5b — branch
chỉ sống trên wakii-dev, giữ theo NAV-20261001-1122-14.
## NAV-20260930-2330-5 [ack] Chạy verify-gates (task 9) trên tip wakii-dev
→ chấp nhận (trùng NAV-20260930-1717-1): đã chạy
Lý do: code 7/9 task vẫn trên wakii-dev dù branch mất; task 9 chưa có bằng chứng verify —
chạy trên tip integration để đóng gate epic.
## NAV-20260930-2330-6 [open] Dọn state FI-28 khi Linear hồi phục (FI-29 + epic DONE + mindmap)
Cập nhật 01/10: mindmap đã ticked; còn Linear (FI-29/epic) — gộp ở NAV-20261001-1122-15
Lý do: mindmap "pending" ≠ merged, Linear rate-limited chưa đối chiếu — khớp 1 lần
khi Linear sống lại để epic đóng sạch.
## NAV-20261001-0223-7 [ack] Verify-gates task 9 trên tip wakii-dev — branch sống trên remote
→ chấp nhận (trùng NAV-20260930-1717-1): đã chạy
Lý do: `wakii-dev/story/fi28-...` đọc được qua remote-tracking ref — khuyến nghị "khôi phục
branch" trong NAV-20260930-2330-4/5 không còn cần; verify chạy thẳng trên tip wakii-dev.
## NAV-20261001-0223-8 [ack] Cập nhật mindmap FI-28 pending→merged/done (nguồn local)
→ chấp nhận: mindmap ticked 01/10 (b2a424b41b)
Lý do: 8/9 task đã commit trên branch đích nhưng mindmap vẫn "pending" toàn bộ —
mindmap là nguồn local độc lập Linear, sửa được ngay không cần chờ.
## NAV-20261001-0223-9 [ack] Đối chiếu FI-29 + epic DONE khi Linear hồi phục
→ cập nhật: epic DONE local 01/10; còn chờ Linear — theo dõi ở NAV-20261001-1122-15
Lý do: Linear rate-limited chặn đối chiếu SF; dựng epic DONE verdict sau khi
verify-gates (NAV-20261001-0223-7) có bằng chứng — gộp với NAV-20260930-2330-6.

## NAV-20261001-0524-10 [ack] Đối chiếu FI-29 Done + chốt epic FI-28 DONE verdict khi Linear hồi phục
→ chấp nhận: epic DONE local 01/10; Linear đối chiếu khi hồi phục
Lý do: SF-1 merged 8 commit task 1–8 trên wakii-dev nhưng Linear states rate-limited không đối chiếu được; epic treo "code xong, verdict chờ". Pass trước NAV-20261001-0223-9 cùng hướng chưa ack.

## NAV-20261001-0524-11 [ack] Giữ story/fi28-vscode-workbench-polish trên wakii-dev làm evidence merged
→ chấp nhận: branch giữ làm evidence; sau DONE việc dọn thuộc janitor rule
Lý do: nhánh chỉ tồn tại trên remote wakii-dev (không local/origin); xoá trước khi epic DONE = mất evidence merged duy nhất.

## NAV-20261001-0524-12 [ack] Sau verdict: epic DONE → dừng story; còn việc → launch SF kế probe run-list trước
→ chấp nhận: epic DONE → story dừng
Lý do: không sf-* worktree đang sống nên launch mới an toàn; fence fi478-two-session two-runs đòi probe run-list trước run-create.

## NAV-20261001-1122-13 [ack] Verify-gates task 9 trên tip wakii-dev — lần thứ n nhắc lại
→ chấp nhận (trùng): đã chạy — ngừng nhắc
Lý do: vẫn chưa có bằng chứng verify CDP walkthrough ở mọi pass trước; đây blocker duy nhất
chặn epic FI-28 DONE verdict. Nếu đánh giá bỏ — ghi rõ lý do vào inbox thay vì im lặng.
## NAV-20261001-1122-14 [ack] Cấm dọn `wakii-dev/story/fi28-...` trước epic DONE
→ chấp nhận: DONE rồi — cleanup branch giờ được phép theo rule
Lý do: branch chỉ còn remote-tracking (local + worktree mất); tip 2a73662b5b là evidence
merged duy nhất của 8/9 task. Xoá trước verdict = mất audit trail.
## NAV-20261001-1122-15 [open] Gộp đối chiếu Linear FI-29 + epic DONE + mindmap pending→merged
Cập nhật 01/10: mindmap DONE xong (b2a424b41b); còn Linear FI-29 + epic Done verdict — chờ workspace FI hồi phục (⏳)
Lý do: 3 việc cùng cột mốc "Linear hồi phục"; làm 1 lượt khi rate-limit nhả để tránh
backlog trôi. Mindmap sửa được ngay không cần Linear (local file).
