---
name: mock-prototype
description: >-
  Mock prototype pipeline: huashu-design (3 hướng HTML) → user chọn qua unlisted
  artifact links → final → hand-off. Use khi user muốn "mock", "prototype",
  "draft UI", "xem trước thiết kế", "3 hướng", "chọn hướng thiết kế", hoặc khi
  designer agent cần đăng prototypes để user duyệt từ xa. Kết hợp huashu-design
  skill + orca artifacts share. Không dùng cho production code — chỉ prototype.
---

# Mock Prototype — huashu × artifacts pipeline

Chuyển ý tưởng thành **3 hướng prototype HTML**, đăng mỗi hướng lên **unlisted
artifact link** (mở trực tiếp trong browser, không cần file local), user chọn
xong → hoàn thiện hướng chọn → hand-off spec cho dev.

## Khi nào dùng

| Trigger | Đi |
|---------|-----|
| "mock <gì đó>" / "prototype ..." / "3 hướng ..." | Full pipeline |
| "xem trước thiết kế X" / "draft UI" | Full pipeline |
| designer agent finish DIRECTIONS-READY | Đăng artifacts (bước 3) |
| User chỉ muốn xem 1 file HTML có sẵn | Chỉ bước artifacts share |

**KHÔNG dùng:** production web app, backend system, code sửa bug.

## Pipeline

### Bước 1 — CLARIFY (hỏi tối đa 3 câu, một lượt)
Mục tiêu / đối tượng / cảm xúc mong muốn / kích thước (web? pixel?). Chưa rõ
thì hỏi — KHÔNG tự đoán taste.

### Bước 2 — INVOKE huashu-design (3 hướng)
```
Use huashu-design skill: <spec từ bước 1>
Yêu cầu: 3 hướng draft — mỗi hướng 1 file HTML TỰ CHỨA (single-file, assets
base64 inline, không external dependency ngoài CDN fonts nếu cần) đặt tại
docs/superpowers/prototypes/<slug>/{a,b,c}.html
```
huashu tự lo: spec ≥500 chữ chung cho 3 subagent, logo/ảnh lấy trước (nếu
cần, base64 inline), mỗi hướng khác biệt thật (không phải 3 biến thể màu).

### Bước 3 — ĐĂNG ARTIFACTS (3 links)
```bash
orca artifacts share docs/superpowers/prototypes/<slug>/a.html --json
orca artifacts share docs/superpowers/prototypes/<slug>/b.html --json
orca artifacts share docs/superpowers/prototypes/<slug>/c.html --json
```
Thu thập URL từ JSON (`result.artifact.url` hoặc tương đương). Nếu artifacts
share fail (chưa sign-in cloud / permission) → fallback: mở file trực tiếp
`open <file>` và báo user setup `orca open` → đăng nhập + Settings → Share
Skills → bật; hoặc host tạm qua python http.server.

### Bước 4 — USER GATE (bắt buộc)
Trình bày 3 links + mô tả 1 dòng mỗi hướng:
```
🎯 3 hướng prototype:
  A: <link-a> — <concept ngắn>
  B: <link-b> — <concept ngắn>
  C: <link-c> — <concept ngắn>
Chọn hướng (A/B/C) hoặc yêu cầu đổi gì?
```
**KHÔNG tự chọn. KHÔNG merge 3 thành 1.** Chờ user. Đây là gate giống
designer user-gate trong Team Model.

### Bước 5 — FINAL + HAND-OFF
Hướng được chọn → hoàn thiện (huashu Step tiếp theo) → đăng lại artifact
(update link cũ nếu cùng file) → viết hand-off:
- `docs/superpowers/designs/<slug>-direction.md` (format designer hand-off:
  tokens / structure / behavior / out-of-scope)
- Link artifact cuối cùng
- Báo: `DIRECTION-FINAL: <link> — hand-off tại <path>`

### Bước 6 — DỌN (optional)
Sau hand-off: `orca artifacts unshare <file>` cho 2 hướng KHÔNG chọn (giữ
link cuối). File HTML giữ trong prototypes/ làm record.

## Quy tắc

1. **Kế thừa 100% quy tắc huashu** (3 hướng là HARD GATE — style chỉ định
   cũng không豁免; logo checklist; spec ≥500 chữ; KHÔNG cards-in-cards).
2. **Single-file HTML** bắt buộc cho artifact share (assets base64 inline —
   artifacts render từ cloud, file rời sẽ vỡ).
3. **Unlisted ≠ private** — ai có link xem được. KHÔNG share nội bộ nhạy cảm.
4. **User gate không bỏ** kể cả autonomous mode (đúng designer protocol).
5. Artifacts share chỉ nhận HTML/Markdown — nếu user cần PNG/MP4: render
   riêng rồi nhúng base64 vào HTML.

## Failure modes

| Lỗi | Xử lý |
|-----|-------|
| `authentication_unconfigured` | Hướng dẫn `orca open` → sign-in Orca Cloud → retry |
| `agent_skill_sharing_disabled` | Settings → Share Skills → bật → retry |
| File quá lớn cho artifact | Tối ưu ảnh (resize/webp) — hoặc python http.server local |
| huashu chưa cài | `npx skills add alchaincyf/huashu-design` (32MB) |
