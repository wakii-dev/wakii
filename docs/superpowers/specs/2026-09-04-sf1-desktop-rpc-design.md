# SF-1 Design — Desktop RPC foundation + gate notifications (FI-306)

Parent spec: `2026-09-04-superpowers-android.md` rev 3 (§3b contracts PINNED).
Context pack: `docs/superpowers/contexts/sf-1.md`.
Status: rev 3 — spec-critic round 1 FIX-P0-FIRST đã fix; round 2 PROCEED; rev 3 amend
adaptation 3 (storyList null-group) theo plan-critic round 1 + REQUIREMENT-GAP batch 2 lên epic.

## Scope

Build đúng §3b: 3 RPC methods, allowlist + enforcement test, `resolveGateIfPending`,
notification `'gate-open'`/`'gate-closed'` với routing fields, gate→story derivation,
shared §3b TS types + sanitized fixture, wire-compat doc update.

Out of scope (boundary từ context pack): bracket format đổi, kit/plugin sửa, Linear
status read (SF-2 hardcode `'unknown'`), file-watcher, mobile UI, `resolveGate` đổi,
refactor `planProgress` (parse plans-checkbox — không dùng chung logic gì với bracket
parser; critic P1 — cut).

## Contracts

§3b verbatim (types + error taxonomy + resolve semantics) — không lặp lại ở đây.
TS types commit tại **`src/shared/superpowers/story-rpc-contract.ts`** (pattern đã
verify: mobile deep-relative import `../../../src/shared/...` — worktree-host-row-identity.ts:1;
file type-only, KHÔNG import node/electron để Metro bundle độc lập).

**Error delivery: result-field codes — chủ đích theo §3b** ("result-field codes,
KHÔNG throw chung chung"). Lưu ý (để executor không hiểu lầm căn cứ): throw +
thêm code vào `STRUCTURED_RUNTIME_PASSTHROUGH_CODES` (rpc/errors.ts:80-133) LÀ
con đường khả thi khác, nhưng §3b đã pin result-field nên không dùng. Shape:
- `superpowers.storyDetail` → `StoryDetailResult | { error: 'story_not_found' }`
- `superpowers.gateResolve` → `GateResolveResult | { error: 'gate_not_found' | 'gate_not_pending' | 'invalid_resolution' }`

**Field semantics (chốt — nguồn chưa pin ở §3b):**
- `epicId` = id trong heading `# Story: <ID> — <title>` (chính là linear id cấp
  epic của story — vd FI-305). Không có nguồn khác trong bracket format.
- Notification `title` = `gate.question` (DecisionGateRow không có cột title);
  `body` = `''` với `'gate-open'`, `resolution` với `'gate-closed'` (payload
  `MobileNotificationDispatchEvent.body` là required — old client hiển thị body).
- `storyDetail.gates[]` membership: gate được include IFF `storyLinked(gate, story)`
  HOẶC `gate.worktreeId === null` (nhóm "khác" — SF-3 pending surface cần).
  Gates của story/worktree KHÁC excluded (thuộc detail story đó).
- storyList sort: `updatedAt` desc, tie-break `storyId` asc (parity test deterministic).
- `storyDetail` resolve khi nhiều worktree có cùng storyId: chọn bracket có mtime
  mới nhất (khớp storyList sort). REQUIREMENT-GAP đã post lên epic FI-305 đề xuất
  extension additive `worktreeId` optional param cho v2 — SF-1 KHÔNG tự đổi §3b.

## Adaptations so với spec epic (không đổi output contract)

1. **Gate→worktree join — amendment của §3 mechanism (runs KHÔNG có cột worktree**,
   RunRow types.ts:43-53; coordinator giữ in-memory — mechanism §3 gốc dead-letter).
   Path thật: `gate.task_id → tasks → dispatch_contexts (task_id) →
   worker_dispatches (dispatch_id → dispatch_contexts.id) → worktree_id`.
   Tie-break PINNED: (a) task có nhiều dispatches → dispatch_context mới nhất
   (`ORDER BY rowid DESC LIMIT 1` — precedent createGate decision-gate-store.ts:20-26);
   (b) `worker_dispatches.worktree_id` NULL hoặc task không có dispatch → null
   (nhóm "khác"); (c) gate.task_id trỏ task không tồn tại → null ("khác"), KHÔNG lỗi.
   Không match `LEGACY_RUN_ID` filter riêng — guard là conditional trên join fail → null.
   DB probe thật đo tỷ lệ map được (output: số liệu + fixture-shaped test data;
   query đã fallback-pinned nên mọi tỷ lệ sống được — probe validate coverage,
   không mở lại query).
2. **Notification dispatch**: `OrchestrationDb` không có runtime ref → thêm
   transition listener injection (`setGateTransitionListener`). Runtime service
   wire listener → derive routing fields → dispatch qua notification controller
   surface (verify tên surface thật lúc implement — explore report
   `runtime-service-command-surface.ts:28` ghi `dispatchMobileNotification`,
   critic không thấy — probe trước, không code theo nhớ).
   **Emission semantics PINNED:**
   - `createGate` (pending) → `'gate-open'`; `resolveGate` → `'gate-closed'`;
     `timeoutGate` → `'gate-closed'` chỉ khi conditional UPDATE land (0 rows → silent);
     `resolveGateIfPending` → `'gate-closed'` chỉ khi UPDATE land (race thua → silent).
   - Listener gọi SAU khi SAVEPOINT RELEASE xong (không emit trước commit).
   - Derivation lỗi (catalog throw, join fail) → try/catch trong listener wrapper:
     fields null, vẫn dispatch với title — KHÔNG throw ngược vào store path.
3. **storyList enumeration: MỘT nguồn duy nhất = các workspace runtime-registered**
   (managed worktrees qua `listManagedWorktrees`/`listResolvedWorktrees` + folder
   workspaces qua runtime store `getFolderWorkspaces()` — quyết định nguồn cuối
   thuộc exit criteria task derivation-probe; MỌI consumer — storyList, storyDetail,
   notification routing — dùng chung nguồn này; tránh story derivable-mà-không-list).
   `resolveWorkspaceDocsRoot` (global-latest-mtime, hardcode `~/orca/workspaces` +
   `/opt/homebrew/bin/orca` — vi phạm cross-platform rule) KHÔNG dùng cho enumeration.
   **Amendment rev 3 (plan-critic):** §3b định nghĩa `worktreeId: null` = "ngoài
   worktree đăng ký (nhóm 'khác')" — v1 storyList chỉ enumerate workspace
   registered nên entries thực tế luôn mang id; `worktreeId: null` giữ trong
   contract như defensive slot (không population path v1 — quét FS ngoài registry
   đòi hỏi docs-root convention vi phạm cross-platform rule). Delta này đã flag
   lên epic FI-305 (REQUIREMENT-GAP batch 2). Nhóm "khác" THẬT vẫn tồn tại ở
   storyDetail gates (gates worktreeId null) — SF-3 surface không bị mất.
4. **Routing-field derivation scan bracket**: worktreeId → path (từ catalog) →
   `docs/superpowers/brackets/*.md`: đúng 1 bracket → storyId; ≥2 → mtime mới nhất;
   0/không path → null.

## Components

| Unit | Location | Role |
|---|---|---|
| Contract types | `src/shared/superpowers/story-rpc-contract.ts` | §3b TS types + error codes + notification payload types |
| Bracket parser (shared) | `src/main/superpowers/bracket-file-parse.ts` | parse story heading + SF sections + Tier/linear/Depends on/Tasks; output khớp launcher plugin heading-level |
| RPC methods | `src/main/runtime/rpc/methods/superpowers-story-list.ts` + `superpowers-story-detail.ts` + `superpowers-gate-resolve.ts` (+ index.ts register mỗi file 1 array — pattern orchestration-*.ts) | storyList / storyDetail / gateResolve — 3 file RIÊNG để chạy song song không xung đột (plan-critic P0-1) |
| Gate store | `decision-gate-store.ts` | + `resolveGateIfPending` + transition listener hook |
| Notification | `runtime-mobile-notification-controller.ts` | source union +2; payload `{gateId, storyId: string\|null, worktreeId: string\|null, title}` |
| Allowlist | `runtime-rpc-mobile-method-allowlist.ts` + `mobile-rpc-allowlist.test.ts` | +3 entries + enforcement regression |
| Fixture | `src/main/superpowers/__fixtures__/fi305-bracket-fixture.md` (sanitized) + parity test | parse output khớp plugin `parseBracketFile` heading-level |
| Wire-compat doc | `docs/reference/remote-wire-compatibility.md` | prose update: 2 source mới (Rule 1 — mobile display-all an toàn) |

`plugin-host-method-bindings.ts`: refactor CHỈ phần heading-parse của
`workspace.fileList`/`fileRead` sang shared parser — behavior giữ nguyên (test
hiện có regression). `planProgress` KHÔNG đụng.

## resolveGateIfPending (PINNED chi tiết — critic P0-1)

Pattern `timeoutGate` cho **conditional UPDATE** (`WHERE id=? AND status='pending'`,
chỉ land khi còn pending), NHƯNG khi UPDATE land (rows changed > 0) phải
`updateTaskStatus(gate.task_id, 'ready')` — như `resolveGate` (decision-gate-store.ts:107).
KHÔNG copy nguyên `timeoutGate` (nó cố ý KHÔNG update task — timeout ≠ ready).
Race thua (0 rows) → KHÔNG đụng task status, return `gate_not_pending`. CLI
`resolveGate` giữ nguyên (last-write-wins như hôm nay).

## Testing

- Unit: parser (heading/SF/malformed/0-SF), `resolveGateIfPending` (pending-only
  guard, race với `resolveGate` — 2 request song song đúng 1 land, task status
  chỉ update khi land), derivation tie-breaks (multi-dispatch/NULL worktree_id/
  task xóa/legacy), error taxonomy từng code, allowlist enforcement (3 method
  allowed + method lạ blocked).
- Parity: shared parser vs plugin output trên fixture committed (CI-replayable).
- Integration: notification emission per semantics bảng trên (kể cả writer là
  CLI path; race-thua KHÔNG emit; emit sau release).
- Probe: DB thật — tỷ lệ gates map được worktreeId (fixture-shaped test data).

## Fixture sanitization criteria (chốt)

Giữ nguyên cấu trúc format (heading/SF/Tier/linear/Depends on/Tasks/Destination)
để parity có ý nghĩa; giữ FI-ids (đã public trong repo); thay nội dung mô tả
bằng placeholder trung tính khi chứa thông tin cá nhân/project riêng. File mới
tạo trong `__fixtures__/` — KHÔNG copy bracket thật vào test tree.

## Open questions đã self-answer

- Q: `story_not_found` throw hay result-field? A: result-field (§3b pin — xem Contracts).
- Q: gate title? A: `gate.question`; body theo bảng emission (P2 fixed).
- Q: storyList sort? A: updatedAt desc, tie-break storyId asc.
- Q: surface name để dispatch notification? A: probe `runtime-service-command-surface.ts` lúc implement — không code theo nhớ.
