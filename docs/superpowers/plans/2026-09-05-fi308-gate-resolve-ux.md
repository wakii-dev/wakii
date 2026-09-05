# Plan — FI-308 SF-3: Gate resolve UX + notification handling (epic FI-305)

Date: 2026-09-05 · SF-COST=BALANCED · Executor-per-task, code-reviewer giữa các task.
Inputs: `docs/superpowers/contexts/sf-3.md` (spec slice + ACCEPTANCE + boundary) ·
`docs/superpowers/specs/2026-09-04-superpowers-android.md` §2/§3/§3b/§4/§5 (contracts PINNED) ·
phase0 impact `/tmp/story/fi305/phase0-impact-analyst.md` (file:line evidence).
Branch: `VuHoi/sf-3-gate-resolve-ux` (fork = story tip da90feaa71) · Merge target: `story/fi305-superpowers-android`.

## 0. Scope Sentence

Phone thấy mọi pending gate trên host (story-linked + nhóm "khác"), resolve qua
choice buttons (theo `options`) hoặc free-text + confirm dialog bắt buộc;
`gate-open`/`gate-closed` events giữ pending list tươi kể cả qua reconnect; mọi
lỗi resolve refresh state sạch, re-tap an toàn. **Mobile-only** — desktop đã ship
hết ở SF-1 (contract, pending guard, dispatch, allowlist — đã verify thật trong worktree).

## 1. Design decisions (Phase 0 → khóa, có evidence)

| # | Decision | Vì sao (evidence) |
|---|----------|-------------------|
| D1 | **Data source = hybrid (Direction C)**: reconcile sweep (`storyList` → `storyDetail` per story, merge + dedup `gateId`) authoritative trên mount/reconnect/pull-to-refresh; `gate-open`/`gate-closed` events mutate store để liveness giữa 2 sweep. **Membership rule (đã đọc code 2 vòng — spec-critic + plan-critic bắt lỗi phase0, bản cuối):** `storyDetail` CHỈ chứa gates của story đó (`storyLinked:true`) + gates worktreeId=null (nhóm 'khác'); LOẠI gates worktree khác (`superpowers-story-detail.ts:124`). **Wire payload both-or-neither:** dispatch gán CẢ HAI `worktreeId`+`storyId` khi worktree map được bracket, hoặc KHÔNG CÓ key nào khi không (mapped-worktree-no-bracket → "both null" 'khác' — `runtime-gate-transition-notifications.ts:77-100`); key ABSENT khi null. → overlay-only class THẬT = gates both-absent trên host 0 story (không storyDetail nào gọi được) + event windows bị mất; sweep phân loại lại 'khác'-drift (derivation point-in-time) | Poll-only không thấy nhóm "khác" khi host 0 story; push-only gãy >256-event replay buffer + desktop restart void epoch; chỉ hybrid thỏa cả 3 |
| D2 | **Resolve = bottom sheet per gate** (`BottomDrawer` + confirm `Alert.alert` unconditional), KHÔNG route riêng per gate | Precedents đủ đầy (docked TextInput qua `fillAvailable` `BottomDrawer.tsx:9-13`, options `MobileNativeChatPermission.tsx`, sendingRef `MobileNativeChatQuestion.tsx:37-48`); 0 đụng shared navigation ngoài 1 dòng đăng ký route list |
| D3 | **Pending-gates list = route mới** `mobile/app/h/[hostId]/gates.tsx`, đăng ký 1 dòng additive trong `mobile/app/h/_layout.tsx` HostStack + 1 entry additive trong host-screen sidebar | Task bracket `pending-gates-surface-other-group` đòi surface user-reachable; chỉ chạm 2 shared files bằng dòng additive (SF-2 cũng thêm dòng của nó — merge additive vô conflict) |
| D4 | **Resolve write đi plain `client.sendRequest` + `submittingRef` guard — CẤM `sendSingleFlightRequest` cho write** | Single-flight coalescing ghi đè `followUp.params` + deliver result mới nhất cho caller cũ (`request-single-flight.ts:60-66,101-105`) → resolve gate B nhận kết quả gate C. Single-flight chỉ dùng cho reads (sweep) |
| D5 | **Payload normalizer coerce `undefined → null`** cho `storyId`/`worktreeId` | Desktop dispatch OMIT key khi null (`runtime-gate-transition-notifications.ts:97-99`) nhưng contract type `string \| null` (`story-rpc-contract.ts:70-71`) — không coerce là misroute nhóm story/khác âm thầm. Test fixture có key vắng mặt LITERALLY |
| D6 | **Store host-scoped** (Map theo hostId), KHÔNG list global | Multi-host là state thường (`useAllHostClients`); 3 conventions proven (worktree-cache, per-host setter maps, per-host notification session) |
| D7 | `gate_not_pending` = refresh + gỡ khỏi list + info, KHÔNG retryable; không auto-retry khi ws drop — exit submitting + stale banner; re-tap an toàn nhờ server conditional-UPDATE guard | `superpowers-gate-resolve.ts:37-42` + store test exactly-one-lands |
| D8 | Options unknown (gate 'khác' từ event, chưa qua sweep) hoặc rỗng → free-text; options biết → choice buttons; LUÔN confirm dialog; KHÔNG có bypass setting | Contract: server chấp nhận mọi non-empty; UI enforce options; decision #6 |
| D9 | SF-3 import CHỈ contract pinned qua deep-relative; 0 import từ SF-2 output; domain dir riêng `mobile/src/superpowers/` với file names gate-prefixed | SF-2 chạy song song chưa có commit; tránh collision + merge conflict |
| D10 | **Event delivery = passive second stream consumer**: SF-3 tự `client.subscribe('notifications.subscribe', …)` với listener riêng, CẤM đụng `getHostNotificationSession`/seen-guard/watermark/`getMissedSince` (shared session của banner delivery — second consumer đụng vào là corrupt). KHÔNG sửa `mobile-notifications.ts` | Server: mỗi subscribe register listener riêng trong Set + subscriptionId per-connection-seq "concurrent subscribes never collide" (`notifications.ts:38-64`); transport: streams keyed by request id, không theo method (`rpc-client-stream-registry.ts:49-80`) — 2 subscription song song an toàn cả 2 tầng; sweep là nguồn reconcile nên passive consumer không mất gì vĩnh viễn |
| D11 | **Error union đi success-envelope**: `{ok:true, result:{error:'gate_not_pending'}}` — client ĐỌC `result.error`, KHÔNG dựa `ok:false`. `ok:false` chỉ cho thrown/zod (unpaired, method lạ trên host cũ). Unknown code trong `result.error` → message chung + refresh (forward-compat) | Handler trả union object, không throw → `successResponse` (`dispatcher.ts:162`, `errors.ts:26-33`) |

## 2. File layout (mới — không đụng file SF-2 owns)

```
mobile/src/superpowers/
  gate-conformance-fixtures.ts        — fixture payloads typed theo contract (T1)
  gate-conformance-smoke.test.ts      — conformance smoke (T1)
  pending-gates-sweep.ts              — sweep storyList→storyDetail, merge/dedup, unavailable-marking (T2)
  pending-gates-store.ts              — per-host store: sweep data + add/upsert/remove primitives + reconcile (T2 — T5 build parser/subscriber/reducer TRÊN primitives này)
  use-mobile-pending-gates.ts         — hook đọc store per hostId (T2)
  gate-resolve-request.ts             — wrapper plain sendRequest → superpowers.gateResolve (T3)
  use-mobile-gate-resolve.ts          — hook resolve + submittingRef (T3)
  MobileGateResolveSheet.tsx          — BottomDrawer: options/free-text + confirm (T3)
  gate-resolve-errors.ts              — taxonomy mapping + user-visible states (T4)
  parse-gate-transition-payload.ts    — normalizer absent-key→null (T5)
  gate-transition-events.ts           — subscribe consumer riêng (T5)
  ... colocation *.test.ts theo từng module (mỗi task kèm test file của nó)
mobile/app/h/[hostId]/gates.tsx       — pending gates screen (T2)
mobile/app/h/_layout.tsx              — +1 dòng Stack.Screen (additive)
mobile/src/host-screen/*              — +1 sidebar entry (additive, tối thiểu)
mobile/scripts/mock-server-rpc-handlers.ts — +superpowers handlers + gate fixtures + trigger gate-open/closed (T3, scaffolding device verify)
```

 KHÔNG đụng: `mobile/src/notifications/notification-routing.ts`, `use-open-notification-route.ts` (SF-4);
`mobile-notifications.ts` / `notification-reconnect-catchup.ts` (build TRÊN, không sửa — second watermark
consumer bị cấm); `use-mobile-home-host-connections.ts`; story screens/data của SF-2; mọi thứ `src/main` + `src/shared`.

## 3. Task DAG (7 tasks — executor per task, reviewer per task, commit `feat(FI-308): <task>`)

```
T1 contract-conformance-smoke-test
 └→ T2 pending-gates-surface-other-group
     └→ T3 resolve-flow-options-freetext-confirm
         ├→ T3b device-verify session (sau khi T3 code pass + reviewer duyệt)
         ├→ T4 resolve-error-states-safe-retry ──┐
         └→ T5 gate-events-pending-list-handling ┤
                 └→ T6 reconnect-catchup-verification
                         └→ T7 resolve-unit-tests  ← (T3,T4,T5,T6)
```
Execution tuần tự T1→T7 (executor model 1 task/lúc); edges trên là dependency THẬT.
Plan file tick `- [x]` sau mỗi task (checkbox CHỈ cho task steps).

### T1 — contract-conformance-smoke-test
- Tạo `gate-conformance-fixtures.ts`: fixture payloads typed chống contract (deep-relative
  import `'../../../src/shared/superpowers/story-rpc-contract'`): storyList item (parseError
  variant), storyDetail gates (storyLinked true/false, options rỗng, status timeout),
  gateResolve result + 3 error shapes, gate-open/closed payloads (2 variant: key VẮNG và
  key=null). Fixtures export để T3-T7 reuse. Nếu mobile vitest không import được path
  `../src/...` → snapshot fixtures trong mobile/ (probe config trước).
- Smoke test: mọi fixture gán được cho đúng contract type (compile-time) + runtime assert
  shape invariants (vd error union chỉ 3 code; gate bắt buộc có gateId/title).
- Exit: `pnpm exec vitest run src/superpowers/gate-conformance-smoke.test.ts` pass trong mobile/.
- [x] T1 done

### T2 — pending-gates-surface-other-group
- `pending-gates-store.ts`: per-host Map; state = { gates: Map<gateId, GateRow>, lastSweepAt,
  unavailable: boolean }. GateRow = contract gate + nguồn (sweep|event) + optionsKnown flag.
  **Store SHIPS event-mutation primitives ở T2** (add/upsert by gateId/remove + reconcile) —
  T5 chỉ build parser+subscriber+reducer TRÊN chúng (plan-critic P1#2: nếu defer primitives
  sang T5 thì exit test của T2 không viết được).
- `pending-gates-sweep.ts` (theo D1 membership rule): storyList → storyDetail cho
  MỖI story pendingGates>0 (single-flight OK vì read), merge + dedup gateId ('khác' gates
  worktreeId=null lặp trong MỌI response — dedup bắt buộc). **Probe rule:** nếu KHÔNG story
  nào pendingGates>0 nhưng storyList non-empty → gọi storyDetail cho story mới-nhất 1 lần
  (recover 'khác' gates). **Reconcile rule:** sweep update/add mọi gate server trả (phân loại
  lại 'khác'-drift); gỡ gate CHỈ khi server data cho positive evidence (status !== 'pending');
  overlay-only entries trên host 0 story (cả hai field absent — D1) KHÔNG bị sweep gỡ,
  persist đến gate-closed/restart/bracket-mới (D1 limitation). Host 0 story → sweep rỗng,
  overlay-only; host lỗi/pre-SF-1 → unavailable state (probe error shape method lạ, ghi vào
  test comment).
- Hook + screen `gates.tsx`: section per story — header = `story.title` từ sweep data
  (storyDetail trả đủ), fallback raw storyId — KHÔNG phụ thuộc SF-2, KHÔNG duplicate story
  data module; + section "Khác" (label cố định). Pull-to-refresh + sweep on mount; KHÔNG
  cache 'khác' membership vĩnh viễn (derivation point-in-time). Đăng ký route (D3). Theme
  tokens `mobile/src/theme/mobile-theme`; inline strings.
- Tests: dedup 2 storyDetail cùng gate 'khác'; host-scope isolation (2 host không
  cross-contaminate); zero-stories edge (overlay cả-hai-absent qua primitive add); probe
  rule; reconcile KHÔNG gỡ overlay entry thiếu server evidence; parseError story không crash.
- Exit: vitest pass; typecheck pass.
- [ ] T2 done

### T3 — resolve-flow-options-freetext-confirm
- `gate-resolve-request.ts`: plain `sendRequest('superpowers.gateResolve', {gateId, resolution})`
  (D4) với `timeoutMs` pin (vd 15s — `rpc-client.ts:10-16` hỗ trợ) để "không kẹt spinner"
  deterministic; đọc kết quả theo D11 (`result.error` trong success envelope);
  `use-mobile-gate-resolve.ts`: `submittingRef` per gate (double-tap block UI-level),
  result → success state + gỡ gate + notify store; error → T4 mapping (stub passing ở T3).
- `MobileGateResolveSheet.tsx` (BottomDrawer): options biết → buttons (giá trị = option,
  wrap layout precedent, KHÔNG kèm free-text khi options đã biết — spec: "gate có options →
  choice buttons"); options unknown/rỗng → TextInput multiline
  (precedent `MobileNativeChatQuestion.tsx:140-146`); confirm `Alert.alert` LUÔN (title =
  gate title, body = resolution), cancel = không gửi; sheet giữ BẢN SAO gate row trong
  component state (gate bị gỡ mid-dialog không crash — test).
- **Mock server theo ownership-chain pattern** (plan-critic P1#4, tránh collision với SF-2
  cũng cần storyList/storyDetail mocks): handler module MỚI (vd
  `mock-server-superpowers-handlers.ts`) + wire vào `mock-server-rpc-handlers.ts` bằng
  diff tối thiểu (1 import + 1 `||` clause theo chain `mock-server-rpc-handlers.ts:127-136`).
- Mock server (scaffolding device verify): thêm `superpowers.storyList/storyDetail/gateResolve`
  handlers + fixture gates (1 story-linked có options, 1 'khác' không options, 1 timeout) +
  trigger `gate-open`/`gate-closed` qua notification push của mock (nếu mock chưa có push
  path → thêm minimal). Ghi cách pair app với mock server (QR/manual host) vào commit message.
  **Prerequisites Rule 0 (pin rõ — spec-critic P1#4):** device verify SF-3 chạy với mock
  server làm host (KHÔNG đụng Orca desktop thật của user); resolve end-to-end với REAL
  desktop + agent tiếp tục workflow là acceptance của SF-4 (`device-session-e2e-serialized`);
  server-side guard của resolve đã có test thật từ SF-1 (`decision-gate-store.test.ts:21-97`).
- **T3b — device verify session (RIÊNG sau khi T3 code pass tests + reviewer duyệt; cùng
  bracket task, executor session thứ 2 — plan-critic P1#3)**: Rule 0 trên emulator-5554:
  build+install `pnpm android`, dev server `pnpm start`; app nối mock server; SÊN: thấy
  list 2 nhóm (A1 png — producer là session này) → gate options → bấm option → confirm →
  resolved + gate biến mất; gate 'khác' → free-text + confirm; Android back button trên
  sheet = dismiss không gửi; chụp `adb -s emulator-5554 exec-out screencap -p` >
  `/tmp/story/fi305/device-t3-*.png`. Commit evidence-only nếu cần: `test(FI-308): device-verify-resolve-flow-evidence` (png không vào git — evidence ở outbox + Linear).
- Exit T3: vitest pass (sheet tests + resolve request tests + primitives test).
- Exit T3b: device evidence files tồn tại trong outbox + note vào plan §4.
- [ ] T3 done · [ ] T3b device evidence done

### T4 — resolve-error-states-safe-retry
- `gate-resolve-errors.ts`: map taxonomy → user-visible: `gate_not_found` → gỡ khỏi list +
  "Gate không còn tồn tại" + refresh; `gate_not_pending` → gỡ + "Đã được resolve/từ chối nơi
  khác" + sweep; `invalid_resolution` → không xảy ra (client chặn rỗng) — defense: hiện
  message + giữ sheet; ws-drop/timeout rejection → exit submitting + stale banner + KHÔNG
  auto-retry (D7). Unknown error code → message chung + refresh (forward-compat).
- Tests: từng error code; 2 resolve song song qua server-guard mock dùng plain sendRequest →
  đúng 1 land, bên kia `gate_not_pending` (acceptance "2 request song song"); reject giữa
  confirm-response → spinner tắt, state sạch; re-tap sau lỗi không side effect (mock assert
  2 independent requests, server guard quyết định).
- Exit: vitest pass.
- [ ] T4 done

### T5 — gate-events-pending-list-handling
- `parse-gate-transition-payload.ts`: absent-key→null + present-null + unknown-extra-fields
  tolerate (wire còn mang `notificationSeq`/`notificationEpoch` ngoài contract payload —
  `runtime-mobile-notification-controller.ts:44-52` spread vào event); malformed → return
  null (bỏ qua event, không crash).
- `gate-transition-events.ts`: **passive second stream consumer theo D10** — subscribe
  riêng, listener riêng, CHỈ đọc event; CẤM đụng `getHostNotificationSession`/seen-guard/
  watermark/`getMissedSince` (cấm second watermark consumer); KHÔNG sửa
  `mobile-notifications.ts`. Source khác gate-open/closed → ignore.
- Reducer idempotency (pin P2#7): duplicate `gate-open` = upsert by gateId per host;
  `gate-closed` cho gate chưa từng thấy = no-op an toàn; `gate-open` → store.add (title từ
  payload, optionsKnown=false, nhóm theo storyId/worktreeId đã coerce) + trigger debounced
  sweep (hydrate options nếu gate vào story có bracket); `gate-closed` → store.remove
  (bất kể resolution nguồn nào: desktop/CLI/timeout — same payload).
- Wire subscription per host trong surface layer (gates.tsx effect). **Teardown 2 BƯỚC
  (plan-critic P1#5 — bắt leak listener server-side):** `buildStreamUnsubscribe` trả NULL
  cho `notifications.subscribe` (`rpc-client-terminal-subscription.ts:39-53`) → dispose()
  transport KHÔNG báo server → tự capture `subscriptionId` từ ready frame rồi gửi
  `notifications.unsubscribe` khi unmount (precedent `mobile-notifications.ts:210-214` +
  ready-frame handler). Không có subscriptionId (chưa ready) → chỉ remove local.
- Tests (fixture payloads từ T1): add/remove/idempotent (duplicate gate-open = upsert)/
  absent-key variant (key LITERALLY vắng)/malformed; gate-closed gỡ gate chưa từng thấy
  (overlay-only) = no-op an toàn; teardown test: unmount gửi `notifications.unsubscribe`
  đúng subscriptionId từ ready frame (second-ready-frame sau replay → subscriptionId MỚI —
  plan-critic P2).
- Device check: second subscription nhận live delivery độc lập + không phá banner delivery
  của subscription gốc — verify trên emulator với mock trigger (session T3b chạy sẵn app);
  evidence png + note vào outbox.
- Exit: vitest pass + device evidence tồn tại trong outbox.
- [ ] T5 done

### T6 — reconnect-catchup-verification
- Reconnect signal (symbols đã verify tồn tại — plan-critic P2): `client.onStateChange`
  (`rpc-client.ts:44`) lắng nghe chuyển về 'connected', hoặc pattern
  `createHostConnectRefetchGate` (`mobile/src/transport/host-connect-refetch-gate.ts`) /
  `useHostClient` (`mobile/src/transport/host-client-hooks.ts`) tùy fit tốt nhất — ĐỌC,
  không sửa shared files; gates surface đăng ký callback → sweep ngay sau reconnect
  (debounce 1 lần). In-flight resolve lúc disconnect: rejection đã xử lý T4; sau reconnect
  sweep tự sửa list.
- Xử lý catch-up: replay seq-ordered trong buffer (ordering giữ nguyên) — handlers T5
  idempotent sẵn; >256 events / desktop restart (epoch void) → events không đủ → SWEEP là
  nguồn sửa (test simulate: store có gate stale từ event, sweep trả list không có gate →
  gate bị gỡ; và ngược lại gate mới chỉ có ở sweep → được thêm).
- Tests: replay order không resurrect (gate-open muộn hơn gate-closed trong cùng batch
  xử lý theo thứ tự); gap-recovery qua sweep; reconnect sweep trigger gọi đúng 1 lần
  (debounce).
- Device check: toggle offline trên emulator (hoặc ngắt mock server socket) → reconnect →
  list đúng; evidence png vào outbox (dùng app session T3b).
- Exit: vitest pass + device evidence tồn tại trong outbox.
- [ ] T6 done

### T7 — resolve-unit-tests
- Consolidated sweep chống fixtures T1: toàn bộ resolve flow + event handling; bổ sung
  test hụt (đếm coverage theo ACCEPTANCE matrix dưới). Chạy FULL `pnpm exec vitest run`
  trong mobile/ (baseline sạch — không có known-fail mobile) + `pnpm typecheck` (baseline
  exit 0) + `oxlint` file touched. Test file ≤800 dòng mỗi file (ratchet) — tách file
  colocated thay vì kéo dài.
- Exit: full mobile suite + typecheck + lint sạch; ACCEPTANCE matrix dưới điền xong evidence.
- [ ] T7 done

## 4. ACCEPTANCE → evidence mapping (verifier Phase 5 điền cột evidence)

| # | ACCEPTANCE line (context pack) | Verified bằng |
|---|-------------------------------|---------------|
| A1 | Phone thấy đúng mọi pending gate trên host, đúng nhóm (story vs "khác") | T2 store tests (dedup, zero-stories edge) + device png list 2 nhóm (producer: T3b session) |
| A2 | Resolve gate có options → bấm option + confirm → gate resolved, agent desktop nhận biết | Device png flow (mock server); server-side guard đã test SF-1 (`decision-gate-store.test.ts`); terminal evidence: mock server log resolve — (real-desktop e2e là SF-4) |
| A3 | Resolve gate đã resolved/timeout → thông báo sạch + refresh, KHÔNG overwrite; gate-closed gỡ khỏi list | T4 tests (`gate_not_pending`, timeout); T5 remove test |
| A4 | Mất mạng giữa confirm/response → UI không kẹt spinner; reconnect state đúng; re-tap an toàn (2 song song → 1 land) | T4 reject test + parallel test; T6 reconnect sweep test; device check T6 |
| A5 | Free-text resolve với gate không options | Device png T3 (gate 'khác') + unit test |
| A6 | Unit tests resolve flow + event handling chống fixture payloads | T1 fixtures + T7 sweep run pass |

## 5. Infra facts / gotchas (đã verify)

- mobile deps ĐÃ install trong worktree này (node_modules sẵn); vitest + `pnpm typecheck`
  baseline exit 0. Chạy test TỪ `mobile/` (`pnpm exec vitest run <file>`).
- Emulator: `emulator-5554` (SDK34 ARM64) đã mở — KHÔNG tạo emulator mới.
- Mock server chưa có superpowers.* (gap) → T3 thêm (scaffolding, file mobile/scripts/*).
- Route registration: `mobile/app/h/_layout.tsx` HostStack — chỉ 1 dòng additive; sidebar
  entry trong `mobile/src/host-screen/*` — additive, tối thiểu. Đây là 2 shared files DUY NHẤT
  SF-3 chạm; nếu SF-2 cũng sửa → merge additive trivial, resolve theo spec §3b priority:
  cả hai entries giữ.
- Root `pnpm test`/`pnpm tc` KHÔNG phủ mobile (workspace riêng) — verify mobile bằng lệnh
  trong mobile/. Root suite có ~6 fail pre-existing (plugins conformance/launch-content) —
  KHÔNG phải của SF-3, đừng fix-loop.
- docs/** gitignored: commit plan/context bằng `git add -f docs/superpowers/plans/...`.
- Comment Linear: `orca linear comment add --id FI-308 --body-file -`; JSON parse bằng
  python3 (jq cấm); tạo state gì cũng read-back.
- oxlint: không disable max-lines; test file ≤800 dòng; không đặt tên file helpers/utils.
- KHÔNG đổi `resolveGate` CLI semantics; KHÔNG allowlist mới; KHÔNG merge main.

## 6. Hoàn tất (sau T7)

1. Verifier đối chiếu bảng §4 từng dòng (evidence = command output / test name / png).
2. Security review write path (resolve từ phone): confirm dialog unconditional, paired
   device, pending guard, không bypass — security-auditor agent verdict ra outbox.
3. Merge: (a) fetch story branch — nếu tiến hơn merge-base → merge parent VÀO branch này
   trước; (b) `git update-ref refs/heads/story/fi305-superpowers-android <new> <old>` FULL
   refname + guard `merge-base --is-ancestor` (old-parent trong HEAD, branch này trong new
   parent) + read-back rev-parse; (c) commit merge-hash comment lên FI-308 → Done.
