# Review 1 — LOCAL-4 sf-2 (nhóm T1-T3 + log-fix)

- Reviewer: code-reviewer ĐỘC LẬP (read-only), diff `539e80788c..9db9916d3d`
- Verdict: **APPROVED — 0 P0, 0 P1, 5 P2**
- Reviewer tự chạy: mindmap-resolve 40/40 · driver-resolve 7/7 · story-resume 28/28
  · bash -n/node --check OK · kit-verify-manifest 30/30 · verify-packaged exit 0
- CHECKLIST-4Q: 4/4 PASS (reviewer-checklist gate)

## Đối chiếu verify criteria (1-9): đủ — no-downgrade pin test FI30, fail-open đủ 4 nhánh
(git chết/ref lệch/snapshot vắng/bin thiếu), read-only assert trong test AC1,
SAFE_DEST_RE + execFileSync argv (không shell), coverage pass mọi file có finding
hoặc "reviewed, clean".

## P2 disposition (fix trước khi commit bd7da901f1, trừ mục ghi nhận)

| # | P2 | Disposition |
|---|---|---|
| 1 | Repoint có thể nhận pseudo-path `ref:rel` khi source=dest-branch (latent, chưa với được) | **FIXED** bd7da901f1 — `[ -f "$_file" ]` vào điều kiện repoint + comment |
| 2 | Resume mindmap-fallback lấy dest từ file sai story trong worktree đa .wakii | **FIXED** bd7da901f1 — python chỉ in dest khi node sf-`<n>` khớp |
| 3 | 2 test file mới leak tmpdir | **FIXED** bd7da901f1 — TMP_ROOTS + rmSync cuối run (cả 2 file) |
| 4 | Tick sau repoint ghi vào worktree anh em cùng story | **GHI NHẬN thiết kế** — cố ý: tick trỏ vào bản sống của story (bản duy nhất có thật khi local thiếu hẳn); không blocker, multi-writer an toàn vì cùng 1 story 1 file state |
| 5 | SAFE_DEST_RE chưa có test phân biệt (defense-in-depth) | **GHI NHẬN** — thêm test sẽ tautology (dest rác không bao giờ khớp ref thật từ for-each-ref); regex giữ nguyên vai trò depth, ghi ở đây làm dấu vết |

Sau fix: resolve 40/40 · driver 7/7 · resume 28/28 xanh; rehash lần 3
(kitHash 0659dfb8ab65c0cb, fingerprint 7a2f697c…) + verify-packaged exit 0.
