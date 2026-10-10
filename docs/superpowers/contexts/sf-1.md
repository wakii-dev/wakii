# Context pack — LOCAL-5 sf-1 — story-doctor install-coverage (sidecar manifest)

> BƯỚC-0: header phải chứa "LOCAL-5 sf-1". Sai → pack của story khác, DỪNG báo.
> Pack ĐÃ ĐỒNG BỘ spec CHỐT (spec-critic 10/10) — nếu lệch spec, SPEC THẮNG.

## Spec slice
`story-doctor` chạy từ vị trí CÀI (`~/.claude/bin`) → `src==dst` → check bins PASS
tautology (live 10/10: "PASS 60 bins" khi nguồn 59/cài 61). Chiều provides ∉ installed
không được phát hiện; repair (04/10) PASS 9/9 nhưng không copy `story-pane-watch` —
`run_install_kit` chết nếu không thấy kit source (~dòng 482) — máy chỉ-có-install
không có tay copy (đúng kịch bản incident).

Fix (spec CHỐT): **sidecar manifest** `~/.claude/bin/.kit-provides.json` = JSON OBJECT
`{provides:[names], srcKitRoot, kitHash}` do installKit ghi:
- Ghi **VÔ ĐIỀU KIỆN TRƯỚC early-return marker-khớp** trong installKit (main.mjs
  ~1275-1282) — ghi sau early-return = bị xoá và không bao giờ ghi lại; refresh MỖI install
- `srcKitRoot` = đường kit source lúc install (repair có tay copy)
- `check_bins`: kit.json vắng ở install dir → đọc sidecar: missing = provides ∉
  installed → FAIL nêu tên; orphan = installed ∉ provides (2 chiều, hết tautology);
  KHÔNG sidecar → **WARN fail-open** (KHÔNG PASS)
- Tautology fixture: doctor đặt BÊN TRONG fake install root (`kit_root==root`, chạy
  từ `<root>/bin/`) — chế độ kit-source chưa từng tautology, không phải mục tiêu
- `--repair` 2 nhánh: `srcKitRoot` còn tồn tại + tree hash khớp sidecar → copy trực
  tiếp bin thiếu (guard under_root + **chmod 755 SAU copy**); source mất/hash lệch →
  **FAIL in lệnh cp hướng dẫn tay** — không im lặng (hành vi ĐÚNG cho máy không source)

## Touch map
- `kit/bin/story-doctor` — check_bins (~268-292), cmd_repair
- launcher `main.mjs` — installKit copy bins + ghi sidecar (~1275-1282)
- `tests/story-doctor-tests.mjs` — fixture sandbox (21 DR giữ GREEN)
- `tests/kit-verify-manifest.mjs` — không đụng (manifest không đổi)
- rehash THỨ TỰ: bin → computeKitHash → kit.json → fingerprint CUỐI; ĐÚNG CÂY worktree

## Interface contract
- Sidecar: JSON object `{"provides":[...],"srcKitRoot":"<abs>","kitHash":"..."}`,
  ghi atomic, ghi MỖI lần installKit copy bins (kể cả early-return path)
- `check_bins` sidecar-mode: missing = provides ∉ installed; orphan = installed ∉
  provides — orphan sidecar-mode = **WARN-only** (sidecar stale có thể che bin mới hợp lệ)
- check_orphans **whitelist** `.kit-provides.json` (scanner hiện sẽ xoá nó)
- uninstall_targets gồm sidecar
- `core.filemode=false` → exec-bit qua `git update-index --chmod=+x`

## Dep states
- kit 2.21.0, provides 75, kitHash 788c9a11 (KHÔNG hardcode số — đổi theo rehash)
- P0-1 (plan): task ĐẦU SF-1 = rehash trên tree sạch + kit-verify-manifest GREEN
  TRƯỚC mọi edit khác
- Suite kit chạy qua `pnpm test` (node trực tiếp chết trên máy này)

## ACCEPTANCE (spec — đủ 6 + regression)
1. Fixture: xoá 1 provides-bin khỏi fake install → doctor FAIL nêu đúng tên
2. `--repair` có srcKitRoot hợp lệ → copy đủ + PASS; **variant KHÔNG-source → FAIL
   in hướng dẫn tay (không PASS)**
3. Fixture doctor BÊN TRONG root: có sidecar → phát hiện thiếu; KHÔNG sidecar →
   WARN fail-open (không PASS)
4. Sidecar refresh mỗi install (install 2 lần — value/mtime đúng)
5. check_orphans không xoá sidecar (whitelist)
6. Uninstall dọn sidecar
7. Regression kit-source mode + suite GREEN

## Boundary
- KHÔNG đụng settings.json, hooks wiring, story-medic/medic flows
- KHÔNG bump version (release lo)
- KHÔNG đụng workfront-driver (writer khác giữ — SF driver đã tách khỏi story này)
