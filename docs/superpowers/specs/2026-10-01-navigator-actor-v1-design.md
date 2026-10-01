# Navigator Actor v1 — hàng đợi việc + thợ tự động

- Ngày: 2026-10-01
- Status: duyệt hướng (user CHỌN "Actor + auto-dispatch" — vượt mốc G2 chờ)
- Cha: `2026-09-30-story-navigator-design.md` (navigator) · mô hình 4 lớp autonomy (L1→L2)
- Phụ: FI-28 là bằng chứng mô hình thủ công hoạt động (đề xuất → duyệt → executor → DONE → ack)

## 1. Mục tiêu một câu

Vấn đề navigator tìm thấy đi vào **hàng đợi có thợ**: class an toàn tự chạy, class rủi ro chạy sau khi bạn tick trong DIGEST — PR/merge vẫn luôn cần người.

## 2. Kiến trúc

```
crontab 3h (nhịp hiện có) → navigator-runner:
  Pha A — navigator pass (GIỮ NGUYÊN: 11 Bước, fences, read-only + 2 ngoại lệ cũ)
  Pha B — WORKER (mới): đọc hàng đợi → chọn ĐÚNG 1 việc → dispatch 1 executor session
          → cập nhật entry status + evidence
  Pha C — DIGEST.md: bảng điều khiển (đã giải quyết / đang làm / chờ tick / blocked)
```

Worker = phần mở rộng của runner script (không phải navigator session) — navigator giữ nguyên tính read-only; thợ là session executor riêng, tuần tự.

## 3. Queue schema (inbox entry nâng cấp)

```markdown
## NAV-<UTC:YYYYMMDD-HHMM>-<n> [status] [P?] [class?] Tiêu đề
Lý do: ...
Class: auto | ack-gated | never          (mặc định: auto nếu chỉ đọc/verify/sync/tick; ack-gated nếu launch/QA-heavy; never nếu merge/push/Linear-write)
Priority: P1 chặn-epic | P2 drift-risk | P3 vệ sinh
Attempts: 0
Status: open → claimed → resolved(evidence) | blocked(lý do) | ack(human)
```

- **auto**: worker tự chạy — verify-gates, convergence QA, surface-lint, sync mindmap từ git, dọn evidence-rác
- **ack-gated**: chạy sau khi user tick `[x]` trong DIGEST — launch SF, QA-heavy, story-wide verify
- **never**: không bao giờ dispatch — merge/push/Linear-write/DONE-verdict (báo cáo thôi)

## 4. Worker loop (Pha B)

1. Đọc queue: lọc việc `open` theo thứ tự **P1-auto → P1-acked → P2-auto → P2-acked** (P3 chỉ khi rảnh)
2. Chọn ĐÚNG 1 → entry = `claimed` (ghi ngay, atomic) → dispatch executor session
   (pattern FI-28: brief gọn, scope viết `docs/superpowers/evidence/<việc>/`, cấm đụng code/Linear/push)
3. Executor PASS → entry = `resolved` + evidence path · FAIL → `Attempts+1`; đạt 2 → `blocked` + phân tích vào DIGEST mục Blocked
4. Việc **launch-SF acked**: trước dispatch worker phải probe `run-list` (không run active cho story đó) — chống double-dispatch (bài học FI-478)

## 5. DIGEST control panel (Pha C)

```markdown
# DIGEST — 2026-10-01
## Đã tự giải quyết
- FI-32 verify-gates PASS — evidence … (entry NAV-…)
## Đang làm
- FI-305 convergence QA (claimed 21:40)
## Chờ bạn tick
- [ ] Launch SF-1 FI-30 (P1 ack-gated) — nhánh chung đã rảnh
## Blocked
- (không)
```

Tick `[ ]`→`[x]` = ack. Động từ duy nhất của user.

## 6. Rào an toàn

1. **Worker không bao giờ** merge/push/Linear-write/DONE-verdict — kể cả khi đã ack
2. **1 thợ/lúc, 1 việc/pass** — cap tuyệt đối
3. **Circuit breaker**: ≥3 blocked/ngày → worker tắt tới pass kế, DIGEST leo user
4. **Launch-class probe** run-list trước dispatch
5. **Audit**: runner.log ghi từng dispatch (việc, entry-id, ver­dict, thời gian)
6. Navigator fences giữ nguyên — Pha A không biết Pha B tồn tại

## 7. Non-goals

- Không đụng kit (bins/skills) — worker là script + executor session ngoài kit (G2 promote sau)
- Không xóa-sửa inbox entry cũ của user (`ack` do user/coordinator ghi giữ nguyên)
- Không chạy P3 khi còn P1/P2

## 8. Rollout 3 nấc

- **GA1 — dry-run (3 pass)**: worker chỉ REPORT (sẽ làm gì) vào DIGEST, không dispatch — soi queue schema hoạt động
- **GA2 — auto class thật**: dispatch việc auto; ack-gated vẫn chỉ hiện
- **GA3 — auto-dispatch**: tick DIGEST → worker dispatch cả ack-gated (launch có probe)

## 9. Thước đạt

- GA2: ≥1 việc auto resolved có evidence / tuần, 0 hành vi ngoài class
- GA3: 1 việc acked → resolved trọn vòng không cần gõ lệnh
- Thất bại: worker dispatch sai class / đụng never-class 1 lần duy nhất → rollback tức thì (runner tắt pha B, navigator sống bình thường)
