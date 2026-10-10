# Context pack — LOCAL-5 sf-2 — story-watchdog --launch-next scoping

> BƯỚC-0: header phải chứa "LOCAL-5 sf-2". Sai → DỪNG báo.

## Spec slice
`story-watchdog --launch-next` scan toàn bộ `mindmaps/*.wakii` của repo → launch
story STALE trong repo đa-story (04/10: FI-417/441/463/486/498 — dest không tồn
tại, attempt fail giữa chừng, coordinator phải STOP mid-flight).

Fix (fail-closed):
- Repo có **>1 mindmap** → `--launch-next` KHÔNG `--story <slug>` = **SKIP + warning**
  (exit 0, không launch gì)
- `--story <slug>` → chỉ scan mindmap `<slug>.wakii` — launch SF kế của ĐÚNG story đó
- Dest branch không tồn tại → skip + warning (không attempt)
- Repo **single-mindmap** → behavior hiện tại GIỮ NGUYÊN (regression bắt buộc)

## Touch map
- `kit/bin/story-watchdog` — khối --launch-next (tìm "launch-next" trong file)
- `tests/story-watchdog-tests.mjs` — fixture repo (mindmaps đa + đơn)
- `docs/` reference story-watchdog (nếu có) — ghi scoping mới

## Interface contract
- `--launch-next [--story <slug>]` — --story trước --launch-next hoặc sau đều
  parse được (arg loop case riêng)
- SKIP: stdout chứa "SKIP" + lý do ("repo đa-story — chỉ định --story", "dest
  không tồn tại"); exit 0 (không phải lỗi)
- Launch path khi đủ điều kiện: GIỮ NGUYÊN logic hiện có (không rewrite launcher)

## Dep states
- Fixture: sandbox dir với docs/superpowers/mindmaps/ chứa 2+ .wakii (1 story
  dest-tồn-tại, 1 story stale-dest-missing) — sinh trong test, không đụng repo thật
- W-suite watchdog hiện có phải giữ GREEN

## ACCEPTANCE
1. Đa-story, không --story → SKIP + warning, 0 launch, exit 0
2. --story <slug> (dest tồn tại) → launch SF kế đúng story
3. --story <slug> (dest missing) → SKIP + warning
4. Single-story → hành vi cũ nguyên vẹn
5. Suite watchdog GREEN

## Boundary
- KHÔNG đụng logic verify/tick/driver — chỉ --launch-next path
- KHÔNG thêm auto-relaunch thời gian thực (đó là driver --loop)
