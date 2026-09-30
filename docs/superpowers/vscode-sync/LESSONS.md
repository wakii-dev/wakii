# vscode-sync — lessons learned

Đúc kết từ các lần chạy thật (VSC-901 smoke 30/9, thiết kế automation 29-30/9).
Đọc trước khi sửa bin/prompt automation.

## 1. Agent one-shot có budget — thiết kế cho việc bị ngắt giữa chừng

Pass CREATE dài (~20 phút: brainstorm → spec → epic → SF → launch) có thể kết thúc
sớm khi agent hết budget phiên. **Không để việc quan sát/kết nối chỉ ở cuối pass** —
tách thành: (a) bin bookkeeping idempotent (claim/annotate/mark-staged) để pass sau
nhặt tiếp; (b) supervisor pass riêng kiểm tra dòng `[~]`/`[S]` thiếu annotation rồi
bổ sung (tìm epic trên Linear theo backlog id trong title).

## 2. Automation Orca — 4 gotchas đã cắn thật

- `automations edit` **cắt prompt ở newline** → luôn gửi prompt 1 dòng.
- `automations create` có thể **thành công server-side dù client process chết**
  (MSYS flake) → trùng tên im lặng. Check `automations list` theo tên trước khi create.
- `--precheck` hay bị rơi khi create kèm nhiều flag → tạo xong **edit** để gắn.
- `runContext.path` luôn là primary repo — worktree thật xem field `worktreeId`
  (`<repo-id>::<path>`); bind đúng bằng `--workspace name:<tên>`.

## 3. Terminal automation tích tụ — pane protocol

Mỗi run spawn 1 terminal pane, sau run pane ở lại (shell chết). Protocol:
đầu pass `cleanup-stale` (đóng pane cũ, giữ newest), `claim-pane` lưu handle,
cuối pass **mọi nhánh kể cả noop** `cleanup-pane $HANDLE`. Precheck chặn
scheduled-run khi không có việc — terminal rác chỉ sinh khi có việc, và bị
pass kế dọn.

## 4. Tách trách nhiệm automation

Một automation làm nhiều vai trò (dispatch + supervise + notify) → prompt dài,
khó gỡ lỗi, budget phiên bị chia. Tách: **scout** (phân tích + tạo story, wakii-dev)
và **auto-launch** (quét story chưa implement → approve + launch, mọi dự án).
Mỗi cái 1 việc, giao tiếp qua backlog state machine + Linear.

## 5. Backlog là state machine, không phải danh sách

`[ ]` chờ scout · `[~]` scout đang tạo · `[S]` story đã tạo chờ launch ·
`[x]` merged. Bin là người viết duy nhất các chuyển trạng thái (fence-aware —
ví dụ format trong ``` không bao giờ bị claim). Người chỉ thêm dòng `[ ]`.

## 6. Precheck là cách rẻ nhất tránh noop

`--precheck <cmd>` trước scheduled run: exit ≠ 0 → run bị skip, không tốn agent.
Precheck phải nhanh (<60s) và chỉ đọc state (bin `should-run`).
