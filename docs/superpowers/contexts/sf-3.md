# Context pack — LOCAL-5 sf-3 — story-verify + story-mindmap defects

> BƯỚC-0: header phải chứa "LOCAL-5 sf-3". Sai → DỪNG báo.
> Pack ĐÃ ĐỒNG BỘ spec CHỐT (spec-critic 10/10) — nếu lệch spec, SPEC THẮNG.

## Spec slice (3 defects — P0 xác minh mức source)
1. **B3 mindmap-glob** (`story-verify` ~184 + 422): glob first-match — story cũ
   alphabetically-trước (vd FI-305) chặn story local → B3 FAIL ảo.
   Fix rule (P1-6 pinned): story ID từ worktree basename — cắt đuôi `-sf-<n>`
   (pattern `<story>-sf-<n>` repo này) HOẶC cắt đầu `sf-<n>-` (pattern
   `sf-<n>-<slug>` repo khác); match: exact `<stem>.wakii` → boundary-anchored
   `<token>-*` với dash-normalization; 0-match hoặc >1-match → **UNKNOWN
   fail-open** (giống hành vi linear-rỗng ~329), KHÔNG FAIL; giữ precedence
   metadata-first, chỉ scoping lớp fallback
2. **B1 evidence anchor** (`story-verify` ~246-253): chính sách hiện tại ĐÃ là
   full-worktree-name primary + fallback token glob — **task = fixture-pin chính
   sách + neo biên fallback** `sf-<n>-*`/`sf-<n>.*` (hiện `sf-1*` bắt cả
   `sf-10-*` — harm thấp, chỉ sai error message) + cover smoke fallback ~352 (P2)
3. **`story-mindmap --update-state`** (~416-470): `readOrcaStates` map
   `done/in_progress` trong khi orca thật emit
   `pending|ready|dispatched|completed|failed|blocked` (task-handlers.ts:10-16)
   → `completed` không khớp "done" → node bị ghi `pending` (đảo trạng thái);
   `failed` ∉ KNOWN_STATE → decoder drop node SF âm thầm (P0-1 spec).
   Fix BẢNG MAP (spec CHỐT): `completed→done · failed→blocked ·
   dispatched→in-progress · ready→pending · còn lại giữ nguyên` — không giá trị
   map nào nằm ngoài KNOWN_STATE (story-mindmap:51); no-downgrade: `done`
   absorbing. Fix nằm ở `readOrcaStates` → tự cover CẢ `--update-state` lẫn
   `--bracket` generate. Test stub đổi đúng vocabulary orca (stub cũ vocab giả →
   xanh ảo). T2.8 downgrade assert sửa trong cùng task (P1-4)

## Touch map
- `kit/bin/story-verify` — 2 vị trí glob (184, 422) + B1 evidence gate (246-253)
- `kit/bin/story-mindmap` — readOrcaStates + KNOWN_STATE (~51) + update-state map
- `tests/` — story-verify + story-mindmap test files (tìm theo tên)
- KHÔNG đụng `--resolve` mode của story-mindmap (LOCAL-4 sf-2 — vừa land)

## Interface contract
- B3: hàm resolve-mindmap nhận (story_hint) → trả path .wakii đúng hoặc lỗi rõ;
  không đổi CLI signature
- update-state: vocabulary map là HẰNG SỐ exported (test import được)
- States mindmap v1: pending/done (sf) · in-progress/complete (epic) — KHÔNG
  thêm state mới; `--resolve` GIỮ NGUYÊN; schema v1 không đổi

## Dep states
- Fixture 2-mindmaps xung đột alphabetical: FI-305 style (tên trước) + story
  local (tên sau)
- Fixture update-state: vocabulary orca thật (task-handlers.ts:10-16)

## ACCEPTANCE
1. Fixture glob-xung-đột → B3 resolve đúng story local (hết FAIL ảo)
2. B3 0-match → UNKNOWN fail-open (không FAIL)
3. Evidence full-worktree-name → B1 PASS; thiếu → FAIL rõ
4. Fixture orca `completed` → mindmap `done` (không `pending`)
5. Fixture orca `failed` → `blocked`, không upgrade done, không drop node
6. Suite story-verify + story-mindmap GREEN

## Boundary
- KHÔNG đụng --resolve, KHÔNG đổi schema v1, KHÔNG thêm state
- Defect chỉ fix trong 2 bin nêu trên
- P0-2 (plan): task CUỐI = rehash ×2 + manifest GREEN trước commit
