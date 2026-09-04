# Context pack — FI-305 SF-1: Desktop RPC foundation + gate notifications

Source spec: `docs/superpowers/specs/2026-09-04-superpowers-android.md` (rev 3).
Contracts PINNED ở spec §3b — build đúng theo đây, không tự ý đổi shape.

## Spec slice
3 RPC methods mới `superpowers.storyList` / `superpowers.storyDetail` /
`superpowers.gateResolve` đúng signature + error taxonomy §3b; allowlist 3 method
đó; notification source union mở thêm `'gate-open'`/`'gate-closed'` với payload
`{gateId, storyId: string|null, worktreeId: string|null, title}`; store-layer
hooks cho create/resolve/timeout; method store mới `resolveGateIfPending`
(conditional UPDATE `WHERE status='pending'`, pattern `timeoutGate`) — CLI
`resolveGate` GIỮ NGUYÊN semantics; gate→story derivation theo §3 (run→worktree→
bracket, legacy → null/"khác"); SF status trong storyDetail v1 = `'unknown'`
(Linear read là task SF-2); fixture bracket sanitized + §3b TS types commit vào
location importable từ `mobile/`.

## Touch map (verified Phase 0/plan-critic)
- NEW `src/main/runtime/rpc/methods/superpowers.ts` — register trong `ALL_RPC_METHODS`
  (`src/main/runtime/rpc/methods/index.ts`)
- `src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts` — thêm 3
  entries; extend enforcement test `mobile-rpc-allowlist.test.ts`
- `src/main/runtime/orchestration/db/decision-gates/decision-gate-store.ts` —
  thêm `resolveGateIfPending` (KHÔNG đổi `resolveGate`/`timeoutGate` hiện có)
- `src/main/runtime/runtime-mobile-notification-controller.ts` — source union
  + dispatch payload
- Shared bracket-parse module — tách logic từ
  `src/main/plugins/plugin-host-method-bindings.ts`
  (`workspace.fileList/fileRead/planProgress`, `resolveWorkspaceDocsRoot`) —
  KHÔNG dùng first-match cho storyList (multi-root liệt kê hết)
- Shared types location importable từ `mobile/` (chọn lúc plan; constraint:
  mobile bundle build được độc lập với Electron main)
- `docs/reference/remote-wire-compatibility.md` — update cho 2 source mới +
  payload fields (AGENTS.md hard rule: wire change phải update doc này)

## ACCEPTANCE (user-visible / verifiable)
- Từ client paired (mock hoặc mobile dev build): `superpowers.storyList` trả
  stories group per worktree với đúng pendingGates; `storyDetail` trả sfs + gates
  đúng §3b; story không tồn tại → error `story_not_found`
- `gateResolve` trên gate pending → resolved, agent/CLI thấy kết quả; resolve lại
  → `gate_not_pending` KHÔNG overwrite; gate lạ → `gate_not_found`; resolution
  rỗng → `invalid_resolution`; resolution không nằm trong options vẫn chấp nhận
  (chủ tương — UI phone mới ép option)
- Gate create trên desktop → notification `'gate-open'` đi tới subscriber với đủ
  routing fields; resolve/timeout → `'gate-closed'` — kể cả khi writer là CLI
- Fixture parity test pass trong CI: parse output của shared module khớp output
  launcher plugin trên cùng bracket fixture
- `mobile-rpc-allowlist.test.ts` chứng minh 3 method mới allowed, và mọi method
  KHÔNG allowlist vẫn bị chặn (regression)
- CLI path `orca orchestration gate-resolve` hoạt động đúng như trước (không đổi)

## Boundary
- KHÔNG đổi format bracket file, KHÔNG sửa kit/launcher plugin
- KHÔNG allowlist `orchestration.*` cho mobile
- KHÔNG làm Linear status read (thuộc SF-2) — storyDetail hardcode status 'unknown'
- KHÔNG file-watcher cho bracket edits
- KHÔNG đụng mobile UI (screens thuộc SF-2/SF-3) — trừ shared types location
- KHÔNG đổi `resolveGate` hiện có (CLI last-write-wins giữ nguyên)
