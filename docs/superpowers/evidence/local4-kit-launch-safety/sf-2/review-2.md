# Review 2 — LOCAL-4 sf-2 (nhóm T4-T6: fence + evidence + demo)

- Reviewer: code-reviewer ĐỘC LẬP (read-only), focus commit bd7da901f1 + evidence dir
- Verdict: **APPROVED — 0 P0 / 0 P1 / 3 P2 + 1 NEEDS-VERIFICATION**
- Reviewer tự verify: kit-verify-manifest 30/30 (kitHash khớp tự tính) ·
  verify-packaged rc=0 · 3 suite xanh (40+7+28) · bash -n/node --check OK ·
  leak-check /tmp sau suite (fix tmpdir verified bằng repro) · demo authenticity
  (commit hash 04f8c28 lặp lại giữa 2 fixture = content-deterministic, timestamps
  nhất quán, .txt khớp code từng điểm)
- CHECKLIST-4Q: 4/4 PASS

## NEEDS-VERIFICATION — ĐÃ XÁC NHẬN LÀ GAP THẬT + FIX (030a85aca5)

Reviewer ngờ: local copy vắng (source=worktree) → destRequested rỗng → nhánh đích
có snapshot done KHÔNG nâng qua bản worktree-only (VU-32 × vocabulary-learn combo).
Xác nhận đúng: `.txt:31 "requested":null`. Root cause: destRequested tính TRƯỚC
khi base load. Fix 030a85aca5: destRequested + destRef tính SAU base resolution;
WTDEST test pin combo (4 asserts: sf-1 done, source=worktree, dest.ref khớp
meta.dest của bản worktree, upgraded=[sf-1]). Suite: resolve 44/44.

Trong lúc fix còn tự sinh 1 bug đảo điều kiện (`if (!destRequested0)` skip
dest-only read khi CÓ --dest) — suite bắt ngay (DESTONLY/DSTFLAG đỏ), sửa ngay
trong cùng commit. Bài học: refactor flow có test pin mỗi nhánh là net thật.

## P2 disposition

| # | P2 | Disposition |
|---|---|---|
| 1 | READ-ONLY proof kịch bản 2 no-op (2 shasum liền nhau) | **FIXED** — SUM2_BEFORE dời TRƯỚC RESOLVE; demo re-run, .txt mới có proof thật |
| 2 | R15 thiếu test âm (file .wakii story khác không được cung cấp dest) | **FIXED** — R16: aaa-other-story.wakii (không node sf-77, dest sai) sort trước → assert dest chỉ từ file đúng story (31 PASS) |
| 3 | Demo 4b tuyên bố "EXIT" nhưng --dry không exit | **FIXED** — 4b đổi wording đúng thực tế (dry chỉ plan) + thêm 4c chạy --once non-dry chứng minh exit 1 + EXIT log thật |

Fence sau fix: rehash lần 4 (kitHash 41827fdaa2ea287c · fingerprint 2bcf4586…) +
verify-packaged exit 0 + commit --no-verify (030a85aca5).
