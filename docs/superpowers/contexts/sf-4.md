# Context pack — LOCAL-4 sf-4 — Convergence: driver --loop supervise portable + chứng minh 3 fence

> ⚠️ Bản 11:44 bị đè bởi copy chéo — bản này là bản CHÍNH THỨC LOCAL-4.
> Cập nhật 04/10 trưa: ILEC ĐANG có driver thật chạy (vocabulary-learn) — sf-4 có thể dùng
> làm quan sát THẬT thay vì chỉ fixture, nhưng vẫn KHÔNG can thiệp session/session chủ.

Nguồn: G4 (portable story không có supervisor sống) + cần chứng minh sf-1/2/3 chặn đúng
3 kịch bản đêm 03/10 trước khi tin fence mới.

## Spec slice
1. Bật/QUAN-SÁT `workfront-driver --loop` (portable mode) cho story portable đang mở —
   case sống: ILEC vocabulary-learn (driver instance của session khác đang chạy — CHỈ quan sát
   log/state, KHÔNG kill, KHÔNG reset state, KHÔNG dispatch). Đánh giá hiện trường đã thấy:
   worker được đẻ terminal MỚI mỗi pass (pane "story-worker-vocabulary-learn" ×5 handle khác
   nhau) + breaker BLOCKED ở attempts=3 hoạt động, nhưng state bị reset sau block rồi dispatch
   tiếp — 2 defect ứng viên ghi vào report.
2. Chứng minh 3 fence bằng kịch bản kiểm soát (fixture/dry — KHÔNG trên session sống):
   - sf-1: launch trùng khi có worker cùng story → bị chặn kèm bằng chứng
   - sf-2: driver sf_states đọc thấy state đích đúng (không stale)
   - sf-3: preflight cảnh báo primary-agent + skip-permissions
3. `kit/NAVIGATOR.md` thêm runbook "Portable supervision" — khi/khó khi bật driver --loop,
   cách đọc outcomes.jsonl, qui tắc 1 driver/slug + KHÔNG reset state sau BLOCKED.

## Touch map
- `kit/NAVIGATOR.md` (docs — CHỈ rehash fingerprint, không vào kitHash)
- evidence: `docs/superpowers/evidence/local4-kit-launch-safety/` (log + 3 kịch bản)
- `workfront-driver` KHÔNG đổi code trừ khi thiếu hóc nhỏ bắt buộc (ghi rõ trong report);
  2 defect ứng viên (terminal-per-pass, state-reset-sau-block) — report chỉ ra, fix là
  quyết định của coordinator/USER (driver đang thuộc sở hữu session khác)

## ACCEPTANCE (user-visible)
- Driver (thật hoặc fixture) 1 pass quan sát được log sạch trong evidence dir, verdict đúng.
- 3 kịch bản fence có bằng chứng đầu-ra trong evidence dir (pass/fail từng cái).
- NAVIGATOR.md có section supervision mới.

## Boundary
- KHÔNG tick VU-32/vocabulary-learn hộ, KHÔNG kill/answer session ILEC, KHÔNG push ILEC master
  (incident cleanup = quyết định USER, ngoài story).
- Driver chỉ verify/tick theo đúng protocol v1 hiện có (BLOCKED + leo khi fail).
