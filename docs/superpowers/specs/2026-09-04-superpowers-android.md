# Superpowers on Android — Epic Spec

Date: 2026-09-04 (rev 3 — spec-critic round 3 PASS-WITH-FIXES, đã fix)
Status: SPEC-APPROVED-FOR-PLANNING (plan-critic pending)
Story branch: `story/<epic-id>-superpowers-android` (tạo lúc APPROVE)
Base: fork từ `feat/panel-storage-get` (nhánh dev fork Wakii — KHÔNG phải `main` upstream)

**Naming note:** sản phẩm = **Wakii** (rebrand của fork; upstream gốc là Orca).
Tài liệu này + UI strings mới + story docs dùng "Wakii". Code identifiers, paths,
CLI binary (`orca …`) và method RPC giữ nguyên tên kỹ thuật hiện có — KHÔNG rename
code (phá khả năng merge upstream; nếu cần là story riêng).

## 0. IDEA-BRIEF (8 chiều)

- **Task** — xem trạng thái story-workflow (bracket/SF/gate) và resolve decision
  gates từ điện thoại đã pair
- **Output** — RPC methods mới `superpowers.*` phía desktop (Electron) + screens
  mới trong Wakii mobile app (Expo RN, `mobile/`) — chạy cả Android + iOS
- **Users** — owner chạy story workflow muốn giám sát + duyệt gate khi rời máy
- **Constraints** — mọi method mobile-facing phải vào `MOBILE_RPC_METHOD_ALLOWLIST`;
  không phá fence `resolveRunScope` của `orchestration.gateResolve` (CLI path giữ
  nguyên); wire-compat: old client thấy notification source mới phải hiển thị
  an toàn (không crash, không đọc fields lạ — behavior pinned mục 3)
- **Input** — khảo sát Phase 0 đã verify: typed RPC registry (`defineMethod` +
  `ALL_RPC_METHODS`), bracket files parse bởi launcher plugin worker + kit CLIs,
  gates = orchestration SQLite DB, notification plumbing end-to-end
- **Context** — repo Wakii (fork); superpowers-launcher plugin + story-team-kit
  đã bundled; mobile app v0.0.47 pair ổn định qua ws://desktop:6768 (direct + relay)
- **Success criteria** — mở app trên Android → thấy story đang chạy + tiến độ SF →
  nhận notification khi gate mở → tap → deep-link → resolve gate (confirm) → agent
  trong terminal tiếp tục — không chạm laptop (binary assertions ở mục 5)
- **Out-of-scope** — chạy agent trên phone (Termux), FCM/APNs true push, bracket
  editor (chỉ xem + resolve), cloud relay productization, Android native non-Expo,
  sửa format bracket file, rename code identifiers orca→wakii

## 1. Problem

Story workflow hôm nay đòi ngồi desktop: bracket state là markdown trong worktree
(`docs/superpowers/brackets/*.md`), gates nằm trong orchestration SQLite DB, và
đường resolve duy nhất là agent chạy CLI trong terminal (prompt do plugin
superpowers-launcher gõ vào — `buildGatePrompt`). Điện thoại đã pair có đủ
transport + notification pipeline + UX gates-adjacent (agent approval prompts)
nhưng không có lối đọc superpowers state hay đường ghi vào gates.

Vấn đề đúng chất là **capability remoteness** — không cần port gì sang Android,
chỉ cần expose state + write path qua RPC layer đã có.

## 2. Decisions đã chốt (user-approved 2026-09-04)

| # | Decision | Value |
|---|----------|-------|
| 1 | Scope v1 | Cả 3 capability trong 1 story: xem story + resolve gate + notification |
| 2 | UI direction | `Design: none` — inherit design system mobile hiện có (pattern tasks/PR screens) |
| 3 | Thiết bị | Android-first testing, code cross-platform Expo |
| 4 | Quy mô | 4 SF (nền RPC → screens → gate UX + notifications → convergence QA) |
| 5 | Notification background | Chấp nhận v1: chỉ khi websocket connected hoặc reconnect catch-up (replay buffer); không FCM/APNs |
| 6 | Gate resolve authority | Phone paired được resolve MỌI pending gate trên host; mỗi resolve qua confirm dialog + pending-status guard; gate legacy không map được worktree vẫn resolve được (nhóm "khác") |

## 3. Architecture (khóa từ Phase 0 — không đổi sau SF-1)

**Direction A — new `superpowers.*` RPC projection** (đã chọn qua so sánh 3 hướng):
- Desktop join bracket markdown parse + orchestration gates DB → trả typed
  projection 1 round-trip; phone stays thin
- KHÔNG allowlist `orchestration.gateList/gateResolve` (fence `resolveRunScope`
  terminal-handle-based không fit phone; expose cả run surface = surface lớn)
- `superpowers.gateResolve` là method MỚI với authorization riêng (device paired +
  pending-status guard), không đụng fence CLI
- Bracket parsing: tách shared module từ logic đã proven trong
  `plugin-host-method-bindings.ts` (`workspace.fileList/fileRead/planProgress`) —
  tránh parser thứ 4 trùng lặp; projection phải khớp output của launcher plugin
  (fixture test với bracket thật đã sanitize, commit trong repo — test chạy được
  trong CI, không phụ thuộc worktree người dùng)

**Gate lifecycle notifications — hook ở store layer** (đã chọn qua so sánh 3 hướng):
- Hook `createGate`/`resolveGate`/`timeoutGate` trong `decision-gate-store.ts` —
  mọi writer (CLI/RPC/plugin/coordinator) funnel qua store nên bắt được hết
- Transition → notification: `createGate` (status pending) → source `'gate-open'`;
  `resolveGate` + `timeoutGate` → source `'gate-closed'` (phone dùng để gỡ gate
  khỏi pending list, kể cả khi resolution đến từ desktop/CLI/agent timeout)
- Payload 'gate-open'/'gate-closed' mang routing fields: `gateId`,
  `storyId: string | null` (derivation ở dưới), `worktreeId: string | null`,
  `title` — chốt NGAY SF-1 để không phải đổi wire giữa chừng; desktop source
  union mở thêm 2 giá trị này (thay đổi nhỏ, thuộc scope SF-1)
- **Gate→story derivation (PINNED):** gate không có cột story. Derivation:
  `gate.run_id → run.worktree` (khi có) → các bracket files trong worktree đó:
  đúng 1 bracket → `storyId` = bracket đó; ≥2 brackets → bracket `updatedAt` mới
  nhất (limitation ghi nhận, không block); không run / legacy `LEGACY_RUN_ID` /
  worktree không có bracket → `storyId: null` + `worktreeId: null` (nhóm "khác").
  `storyLinked` trong storyDetail = `gate.worktreeId === story.worktreeId && worktreeId != null`.
  `pendingGates` của story = đếm gates có cùng worktreeId. SF-1 probe DB thật
  xác nhận tỷ lệ gates map được (risk 1)
- **Wire-compat (re-pinned theo hành vi thật của code):** old client KHÔNG có
  source filtering — notification source lạ được HIỂN THỊ bình thường (title/body),
  tap route theo hostId/worktreeId có sẵn, fields lạ (`gateId`/`storyId`) không
  bao giờ được đọc. Criterion SF-4 = regression test khớp đúng hành vi này
  (hiển thị + không crash + route worktree), KHÔNG phải "drop im lặng"
- KHÔNG file-watcher trên `docs/superpowers` (sai signal — gates ở SQLite) và
  KHÔNG tin kit/plugin tự dispatch (không central guarantee)

## 3b. RPC contracts (PINNED — SF-1 build theo đúng đây, SF-2/SF-3 code chống đây)

Wire method names dùng prefix kỹ thuật `superpowers.*` (không đổi theo brand).

```ts
// superpowers.storyList — liệt kê mọi story trên host, grouped per worktree
// params: {}
type StoryListResult = {
  stories: Array<{
    storyId: string          // relative path bracket file từ docs/superpowers/ (vd 'brackets/fi300-downloads-mobile.md')
    title: string            // từ dòng '# Story: <ID> — <title>'
    epicId: string           // vd 'FI-300'
    worktreeId: string | null // null = tìm thấy ngoài worktree đăng ký (nhóm 'khác')
    workspaceName: string
    sfTotal: number
    sfDone: number           // đếm sfs[].status === 'done' (fallback 0 khi Linear không connect)
    pendingGates: number     // gates map được vào story này, status pending
    updatedAt: number        // mtime bracket file (epoch ms)
  }>
}
// Một bracket file = một entry (1 worktree có thể có nhiều bracket → nhiều entry,
// UI group theo worktree). Bracket malformed → entry với sfTotal=0 + flag
// `parseError: true` (thêm vào shape trên) — KHÔNG làm fail method.

// superpowers.storyDetail — projection 1 story + gates
// params: { storyId: string }
type StoryDetailResult = {
  story: {
    storyId: string; title: string; epicId: string; destination: string | null
    worktreeId: string | null; workspaceName: string
    parseError: boolean
    sfs: Array<{
      name: string           // 'SF-1'
      title: string
      tier: number
      what: string
      dependsOn: string[]    // ['SF-1', …] — rỗng nếu tier 0
      linear: string | null  // id sub-issue nếu bracket ghi
      status: 'todo' | 'in-progress' | 'done' | 'unknown'
      // Nguồn status (SF-1 scope MỚI — được budget, không giả định có sẵn):
      // đọc Linear sub-issue status qua Linear integration hiện có của desktop,
      // batch theo epic; Linear chưa connect / lỗi / bracket không ghi `linear:`
      // → 'unknown' (phone hiển thị state trung tính, không đoán). SF-1 probe
      // Linear API rate-limit trước khi chốt tần suất poll (1 lần/request màn là đủ v1)
    }>
  }
  gates: Array<{
    gateId: string
    title: string
    status: 'pending' | 'resolved' | 'timeout'
    resolution: string | null
    options: string[]        // options gate khai báo (có thể rỗng)
    worktreeId: string | null
    createdAt: number
    storyLinked: boolean     // true nếu map được vào story này, false = gate 'khác'
  }>
}
// storyId không tồn tại / bracket đã xóa giữa 2 poll → error code
// 'story_not_found' (phone hiển thị stale-state + refresh, không crash).

// superpowers.gateResolve — resolve 1 gate từ phone
// params: { gateId: string, resolution: string }
type GateResolveResult = { gateId: string; status: 'resolved'; resolution: string }
// Error taxonomy (result-field codes, KHÔNG throw chung chung):
//   'gate_not_found'    — id sai / gate đã bị xóa
//   'gate_not_pending'  — gate đã resolved hoặc timeout (phone refresh state, retry vô nghĩa)
//   'invalid_resolution'— resolution rỗng/whitespace
// Server CHỦ TƯƠNG cho resolution không nằm trong `options` (contract chấp nhận
// mọi non-empty string; việc ép chọn option là việc của UI phone — cố ý, không phải thiếu sót)
// Authorization: device phải paired (scope mobile, đã qua E2EE auth của transport).
// KHÔNG tái dùng resolveRunScope (terminal-handle keyed) — fence CLI giữ nguyên.
```

**Resolve semantics (chốt):**
- Phone gửi `resolution` là string. SF-3 UX: nếu gate có `options` → hiện choice
  buttons (giá trị = option); nếu rỗng → free-text field. Confirm dialog trước mọi resolve.
- **Pending guard = conditional UPDATE ở store layer**, pattern như `timeoutGate`
  (`UPDATE … SET status='resolved' WHERE id=? AND status='pending'`): method store
  mới `resolveGateIfPending(gateId, resolution)` — chỉ đường phone dùng. CLI path
  `resolveGate` giữ nguyên semantics (không đổi hành vi hiện có). Race
  phone-vs-CLI: conditional UPDATE chỉ land khi còn pending → phone không bao giờ
  overwrite (CLI vẫn last-write-wins như hôm nay — ngoài scope đổi).
- Gate status `timeout`: KHÔNG resolve được từ phone (`gate_not_pending`); UI
  hiện trạng thái timeout read-only.

## 4. SF structure

```
SF-1 (tier 0) Desktop RPC foundation + gate lifecycle notification hook
SF-2 (tier 1) Mobile Story screens (list + bracket/SF detail + progress)
SF-3 (tier 1) Gate resolve UX + notification routing trên phone
SF-4 (tier 2) Convergence QA (device e2e + security review + wire-compat)
```

- SF-1: 3 methods đúng contract mục 3b; allowlist entries (`superpowers.storyList`,
  `superpowers.storyDetail`, `superpowers.gateResolve`); store hook
  `resolveGateIfPending` + dispatch `'gate-open'`/`'gate-closed'` với routing fields;
  probe gate→worktree join trên DB thật (legacy `LEGACY_RUN_ID` → worktreeId null,
  `storyLinked: false`, vẫn nhận notification + resolve được — không có gate
  "resolvable-but-invisible"); fixture bracket sanitized commit trong repo.
- SF-2: theo pattern hiện có — expo-router route host-scoped, data module
  (`sendSingleFlightRequest`), hooks `use-mobile-*`; nhiều story/1 worktree →
  group theo worktree; polling khi foreground (interval nhẹ) + pull-to-refresh;
  cache render + reconnect-refresh là behavior của data module (implement ở SF-2,
  verify ≤10s ở SF-4); bracket xóa/malformed giữa 2 poll → stale banner + refresh,
  không hard-fail; strings theo convention inline hiện có (probe i18n đầu SF-2 —
  mobile CHƯA có i18n mechanism, KHÔNG thêm i18n library mới trong story này);
  SF-2 gồm cả Linear sub-issue status read phía desktop (tách khỏi SF-1 để
  không treo critical path — SF-1 ship fallback 'unknown').
- SF-1 commit pinned §3b TS types + fixture vào location importable từ `mobile/`
  (contract-drift guard); SF-2/SF-3 mỗi cái có conformance smoke test chống
  fixture committed.
- SF-3: pending-gates surface + resolve flow (choice buttons theo `options` /
  free-text fallback, confirm dialog); notification payload parse + gate-open/
  gate-closed handling (pending list add/remove) — testable bằng fixture payloads
  (KHÔNG gồm route wiring — cần route của SF-2, wiring thuộc SF-4);
  resolve fail (`gate_not_pending`/ws drop giữa confirm-response) → refresh state
  + hiển thị trạng thái mới; **retry model: re-tap an toàn** — guard trả
  `gate_not_pending` sạch, không side effect.
- SF-4: deep-link route wiring (notification tap → route story của SF-2, học
  `gateId`/`storyId` — cần SF-2 + SF-3); device-session e2e trên Android thật
  CHUỖI serialized (story visible → notification ≤5s → tap → resolve → agent
  continues; desktop-restart cache + ≤10s verify; parity ≥2 story thật với
  seeded brackets); security review allowlist + `resolveGateIfPending`; wire-compat
  regression test mức unit (recorded `gate-open` payload — không cần old APK);
  multi-root/multi-host assertion (không first-match, hostId đúng); i18n/strings
  audit; docs update (mobile README + notifications docs).

Dependency notes: SF-2 và SF-3 đều chỉ depend SF-1 (code chống contract 3b);
SF-2 → SF-3 chỉ dùng chung contract, chạy song song được.

## 5. Success criteria (binary)

- `storyList`/`storyDetail` output khớp superpowers panel desktop trên ≥2 bracket
  thật (fixture test pass trong CI) — parity parse rules chứng minh bằng test,
  không bằng mắt
- Resolve từ phone: agent trong terminal thấy gate resolved + tiếp tục workflow;
  resolve gate đã resolved/timeout → nhận đúng error code, state phone refresh,
  KHÔNG overwrite (test 2 request song song → đúng 1 land)
- Notification latency: gate mở khi ws connected → phone nhận local notification
  **≤ 5s** từ lúc dispatch; miss → reconnect catch-up thấy (replay buffer test)
- Tap notification → mở đúng màn story + gate anchor (deep-link e2e trên Android thật)
- Wire-compat: regression test khớp hành vi thật — old mobile build nhận dispatch
  source lạ (`gate-open`) → HIỂN THỊ notification (title/body), không đọc fields
  lạ, không crash, tap route theo hostId/worktreeId
- Security review pass: surface = đúng 3 method, không nới fence CLI,
  resolve bắt buộc paired device + confirm dialog (code-review + security-audit)
- Desktop restart giữa lúc phone mở story screen: màn render từ cache ngay và
  tự refresh **≤ 10s** sau khi reconnect (không block, không trắng màn)

## 6. Risks (từ Phase 0 + critic)

1. **Gate→worktree join (high)** — `decision_gates` không có cột worktree,
  `run.worktree` optional, legacy runs `LEGACY_RUN_ID` → probe DB thật trong
  SF-1 trước khi khóa query; fallback đã pin: worktreeId null + nhóm "khác"
2. **Authorization model phone (high)** — đã chốt decision #6 + contract 3b;
  security review SF-4 (replay attack surface, idempotency)
3. **Bracket format parity (medium)** — shared module + fixture sanitized trong
  repo (CI-replayable); format file = cross-repo contract (launcher plugin, kit
  CLIs, RPC parser)
4. **Wire-compat (medium)** — routing fields mới trong notification payload;
  old client ignore field lạ (đã pin, test ở SF-4)
5. **Notification khi background (medium)** — đã chấp nhận (decision #5); docs
  UI ghi rõ "nhận gate khi app mở/reconnect"
6. **i18n mobile (low)** — probe đầu SF-2
7. **Multi-root workspace (low-medium)** — projection liệt kê per-workspace,
  KHÔNG dùng `resolveWorkspaceDocsRoot` first-match; multi-host routing đã đúng
  sẵn (local notification data mang hostId) — asserted ở SF-4
