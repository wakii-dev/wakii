# Context pack — LOCAL-5 sf-1 — story-doctor install-coverage (sidecar manifest)

> BƯỚC-0: header phải chứa "LOCAL-5 sf-1". Sai → pack của story khác, DỪNG báo.

## Spec slice
`story-doctor` chạy từ vị trí CÀI (`~/.claude/bin`) → `src==dst` → check bins PASS
tautology (live repro 10/10: "PASS 60 bins" trong khi kit nguồn 59 / cài 61). Repair
PASS 9/9 (04/10) trong khi `story-pane-watch` (provides bin) KHÔNG tồn tại ở install —
chiều provides ∉ installed không được phát hiện, repair không copy.

Fix (user chốt): **sidecar manifest** `~/.claude/bin/.kit-provides.json`:
- installKit (main.mjs, lúc copy bins) ghi snapshot `provides[].name` (type=bin) vào
  sidecar — mỗi lần install ghi mới
- `check_bins`: khi kit.json KHÔNG có ở install dir (src==dst case), đọc sidecar
  thay kit.json → đối chiếu installed vs provides → missing (provides ∉ installed)
  → FAIL + repair copy lại (repair re-run installKit — đã có cơ chế)
- Khi chạy từ KIT SOURCE (kit.json có) → behavior hiện tại giữ nguyên (orphan quét
  + so src với dst)

## Touch map
- `kit/bin/story-doctor` — check_bins (~dòng 268-292: orphan quét + missing list
  đã có sẵn ở chiều src→dst), cmd_repair
- `main.mjs` — installKit copy bins + GHI sidecar (mới)
- `tests/story-doctor-tests.mjs` — fixture sandbox: fake install dir + kit source
- `tests/kit-verify-manifest.mjs` — không đụng (manifest không đổi)
- rehash: bin đổi → kitHash + fingerprint (thứ tự chuẩn)

## Interface contract
- Sidecar: JSON array các tên bin (vd `["story-launch","story-pane-watch",...]`),
  ghi atomic, ghi MỖI lần installKit copy bins
- `check_bins` khi đọc sidecar: missing = provides(sidecar) ∉ installed(dstdir);
  orphan = installed ∉ provides(sidecar) (2 chiều, hết tautology)
- `--repair` với missing → re-run installKit (tự copy + tự refresh sidecar)

## Dep states
- provides = 75 bins (kit.json 2.21.0, kitHash 788c9a11 — sẽ đổi theo rehash Task 4
  story: KHÔNG hardcode số)
- `core.filemode=false` trên máy → exec-bit phải qua `git update-index --chmod=+x`
- Harness: story-doctor-tests.mjs (21 DR) phải giữ GREEN

## ACCEPTANCE
1. Xoá 1 provides-bin khỏi fake install → doctor FAIL nêu đúng tên bin
2. `--repair` copy lại đủ + PASS
3. Doctor chạy từ kit source: KHÔNG còn tautology — phát hiện lệch src/dst
4. Sidecar refresh mỗi install (test: install 2 lần, sidecar mtime/value đúng)

## Boundary
- KHÔNG đụng: settings.json, hooks wiring, story-medic/medic flows
- KHÔNG bump version (release lo)
- Uninstall: xoá sidecar cùng lúc xoá bins (--uninstall flow)
