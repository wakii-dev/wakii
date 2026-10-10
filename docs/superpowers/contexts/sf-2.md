# Context pack — LOCAL-5 sf-2 — story-watchdog --launch-next scoping

> BƯỚC-0: header phải chứa "LOCAL-5 sf-2". Sai → DỪNG báo.
> Pack ĐÃ ĐỒNG BỘ spec CHỐT (spec-critic 10/10) — nếu lệch spec, SPEC THẮNG.

## Spec slice
`story-watchdog --launch-next` scan toàn bộ `mindmaps/*.wakii` → launch story STALE
trong repo đa-story (04/10: FI-417/441/463/486/498 — dest không tồn tại, attempt fail
giữa chừng, coordinator phải STOP mid-flight).

Fix (spec CHỐT, fail-closed):
- **Đa-story** = đếm UNION stems (mindmaps `.wakii` + brackets legacy `*.md`) sau
  dedupe per-repo; >1 story → `--launch-next` KHÔNG `--story` = **SKIP toàn cục +
  warning liệt kê repos bị skip**, exit 0, 0 launch (repo đơn-story vẫn launch
  bình thường)
- `--story <slug>`: match exact stem sau **dash-normalization** (`fi-458` ≡ `fi458`
  — file thật `fi458-distributed-bracket.wakii`); không khớp mindmap nào → warn +
  exit 0; khớp → launch SF kế của ĐÚNG story đó
- `--story` CHỈ scope section launch_next (auto-resume/enforce-done/with-index giữ
  nguyên toàn cục)
- **Dest-absent**: local `git show-ref` trước; miss → 1 lần `git ls-remote` (timeout
  30s); miss cả hai → skip + warning. Check ở LAUNCH PATH CHUNG — cả khi không --story
  (tránh false-skip dest chỉ tồn tại trên remote)
- Single-mindmap repo: behavior giữ nguyên (regression bắt buộc)

## Touch map
- `kit/bin/story-watchdog` — khối --launch-next (tìm "launch-next" trong file)
- `tests/story-watchdog-tests.mjs` — fixture repo
- Fixture: **git repo THẬT** (git init + dest branch thật — P1-1), mindmaps đa+đơn,
  2+ stems dash-normalization (fi-458/fi458), 1 bracket legacy `.md` (P2 union);
  sinh trong test, không đụng repo thật

## Interface contract
- `--launch-next [--story <slug>]` — --story trước/sau --launch-next đều parse được
  (arg loop case riêng)
- SKIP: stdout chứa "SKIP" + lý do ("repo đa-story — chỉ định --story", "dest
  không tồn tại"); exit 0 (không phải lỗi)
- Launch path khi đủ điều kiện GIỮ NGUYÊN (không rewrite launcher)
- Bracket legacy `*.md` tính vào union story count (P2 — không bỏ sót)

## ACCEPTANCE
1. Đa-story, không --story → SKIP + warning, 0 launch, exit 0
2. --story <slug> (dest tồn tại) → launch SF kế đúng story
3. --story <slug> không khớp mindmap nào → warn + exit 0
4. Dest missing (local show-ref + ls-remote miss) → SKIP + warning (launch path chung)
5. Single-story → hành vi cũ nguyên vẹn
6. Suite watchdog GREEN

## Boundary
- KHÔNG đụng logic verify/tick/driver — chỉ --launch-next path
- KHÔNG thêm auto-relaunch thời gian thực (driver --loop lo)
- Known limitation (P1-4, cố tình hoãn): worktree-ownership `sf-N-*` chéo story
  (glob `sf-$n-*` ~368) — ghi Boundary doc, lineage check là fix đúng — phase sau
- P0-2 (plan): task CUỐI = rehash ×2 (kitHash + fingerprint) + manifest GREEN
  trước commit
