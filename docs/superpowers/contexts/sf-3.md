# Context pack — LOCAL-5 sf-3 — story-verify + story-mindmap defects

> BƯỚC-0: header phải chứa "LOCAL-5 sf-3". Sai → DỪNG báo.

## Spec slice (3 defects — P0 xác minh mức source)
1. **B3 mindmap-glob** (`story-verify` ~dòng 184 + 422): `for wf in
   "$wt"/docs/superpowers/mindmaps/*.wakii` lấy match ĐẦU — story cũ
   alphabetically-trước (vd FI-305) chặn story local → B3 FAIL ảo
   → Fix: resolve mindmap theo **story ID hiện tại** (từ audit/dest/kích hoạt),
   không first-match glob
2. **B1 evidence anchor** (`story-verify` ~dòng 246-247): gate tìm
   `docs/superpowers/evidence/<sf-ngắn>/test-run.txt` trong khi flow ghi
   `evidence/<tên-worktree-đầy-đủ>/` → anchor hụt
   → Fix: **full-worktree-name bắt buộc** + fallback theo slug
3. **`story-mindmap --update-state`** (~416-470): `readOrcaStates` map
   `done/in_progress` trong khi orca thật emit
   `pending|ready|dispatched|completed|failed|blocked` (task-handlers.ts:10-16)
   → `completed` không khớp "done" → node bị ghi `pending` (đảo trạng thái)
   → Fix: bảng map orca→mindmap: `completed→done`; `failed→failed`;
   `ready|dispatched→in-progress`; `pending|blocked→pending`;
   done-node KHÔNG bao giờ bị hạ. Test stub đổi đúng vocabulary orca
   (stub cũ dùng vocab giả → xanh ảo)

## Touch map
- `kit/bin/story-verify` — 2 vị trí glob (184, 422) + B1 evidence gate (246-247)
- `kit/bin/story-mindmap` — readOrcaStates + update-state map
- `tests/` — story-verify + story-mindmap test files (tìm theo tên)
- KHÔNG đụng: `--resolve` mode của story-mindmap (LOCAL-4 sf-2 — vừa land)

## Interface contract
- B3: hàm resolve-mindmap nhận (story_hint) → trả path .wakii đúng hoặc lỗi
  rõ; không đổi CLI signature
- update-state: vocabulary map là HẰNG SỐ exported (test import được)
- States mindmap v1: pending/done (sf) · in-progress/complete (epic) — KHÔNG
  thêm state mới

## Dep states
- `--resolve` (LOCAL-4 sf-2) đọc state chuẩn giữa worktrees — GIỮ NGUYÊN
- fixture 2-mindmaps xung đột alphabetical: FI-305 style (tên trước) + story
  local (tên sau)

## ACCEPTANCE
1. Fixture glob-xung-đột → B3 resolve đúng story local (không FAIL ảo)
2. Evidence full-worktree-name → B1 PASS; thiếu → FAIL rõ
3. Fixture orca `completed` → mindmap `done` (không `pending`)
4. Fixture orca `failed` → không upgrade thành done
5. Suite story-verify + story-mindmap GREEN

## Boundary
- KHÔNG đụng --resolve, KHÔNG đổi schema v1, KHÔNG thêm state
- Defect chỉ fix trong 2 bin nêu trên
