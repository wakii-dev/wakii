# Plan — FI-309 SF-4: Convergence QA + deep-link wiring (epic FI-305)

Date: 2026-09-05 · SF-COST=BALANCED · Executor-per-task (serial, 1 worktree),
code-reviewer giữa các task, commit `feat(FI-309): <task>`.
Inputs: `docs/superpowers/contexts/sf-4.md` (spec slice + ACCEPTANCE + Boundary +
amendments A1/A2 sau spec-critic FIX-P0-FIRST) ·
`docs/superpowers/specs/2026-09-04-superpowers-android.md` §3b (PINNED) ·
phase0 `/tmp/story/fi305/phase0-impact-analyst.md` · critique `/tmp/story/fi305/spec-critic.md`.
Branch: `VuHoi/sf-4-convergence-qa` (fork = story tip `c9b15e58c2`) ·
Merge target: `story/fi305-superpowers-android`. KHÔNG merge main.

## 0. Scope Sentence

Tap notification gate trên phone mở đúng màn story (deep-link), chứng minh bằng
unit tests (routing + wire-compat stored-data + multi-host) + security review
(allowlist 3 method + pending guard) + strings audit + docs; e2e Android thật
chuỗi đầy đủ (story → gate → notification ≤5s → tap → resolve → agent tiếp tục)
CHẶT CHUỖI serialized trên emulator-5554, hiện CONDITIONAL bởi pairing latch
"user re-pair" (A1) — latch còn → evidence `BLOCKED-on-user-re-pair`, KHÔNG set
Done, escalate epic. **Mobile-only** — desktop đã ship hết ở SF-1/SF-3.

## 1. Design decisions (Phase 0 + spec-critic → khóa, có evidence)

| # | Decision | Vì sao (evidence) |
|---|----------|-------------------|
| D1 | **Direction A — extend `DesktopNotificationSource` union + branch trong `getNotificationNavigationTarget` + passthrough `gateId`/`storyId` trong `buildLocalNotificationData`.** Passthrough là khâu load-bearing: tray data đang DROP 2 fields này (notification-routing.ts:29-44) — không mở thì tap routing không bao giờ thấy | B (routing path riêng) phải đụng `_layout.tsx` → vỡ golden-file test `notification-route-coordination.test.ts:8` + duplicate host-catalog/credential logic (`_layout.tsx:97-105`); C (route theo presence `storyId`, bỏ qua `source`) = unsafe discriminator cho notification tương lai. Unknown source → hành vi hôm nay giữ nguyên by construction (không whitelist-null) |
| D2 | **Story target = `HostStackRouteTarget` qua field `sessionTarget` hiện có**: `{name: '[hostId]/stories/[...storyId]', params: {hostId, storyId, gateId?}}` — KHÔNG thêm variant field mới trên `NotificationNavigationTarget` | `params` là `Readonly<Record<string,string>>` (host-stack-navigation.ts:16-19) — `gateId` riding as inert extra param, zero navigation churn; precedent in-app push `stories.tsx:22`; wrapper `[...storyId].tsx:13` + `normalizeStoryDetailRouteParams` chỉ đọc hostId/storyId → `gateId` vô hại (R2 đã code-verified bởi spec-critic) |
| D3 | **Routing semantics: `source: 'gate-open'\|'gate-closed'` + `storyId` non-empty → story route; mọi case khác → CHÍNH XÁC chuỗi hôm nay** (worktreeId → session route; else host). `gate-closed` cũng route story (user muốn xem story). Không route gates.tsx cho 'khác' (R3 — UX mới ngoài acceptance, boundary cấm) | Acceptance chỉ định nghĩa tap-target cho story-linked; 'khác' fallback hôm nay đã an toàn; spec-critic xác nhận R3 đúng boundary |
| D4 | **Coercion tap-side: `readNonEmptyString` hiện có (absent/null/empty → null) cho `storyId`/`gateId`; KHÔNG reuse `parse-gate-transition-payload` (shape khác: wire có `type:'notification'`, stored có `hostId`)** — chỉ shared SEMANTICS | Tap side đọc STORED data sau OS round-trip; đồng bộ null-semantics chống 'khác'-gate misroute (phase0 §3 + spec-critic P1); wire parser đã pinned bởi test SF-2 — không đụng |
| D5 | **Precedence giữ nguyên: credentialRecovery → sessionTarget (story hoặc worktree) → host** — recovery thắng story (host missing-creds → `/pair-scan`, không phải story detail) | Hook order hiện có use-open-notification-route.ts:16-26 đã đúng; pin bằng test để story target không nhảy hàng |
| D6 | **Wire-compat = unit test trên STORED data, 4 assertion (a-d)** theo spec slice đã amend: (a) old shape story-linked (`worktreeId` có, `storyId`/`gateId` absent) → session/worktree route; (b) old shape 'khác' (cả hai absent) → host; (c) full new payload + fields lạ → chỉ known fields đọc, không crash; (d) banner data well-formed qua `buildLocalNotificationData` | "Recorded wire payload" không có `hostId` (đóng dấu local) — feed thẳng vào `getNotificationNavigationTarget` = null (notification-routing.ts:72-75); spec-critic P0-2: planner theo chữ cũ sẽ viết test không thể pass |
| D7 | **Multi-host assertions (unit):** (1) target.hostId khớp ĐÚNG blob được truyền khi ≥2 host known (falsifiable — caller-passed arg, không first-known-host); (2) `knownHostIds` guard loại host lạ (→ null); (3) 2 stored blobs khác hostId → target.hostId tương ứng, không first-match | Acceptance multi-root đã tách 2 nửa (A2): projection nửa SF-1 fixture-testable (không phải việc SF-4); routing nửa này unit-assertable đủ |
| D8 | **Device e2e CONDITIONAL (A1), serialized 1 luồng; cold-start probe (kill app → tap notification) CHẠY TRƯỚC trong chuỗi; evidence = screencap từng bước + logcat timestamps; mock path chỉ bổ túc** | Pairing latch đầu run; backoff reconnect 0.5s→60s ngoài touch map nên ≤10s đo từ ws-reconnect (A2); cold-start deep-push vào catch-all route chưa có precedent (phase0 R5) — probe đầu để bắt bug navigation sớm; fix navigation ngoài 2-file touch map được pre-authorize (có review riêng) nếu QA bắt được |
| D9 | **Security review operationalized theo A2 a-e**: allowlist đúng 3 `superpowers.*`; write path duy nhất `resolveGateIfPending` conditional UPDATE; double-resolve race đúng 1 land; confirm = client UX, server enforcement = paired scope + pending guard; không credentials trong payload/stored data, không log raw payload trong routing mới | "Guard không bypass được" là claim tuyệt đối — cần tiêu chí kiểm được; store guard đã có từ SF-1 (decision-gate-store.ts:150-190) — review-only, KHÔNG sửa desktop |
| D10 | **Strings audit = sweep grep + đọc tay user-visible strings của SF-2/SF-3 surfaces** (stories.tsx, [...storyId].tsx, gates.tsx, MobileStoryDetailScreen, story-screen-copy.ts, MobileGateResolveSheet, gate-resolve-errors.ts): typo/inconsistency → fix; coverage story-screen-copy kiểm tra nhưng KHÔNG refactor hàng loạt; KHÔNG thêm i18n lib (spec cấm) | Spec slice "strings audit (inline convention, không typo/missing)"; phase0 P2: method chưa định nghĩa — grep-based + reading là audit đủ cho SF cỡ này |
| D11 | **Docs targets: `mobile/README.md` + `docs/site/content/docs/mobile.mdx` + `docs/site/content/docs/notifications.mdx`** — sections story screens + gate notifications + deep-link behavior; KHÔNG tạo file docs/reference mới | 3 file tồn tại (verified); docs paths KHÔNG gitignored (git check-ignore exit 1 — spec-critic verified) nên commit được |

## 2. File layout

```
mobile/src/notifications/
  notification-routing.ts             — union +2 source; LocalNotificationData +gateId/storyId?;
                                        buildLocalNotificationData passthrough;
                                        getNotificationNavigationTarget branch gate-* → story target (T1)
  use-open-notification-route.ts      — KHÔNG đổi logic (sessionTarget đã cover story route) — chỉ
                                        xác nhận precedence + test; đổi NẾU type yêu cầu (T1)
  gate-notification-routing.test.ts   — unit routing decisions + precedence + coercion (T1)
  gate-notification-wire-compat.test.ts — 4 assertion a-d trên stored data (T4)
  gate-notification-multi-host.test.ts  — multi-host/multi-root assertions (T5)
mobile/scripts/mock-server-superpowers-handlers.ts — +notificationId vào pushGateEvent (T2, test infra, chỉ khi mock path dùng)
mobile/src/host-screen/host-screen-header.tsx — +nút "Stories" cạnh Gates, cả 2 toolbar variant (T8 — owner requirement)
mobile/src/superpowers/MobileStoryDetailScreen.tsx — pending gate rows pressable → resolve sheet reuse SF-3 (T9a — owner)
mobile/src/superpowers/MobilePendingGatesScreen.tsx — story-linked rows → story detail link (T9b — owner)
mobile/README.md                      — story screens + gates + deep-link (T7)
docs/site/content/docs/mobile.mdx     — section story/gates (T7)
docs/site/content/docs/notifications.mdx — section gate notifications + deep-link (T7)
```

KHÔNG đụng: SF-2/SF-3 screens (`stories.tsx`, `[...storyId].tsx`, `gates.tsx`,
`story-detail-route.ts`) — **frozen cho wiring (T1-T5, T7); T6 được typo-level
copy fix, ưu tiên `story-screen-copy.ts`/`gate-resolve-errors.ts` (plan-critic
P1 carve-out); T9 được owner-mandate sửa `MobileStoryDetailScreen.tsx` +
`MobilePendingGatesScreen.tsx` (chỉ phần cross-link/resolve-sheet, không đụng
data layer)**, `mobile/app/_layout.tsx`
(golden-file test), desktop (`src/main/**`, `src/shared/**` — trừ QA-fix
pre-authorized có review riêng), wire parser SF-2 (`parse-gate-transition-payload.ts`,
`gate-transition-events.ts`), `mobile-notifications.ts`/catchup (watermark cấm đụng).
`local-notification-scheduling.ts` thuộc T1 (type `NotificationEvent` + `gateId`/`storyId`).

## 3. Task DAG (7 tasks — executor per task, code-reviewer per task, commit `feat(FI-309): <task>`)

```
T1 deep-link-route-wiring ──┬─> T4 wire-compat-regression-unit-test
                            ├──> T5 multi-root-multi-host-assertion
                            ├──> T3 security-review-allowlist-guard
                            ├──> T2 device-session-e2e-serialized (CONDITIONAL A1)
                            └──> T7 docs-update-mobile-notifications
T6 strings-audit (independent)
T8 stories-entry-button (independent — owner requirement 2026-09-05)
T9 story-graph-cross-links (independent — owner requirement 2026-09-05)
```

Thứ tự chạy (1 worktree — serial): **T1 → T8 → T9 → T4 → T5 → T3 → T6 → T7 → T2**
(T8/T9 ngay sau T1 — owner requirements 2026-09-05, để T6 strings-audit phủ luôn
copy mới; T2 cuối để maximizing thời gian chờ user re-pair; T3 sau T4/T5 để review
trên state code cuối; T7 sau tests để docs mô tả hành vi đã verify).

### Task 1 — deep-link-route-wiring
- [ ] Extend `DesktopNotificationSource` + `'gate-open' | 'gate-closed'` (import type từ contract nếu phù hợp — KHÔNG đổi `src/shared`)
- [ ] `NotificationEvent` (local-notification-scheduling.ts) + `LocalNotificationData` + `buildLocalNotificationData`: passthrough `gateId`/`storyId` khi non-empty
- [ ] `getNotificationNavigationTarget`: branch `source: gate-*` + `storyId` non-empty → `sessionTarget` = story route target `{name: '[hostId]/stories/[...storyId]', params: {hostId, storyId, ...(gateId ? {gateId} : {})}}`; else chuỗi cũ
- [ ] `use-open-notification-route.ts`: xác nhận precedence không đổi (recovery → sessionTarget → host); chỉ sửa nếu type bắt buộc
- [ ] New test `gate-notification-routing.test.ts`: story-linked open/closed → story target; storyId null → worktree/host fallback; gateId absent/coerced; recovery precedence với gate payload; stored data thiếu keys → legacy; fields lạ ignore; story đã xóa giữa notification và tap → story route vẫn mở (screen tự hiện notFound banner — P2 insurance)
- Files: notification-routing.ts (+ local-notification-scheduling.ts type), use-open-notification-route.ts (nếu cần), test mới
- Acceptance: unit tests xanh; `pnpm --dir mobile typecheck` + `pnpm --dir mobile test src/notifications` sạch; không đụng screen/layout/desktop
- Commit: `feat(FI-309): deep-link-route-wiring`

### Task 2 — device-session-e2e-serialized (CONDITIONAL — A1)
- [ ] RE-CHECK pairing đầu task (screencap): latch còn → ghi `BLOCKED-on-user-re-pair` + screenshot + chạy mock-path phần bổ túc được → dừng task (KHÔNG retry-loop pairing)
- [ ] Setup: dev server + build/install app lên emulator-5554 (mock hoặc real host per latch)
- [ ] Seeding gates (PINNED — plan-critic P1): ≥1 gate từ LIVE agent story workflow (bắt buộc cho acceptance "agent trong terminal tiếp tục" + đo ≤5s — CLI/store gate không có agent chờ → chuỗi cụt); CLI/store gate chỉ dùng cho story parity thứ 2. Re-check latch SAU mock supplement: nếu user đã re-pair giữa task → chuyển sang full real-host chain
- [ ] Chuỗi e2e (serialized, screencap mỗi bước vào /tmp/story/fi305/e2e/): story list thấy story → gate mở từ desktop → notification ≤5s (desktop dispatch log → logcat post, A2) → tap (cold-start probe TRƯỚC: kill app → tap; rồi warm tap) → đúng màn story + gate chip (testID) → resolve qua sheet → gate resolved → agent trong terminal worktree tiếp tục
- [ ] OWNER GRAPH CHECKLIST (tiêu chí chốt Done — chạy trọn 1 lượt, screencap từng bước): (1) host screen → nút Stories (T8) → story list; (2) story list → tap story → detail (onOpenStory intact); (3) detail → gates section → tap pending gate → resolve sheet (T9a) → resolve; (4) notification gate-open/gate-closed tap → đúng story screen (deep-link commit 1e51d829d5); (5) Gates screen → gate row story-linked → mở đúng story detail (T9b); (6) cả graph liền mạch không dead-end
- [ ] Desktop restart giữa chừng: phone cached render ngay (không trắng màn — A2 định nghĩa) + tươi ≤10s từ ws-reconnect
- [ ] Parity ≥2 story: screencap pair phone vs desktop panel + checklist SF/gate states
- [ ] Mock path (nếu dùng): +`notificationId` vào `pushGateEvent` (test infra 1 dòng) — coverage screens + gate push + resolve; KHÔNG bao giờ thay evidence ≤5s/parity/restart
- Acceptance: chuỗi ĐẦY ĐỦ per A1 hoặc `BLOCKED-on-user-re-pair` ghi rõ
- Commit: `feat(FI-309): device-session-e2e-serialized` (chỉ khi có code/mock change; evidence-only thì ghi trong report)

### Task 3 — security-review-allowlist-guard (review-only, agent security-auditor)
- [ ] Review surface mới: 3 method allowlist (`superpowers.storyList/storyDetail/gateResolve`) — đúng 3, không thừa
- [ ] Review `resolveGateIfPending` conditional UPDATE + paired-scope enforcement + double-resolve race test tồn tại (SF-1) hoặc flag
- [ ] Review deep-link routing mới: không inject route ngoài expected; stored-data fields không vào log; không credentials trong tray data
- [ ] Verdict PASS/P0-findings; P0 → fix task riêng (pre-authorized, có review)
- Acceptance: verdict theo A2 a-e, evidence = report `/tmp/story/fi305/security-auditor.md`
- Commit: thường không có (review); fix nếu có findings

### Task 4 — wire-compat-regression-unit-test
- [ ] New test `gate-notification-wire-compat.test.ts`: 4 assertion a-d (D6) trên STORED data; fixture = payload shape thật desktop gửi (both-or-neither, runtime-gate-transition-notifications.ts:92-100)
- [ ] Test upgrade-degrade: stored data pre-SF-4 (không storyId) tap sau upgrade → legacy route, không crash
- Files: test mới (có thể +fixture module nếu fixture dài)
- Acceptance: tests xanh; ratchet 800 dòng không chạm
- Commit: `feat(FI-309): wire-compat-regression-unit-test`

### Task 5 — multi-root-multi-host-assertion
- [ ] New test `gate-notification-multi-host.test.ts`: 3 assertion (D7) + story-linked blob của host A không route nhầm sang host B khi cả hai known
- Acceptance: tests xanh
- Commit: `feat(FI-309): multi-root-multi-host-assertion`

### Task 6 — strings-audit
- [ ] Sweep D10 surfaces: liệt kê user-visible strings, check typo/spacing/casing consistency với story-screen-copy.ts conventions
- [ ] Fix typo/thiếu (nếu có) — mỗi fix 1 dòng, không refactor copy architecture
- Acceptance: audit report (đã check gì, sửa gì) trong task report; tests vẫn xanh
- Commit: `feat(FI-309): strings-audit` (chỉ khi có fix; không fix → ghi report-only)

### Task 7 — docs-update-mobile-notifications
- [ ] `mobile/README.md`: section story screens (list/detail/gates) + gate notifications + deep-link tap behavior
- [ ] `docs/site/content/docs/mobile.mdx`: cập nhật feature section story/gates
- [ ] `docs/site/content/docs/notifications.mdx`: section gate notifications + deep-link
- [ ] Nội dung khớp behavior ĐÃ verify (D3/D6), không hứa hẹn feature chưa có
- Acceptance: nội dung khớp code (reviewer đọc diff content — không có build check rẻ cho site docs)
- Commit: `feat(FI-309): docs-update-mobile-notifications`

### Task 8 — stories-entry-button (owner requirement 2026-09-05 — BẮT BUỘC trước Done)
- [ ] `mobile/src/host-screen/host-screen-header.tsx`: thêm 1 nút icon "Stories" NGAY CẠNH nút Gates trong CẢ HAI toolbar variant (embedded ~line 215-229 + standard ~line 343-352) — copy đúng pattern Gates: Pressable + cùng style class của variant đó (`embeddedToolbarIconButton` / `searchToggle`), `onPress={() => actions.navigateFromHostList(\`/h/${hostId}/stories\`)}`, `disabled={connState !== 'connected'}`, `accessibilityRole="button"`, `accessibilityLabel="Stories"`, lucide icon `BookOpen` (size 16, color pattern như Gates)
- [ ] Không đụng logic khác của header; không thêm state mới
- [ ] Verify: `pnpm --dir mobile typecheck` + `pnpm --dir mobile test src/notifications src/superpowers` xanh (không có unit test precedent cho header — visual evidence qua adb screencap khi emulator khả dụng: button render, disabled khi disconnected; nếu emulator bận device-session → defer visual vào T2, ghi rõ)
- Files: host-screen-header.tsx (+ import icon)
- Acceptance: nút thấy được cạnh Gates cả 2 variant, tap → `/h/<hostId>/stories` (owner thử được ngay)
- Commit: `feat(FI-309): stories-entry-button`

### Task 9 — story-graph-cross-links (owner requirement 2026-09-05 — BẮT BUỘC trước Done)
- [ ] `MobileStoryDetailScreen.tsx`: gate rows PENDING trở thành pressable → mở `MobileGateResolveSheet` (REUSE component + `useMobileGateResolve` của SF-3 — không reimplement resolve UX); resolved/timeout rows giữ read-only (timeout read-only per spec §3b). Adapter nhỏ nếu shape `PendingGateRow` (sheet) khác contract gate (detail) — map tại chỗ, không đổi sheet
- [ ] `MobilePendingGatesScreen.tsx`: gate row có `storyId` non-null → thêm affordance mở story detail `/h/<hostId>/stories/<storyId>` (reuse `createStoryDetailHref` pattern); gate 'khác' (storyId null) giữ nguyên resolve inline
- [ ] Tests: 2 file mới colocated — `story-detail-gate-resolve.test.tsx` (press pending gate → sheet mở; resolve flow qua sheet vẫn confirm; không đụng resolved rows) + `pending-gates-story-link.test.tsx` (story-linked row → navigate đúng href; 'khác' không link) — mock expo-router theo pattern test SF-2/3 có sẵn
- Verify: `pnpm --dir mobile typecheck` + `pnpm --dir mobile test src/superpowers` xanh
- Files: `MobileStoryDetailScreen.tsx`, `MobilePendingGatesScreen.tsx`, 2 test files mới
- Acceptance: graph (3) Detail → gates → resolve sheet + (5) GatesScreen → StoryDetail hoạt động; owner graph e2e checklist item 3+5 có code
- Commit: `feat(FI-309): story-graph-cross-links`

## 4. Execution & review protocol

- Mỗi task: `task-executor` agent (brief = task section + spec slice + decisions relevant) → commit atomic → `code-reviewer` trên diff task (verdict vào `/tmp/story/fi305/code-reviewer-<task>.md`) → APPROVED mới sang task kế; CHANGES-REQUESTED → fix ngay trong task (tối đa 2 vòng, sau đó escalate)
- Attempt ledger coordinator-owned: mỗi re-dispatch ghi "attempt K/3 — symptom trước: X, tried: Y, KHÔNG lặp Y"; budget mỗi dispatch ~15-20 tool-calls
- DONE evidence check trước khi tick (commit-bearing tasks): commit hash tồn tại, message đúng convention, files ⊆ task boundary (`git show --name-only`); report-only tasks (T3, T6-nếu-không-fix, T2-evidence-only): evidence = report file + không có working-tree residue
- T2 QA-fix navigation (pre-authorized): fix có review riêng → RE-RUN T4/T5 sau fix; T3 verdict + T7 docs re-touch theo fix (plan-critic P1 re-touch rule)
- Tick checkbox plan file sau mỗi task (commit nhỏ hoặc dính commit task)
- Typecheck + test sau mỗi task (plan-critic P0: root `pnpm tc`/`pnpm test` KHÔNG cover mobile/): `pnpm --dir mobile typecheck` + `pnpm --dir mobile test src/notifications src/superpowers` (root `pnpm tc` optional thêm vì src/shared không đụng); full bộ mobile test trước merge
- Loop caps: task-retry 3 / verify-fail-2-same-cause / gate-resolve 3 → STOP + summarize + hỏi user
- Rollback: revert commit task, không reset --hard; rollback-fixer cho multi-commit

## 5. Verification map (ACCEPTANCE → evidence — verifier Phase 5 đối chiếu)

| Acceptance (context pack) | Evidence |
|---|---|
| E2E chuỗi đầy đủ trên Android thật | T2 screencap chain + logcat; latch còn → `BLOCKED-on-user-re-pair` + mock-path supplement |
| Desktop restart: cache + ≤10s | T2 (conditional) — đo từ ws-reconnect (A2) |
| Parity ≥2 story thật | T2 (conditional) — screencap pairs + checklist |
| Old-build safety | T4 tests a-d xanh (unconditional) |
| Multi-root "list đủ, không lẫn" (nửa projection) | SF-1 fixture test có sẵn (epic §5 CI) — evidence = test name + run, KHÔNG phải code SF-4 |
| Multi-root "tap từ host đúng" (nửa routing) | T5 tests xanh (unconditional); device pass optional |
| Security review pass | T3 verdict theo A2 a-e |
| Strings audit (typo/missing, không i18n) | T6 audit report + fix commits (nếu có); tests vẫn xanh |
| Docs cập nhật | T7 commits + file content (không có build check rẻ — reviewer đọc diff content) |
| (Owner) Nút "Stories" host screen | T8 commit + screencap device (defer vào T2 nếu emulator bận); tap → /h/<hostId>/stories |
| (Owner) Graph e2e checklist 6 bước | T2 serialized e2e — screencap từng bước + verdict từng item; T9 commit cho item 3+5 |
| Deep-link wiring | T1 tests xanh + code review (unconditional) |

## 6. Merge + Done (checklist cuối — KHÔNG tick trong plan file, theo dõi qua Linear)

1. Merge parent vào branch này trước nếu `story/fi305-superpowers-android` tiến hơn merge-base (merge-ngược + update-ref FULL refname + 2 ancestor guards + read-back — merge-playbook)
2. Merge branch này vào `story/fi305-superpowers-android` (cùng chuỗi an toàn) — KHÔNG BAO GIỜ main
3. Comment merge hash lên FI-309
4. Verifier đối chiếu ACCEPTANCE từng dòng (bảng trên) — mỗi dòng có evidence hoặc `BLOCKED-on-user-re-pair`
5. Có task BLOCKED-on-re-pair → KHÔNG set Done; escalate epic comment cho watchdog. Không blocked → Done
