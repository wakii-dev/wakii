# Review-1 — LOCAL-4 sf-4 (rolling review, nhóm duy nhất)

Reviewer: code-reviewer ĐỘC LẬP (subagent, không cùng context executor) — 04/10.
Scope: NAVIGATOR.md (section mới "Portable supervision") + bundled-plugins.json (rehash) + toàn bộ
evidence sf-4 (7 file + ilec-snapshot 6 file). Verdict gốc: **CHANGES-REQUESTED — 2 P1 doc, 0 P0,
evidence KHÔNG forge** (anti-forge audit đối chiếu byte-level với log thật ILEC + fixture disk).

## Verdict reviewer (nguyên văn rút gọn)

- P1-1: NAVIGATOR.md:69-70 — câu "bật instance thứ 2 chỉ để --dry soi nhánh" SAI vs bin: PID gate
  chạy vô điều kiện mọi mode gồm --dry (workfront-driver:84-93) → người làm theo runbook sẽ gặp
  "exit: driver … đang chạy".
- P1-2: observations-ilec.md:40 — "14/16 pass nhiễm" sai số liệu vs chính snapshot: đúng 15/16
  (16 dòng, 15 dòng action="Node.js v24.10.0", chỉ 1 pass --dry 19:30 sạch).
- P2 (hẹn micro-fix riêng, KHÔNG sửa trong sf-4 — drive-by): NAVIGATOR.md:37 "breaker ≥3 blocked/ngày"
  không có logic tương ứng trong bin (pre-existing, trước hunk diff); :24 "FOCUS trống" terminology cũ.
- P2 (audit note): pass --once vocabulary-learn ghi thêm dòng vào driver.log/outcomes.jsonl ILEC
  (append-only, state hash before==after, nhánh done-gate không-action) — hợp lệ theo spec slice 1,
  log ILEC giờ có dòng của sf-4 — minh bạch ở đây.
- Surgical scope ✓: không bin nào đổi; contexts/sf-4.md = pack coordinator, không thuộc SF.
- Deterministic: manifest 30/30 · verify-packaged-plugin-resources OK (rehash in-scope, kit.json
  không sửa ✓) · ownership-probe-tests 91/91 HARNESS GREEN.
- Coverage pass: từng file có finding hoặc "reviewed, clean" tường minh.

## Xử lý sau review (executor)

- P1-1 ✅ NAVIGATOR.md — câu đã sửa: "PID-file tự chặn driver trùng ở MỌI mode (kể cả --dry: muốn
  soi nhánh, dừng driver sống rồi --dry, hoặc đọc driver.log)".
- P1-2 ✅ observations-ilec.md — "15/16 pass vocabulary-learn (chỉ 1 pass --dry 19:30 hôm trước sạch)
  + 2/3 pass oxford" (đếm lại từ snapshot trước khi sửa).
- P2 ✅ ghi nhận ở đây (không sửa — đúng boundary surgical scope).
- NAVIGATOR đổi sau rehash → rehash fingerprint LẦN NỮA: b73d92b5… → **173db468…** (bundled-plugins.json)
  + verify OK + lockstep 7/7 + manifest 30/30 (chạy lại sau fix).
- 2 P1 là fix doc điều kiện reviewer nêu ("sửa xong commit được") — khớp điều kiện = resolved,
  không re-dispatch vòng review mới cho 2 dòng doc.
