# Story Navigator — design

- Ngày: 2026-09-30
- Status: duyệt thiết kế (user APPROVE cả 2 phần)
- Loại: architectural (pattern điều phối mới)
- Liên quan: story-workflow, orchestration, watchdog, kit `story-team-kit` 2.20.0

## 1. Vấn đề

Story đang chạy có người trông nhưng không có người nhìn xa:

- Watchdog bắt được stall, nhưng **quyết định tiếp theo** (resume / kill / đổi hướng) vẫn phải user chạm tay.
- Không ai **phản biện chiến lược định kỳ**: SF dead-end, tier cần đảo, scope drift phát hiện bằng mắt người.
- User phải mở app/terminal mới biết story đang đâu, cái gì kẹt, nên làm tiếp cái gì.
- Story orchestration có thể đi vòng lặp/đi lạc mà không có bên độc lập nào nhận ra kịp.

## 2. Giải pháp một câu

Một **automation định kỳ** spawn 1 claude session **read-only** per story active ("navigator pass"): đọc state story từ các bề mặt có sẵn, chọn 1 trong 3 chế độ, viết **brief** cho user + **khuyến nghị vào inbox** mà story coordinator đọc bắt buộc tại checkpoint — và **không tự làm gì cả**.

## 3. Nguyên tắc bất di bất dịch (fences)

1. **Chỉ khuyến nghị.** Navigator KHÔNG mutation: không orchestration mutation CLI, không gate-resolve, không task-update, không `resume --send`, không Linear write, không push, không đụng code.
2. **1 process** (ruling 429 27/09): MỘT automation duy nhất, cron thưa, không automation khác cùng họ; stall KHÔNG bật process mới.
3. **Không chen giữa turn**: navigator không bao giờ push message vào session đang chạy; "thảo luận" là vòng 1-chiều qua inbox + ack (mục 6).
4. **Write scope hẹp**: chỉ `docs/superpowers/navigator/<story-slug>/`. Story worktree sau pass phải sạch trừ thư mục này (assert kiểm tra được).
5. **Im lặng là lỗi**: nguồn đọc chết → brief vẫn xuất, phần thiếu đánh dấu `⚠` kèm tên nguồn.

## 4. Thành phần

| Thành phần | Vai | Nguồn |
|---|---|---|
| Automation `story-navigator` | cron 3h (chỉnh được), spawn 1 claude session duy nhất chạy **tuần tự** qua từng story active — không bao giờ 2 session song song | Orca automations |

"Story active" = story mà `story-status` liệt kê (có SF chưa Done hoặc checkpoint mở).
| Prompt navigator-pass | chọn chế độ → collect → viết brief/inbox → toast | `docs/superpowers/navigator/navigator-pass-prompt.md` (G0/G1 ngoài kit) |
| Collect | `story-status`, `story-stats` (bins kit có sẵn), MCP wakii-story read-only (task-list / gate-list / watchdog status / bracket), `git log` worktree story | reuse, không viết mới |
| Toast | gọi user đọc brief khi có khuyến nghị ưu tiên cao | `story-notify` (bin kit có sẵn) |
| Brief | `docs/superpowers/navigator/<story>/brief.md` — overwrite mỗi pass | mới |
| Inbox | `docs/superpowers/navigator/<story>/inbox.md` | mới |
| State | `docs/superpowers/navigator/<story>/state.json` — SF statuses lần pass trước | mới |

## 5. Ba chế độ pass (chọn theo state, theo thứ tự ưu tiên)

1. **Stall deep-dive** — watchdog status có STALLED / STALLED-COLD / STALLED-SHELL: nguyên nhân → đề xuất resume / kill / đổi hướng; mỗi phương án ghi rõ cái mất / cái giữ.
2. **Rà toàn cảnh** — diff `state.json` thấy SF vừa chuyển DONE: toàn cảnh trước khi coordinator chọn SF kế — SF kế còn đúng tier/đích không, dead-end, phụ thuộc đảo chiều.
3. **Brief chiến lược** — mặc định: tiến độ, drift, top-3 khuyến nghị.

Brief ≤ 60 dòng (deep-dive cho phép dài hơn, ≤ 120). Mỗi pass cập nhật `state.json` SAU CÙNG, ghi atomic (temp + rename) — pass crash giữa chừng thì pass kế làm lại từ đầu (idempotent).

## 6. Protocol inbox — hình dạng "cuộc thảo luận"

Mỗi khuyến nghị là 1 entry:

```
## NAV-YYYYMMDD-HHMM-<n> [open] <tiêu đề 1 dòng>
Lý do: ...tối đa 3 dòng...
```

- Coordinator đọc inbox tại **3 checkpoint có định nghĩa**: đầu vòng chọn SF kế · trước gate-resolve lớn · đầu session mới làm story.
- ACK: sửa `[open]` → `[ack]` + thêm đúng 1 dòng quyết định (`→ chấp nhận: ...` / `→ từ chối: lý do`). Buộc đọc + phản hồi, KHÔNG buộc làm theo.
- Navigator pass kế đọc các ack; thấy quyết định rủi ro thì được phản biện bằng entry mới (không sửa entry cũ).

## 7. Luồng dữ liệu

```
cron 3h → automation → claude session (prompt navigator)
  → collect: story-status + story-stats + MCP read-only + git log
  → chọn chế độ (5) → viết brief + inbox entries + toast (story-notify)
  → user đọc brief; coordinator đọc inbox tại checkpoint, ack
  → pass kế đọc ack, phản biện nếu cần
```

## 8. Xử lý lỗi

| Tình huống | Ứng xử |
|---|---|
| Không story active | pass no-op, log 1 dòng |
| Nguồn đọc (bin/MCP/git) chết | brief vẫn xuất, phần đó `⚠ <nguồn> không đọc được` |
| Pass chồng nhau | vô hại về mutation (không mutate); state.json ghi atomic cuối pass |
| Pass crash | state không ghi → pass kế làm lại từ đầu |
| Story kết thúc/xoá | automation giữ cron, pass tự no-op; user xoá automation khi muốn |

## 9. Rollout 3 giai đoạn

- **G0 — thử nghiệm (không automation)**: chạy tay 1 pass cho story đang active (FI-30 hoặc VI-1). User đọc brief, chấm chất lượng; chỉnh prompt 2–3 vòng. Brief vô dụng → dừng, không tốn gì thêm.
- **G1 — bật automation cron 3h, chạy 1 tuần**: đo ack rate + có ít nhất 1 quyết định thật chịu ảnh hưởng brief.
- **G2 — vào kit chính thức** (nếu giữ): bin collect cố định + skill prompt qua đúng kit flow (provides + rehash + release); tiện tay nhặt platform guard C25/M1.

## 10. Thước đạt/thất bại

- **Đạt G1**: trong 1 tuần, ≥1 entry inbox được ack "chấp nhận" và dẫn tới thay đổi quyết định thật; user đọc brief ≤ 2 phút/pass.
- **Thất bại**: 1 tuần không có ack "chấp nhận" nào, hoặc brief toàn thông tin user đã biết → gỡ automation, giữ brief thủ công on demand nếu user muốn.

## 11. Non-goals

- Không chat 2 chiều realtime với story orchestration.
- Không tự act dù chỉ 1 mutation nhỏ (kể cả "an toàn").
- G0/G1 không đụng kit (không rehash, không release).
- Không thay watchdog/watchdog notify — navigator là tầng chiến lược, watchdog giữ nguyên tầng liveness.
