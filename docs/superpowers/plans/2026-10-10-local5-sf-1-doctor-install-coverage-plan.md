# LOCAL-5 SF-1 — story-doctor install-coverage (sidecar manifest + srcKitRoot repair)

> Spec: `docs/superpowers/specs/2026-10-10-kit-improvements-design.md` §SF-1 (CHỐT)
> Context pack: `docs/superpowers/contexts/sf-1.md` · Plan epic: `2026-10-10-local5-improve-kit.md` Task 1
> Worktree: `sf-1-story-doctor-install` · dest `story-local5-improve-kit` (KHÔNG merge — coordinator lo)

## Global Constraints

- TDD RED→GREEN khi khả thi; commit atomic per task; Conventional tiếng Việt; CẤM trailer Co-Authored-By; `--no-verify` hợp lệ (oxlint ignores)
- Rehash thứ tự: bin → computeKitHash → kit.json → fingerprint CUỐI; ĐÚNG CÂY worktree
- Suite kit chạy qua node trực tiếp (tests *.mjs — kit suite KHÔNG cần pnpm); gate không pipe: `cmd > log 2>&1; echo $?`
- `core.filemode=false` → exec-bit qua `git update-index --chmod=+x`
- KHÔNG đụng: settings.json wiring, story-medic flows, workfront-driver, version bump, kit-verify-manifest asserts

## Tasks

- [x] T1. P0-1 probe: `git status` plugin-dir + `pgrep`/`lsof` workfront-driver — sạch (rc=1, không writer) [evidence: /tmp/wf-pgrep.log rỗng]
- [x] T2. Rehash tree sạch: tree hash 788c9a111c49a0f1 == kit.json · fingerprint verify OK · kit-verify-manifest 31/31 · baseline story-doctor 135/135 GREEN
- [x] T3. TDD RED fixture tautology (DR22): doctor BÊN TRONG fake install root (kit_root==root, chạy từ `<root>/bin/`) + sidecar có + xoá 1 provides-bin → hiện tại PASS sai (tautology); sau fix → bins FAIL nêu đúng tên
- [x] T4. TDD RED fixture không-sidecar (DR23): kit_root==root, KHÔNG sidecar → hiện tại PASS; sau fix → bins WARN fail-open (không PASS)
- [x] T5. installKit ghi sidecar vô điều kiện TRƯỚC early-return marker-khớp (main.mjs ~1275-1282): `{provides:[bin names], srcKitRoot (absolute), kitHash}` — atomic write; DR25: install 2 lần — lần 2 early-return vẫn refresh (value/mtime đúng)
- [x] T6. check_bins sidecar-mode (kit.json vắng ở install dir): missing = provides ∉ installed → FAIL nêu tên; orphan = installed ∉ provides → WARN-only (P1-2: sidecar stale có thể che bin mới); exec-bit check kept cho provided∩installed (DR24)
- [x] T7. check_orphans whitelist `.kit-provides.json` (DR26 — scanner hiện sẽ xoá nó)
- [x] T8. `--repair` copy-bins nhánh 1: srcKitRoot tồn tại + tree hash khớp sidecar.kitHash → copy bin thiếu (guard under_root + chmod 755 SAU copy) (DR27)
- [x] T9. `--repair` nhánh 2: source mất/hash lệch → FAIL + in lệnh cp hướng dẫn tay, không PASS (DR28 variant không-source + hash-lệch)
- [x] T10. uninstall_targets gồm sidecar (DR29 — uninstall --yes dọn sidecar)
- [x] T11. missing-sidecar → WARN fail-open (DR30 — sidecar JSON hỏng cũng fail-open, không crash)
- [x] T12. Regression kit-source mode (DR1-DR21 GREEN) + full suite + rehash (bin đổi → computeKitHash → kit.json → fingerprint CUỐI) + commit

## ACCEPTANCE map (spec 7 mục)

1. xoá 1 provides-bin khỏi fake install → FAIL nêu tên → DR22
2. --repair có srcKitRoot hợp lệ → copy đủ + PASS (DR27); không-source → FAIL hướng dẫn tay (DR28)
3. doctor BÊN TRONG root: có sidecar → phát hiện thiếu (DR22); không sidecar → WARN fail-open (DR23)
4. sidecar refresh mỗi install → DR25
5. check_orphans không xoá sidecar → DR26
6. uninstall dọn sidecar → DR29
7. regression kit-source + suite GREEN → DR1-DR21 + T12

## Boundary

- KHÔNG đụng settings.json / hooks wiring / story-medic / workfront-driver
- KHÔNG bump version · KHÔNG đổi kit.json provides (rehash số có thể đổi do bin)
- KHÔNG merge vào story-local5-improve-kit · KHÔNG đụng primary/main
