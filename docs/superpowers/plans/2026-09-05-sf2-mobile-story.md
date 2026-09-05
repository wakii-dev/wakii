# Plan — SF-2 Mobile story screens + Linear status (FI-307)

Spec slice: `docs/superpowers/specs/2026-09-04-sf2-mobile-story-design.md` — parent
spec §3b **PINNED** (`src/shared/superpowers/story-rpc-contract.ts` là source of truth
đã merged bởi SF-1). Context pack: `docs/superpowers/contexts/sf-2.md`.

Worktree: `sf-2-mobile-story` — branch `VuHoi/sf-2-mobile-story` (base `da90feaa71`
= `story/fi305-superpowers-android`). Merge target cuối: `story/fi305-superpowers-android`
(chuỗi merge-ngược playbook — xem Merge protocol).

Mobile env: `cd mobile && pnpm install` ĐÃ CHẠY (node_modules sẵn; vitest/tsc/oxlint
trong `mobile/node_modules/.bin/`). Root `pnpm tc` + `pnpm test <file>` cho desktop side.

## Task DAG

```
T8 (strings) ──→ T5 (list UI) ──┬─→ T2 (routes boundary)
T1 (conformance) ─┬─→ T3 (list data) ─┤      └─→ T10 (responsive/dark)
                  │                    └─→ T9 (stale/malformed) ←─ T4, T6
                  └─→ T4 (detail data) ──→ T6 (detail UI) ──→ T2, T9, T10
T7 (desktop Linear read) — độc lập
```

Edges:
- T1 → T3, T4 (fixtures + contract types)
- T8 → T5, T6 (strings convention)
- T3 → T5, T9; T4 → T6, T9
- T5, T6 → T2, T9, T10
- T7 độc lập (desktop)

**Thứ tự chạy (sequential trong 1 worktree — tránh giành git index; DAG vẫn là
dependency đúng):** T1 → T7 → T8 → T3 → T4 → T5 → T6 → T9 → T2 → T10.

Mỗi task: 1 executor agent + code-reviewer review diff TRƯỚC task kế. Commit atomic
`feat(FI-307): <task-name>` (file `docs/**` thêm vào bằng `git add -f`). Sau mỗi task:
tick checkbox task này trong file plan này (đủ cho panel progress; commit plan tick
gộp theo wave: `docs(FI-307): plan tick T1-T4`).

## Tasks

### T1 contract-conformance-smoke-test
- **Files:** `mobile/src/superpowers/story-rpc-fixtures.ts` (mock responses typed
  `satisfies` shared contract types — deep-relative import
  `../../../src/shared/superpowers/story-rpc-contract`), `mobile/src/superpowers/story-rpc-conformance.test.ts`.
- **Steps:**
  - [ ] Fixtures: storyList happy path (≥2 workspace, 1 worktree 2 entry cùng group),
        entry parseError (`sfTotal: 0, parseError: true`), storyDetail (sfs nhiều tier
        + dependsOn + linear, gates pending/resolved/timeout + storyLinked
        true/false), error `{ error: 'story_not_found' }`
  - [ ] Conformance test: mọi fixture parse/validate được, field-for-field khớp
        contract type (compile-time `satisfies` + runtime assertions)
  - [ ] Export fixtures để T3/T4 test tái dùng
- **Acceptance:** `cd mobile && pnpm test src/superpowers/story-rpc-conformance.test.ts`
  pass; `cd mobile && pnpm typecheck` pass.

### T7 linear-subissue-status-read-desktop
- **Files:** `src/main/superpowers/story-linear-status.ts` (mới — read + TTL cache +
  state map), `src/main/runtime/rpc/methods/superpowers-story-detail.ts` (thay
  hardcode `'unknown'` dòng ~99), `src/main/runtime/rpc/methods/superpowers-story-list.ts`
  (tính `sfDone` — thay hardcode `0` dòng ~110), mở rộng cả 2 test file.
- **Steps:**
  - [ ] PROBE-GATE (phase0 risk #2): bracket ghi `linear: FI-306` là **identifier**;
        `getIssue` (`linear-issue-lookups.ts:33-64`) gọi SDK `entry.client.issue(id)`.
        Probe `issue(id:)` có nhận identifier không / cần resolve bước nào trong
        `src/main/linear/` (query mới = internal change, không phải wire change).
        KHÔNG code theo nhớ.
  - [ ] Helper `readSfStatuses(linearIds, opts?) => Map<id, SuperpowersSfStatus>`:
        gom ĐỦ ids mỗi request (v1 budget spec); reuse `linear-issue-lookups.ts` +
        limiter max-4; **TTL cache 30s** — module-level Map DÙNG CHUNG cả 2 method,
        key = linear identifier, resolution identifier→UUID cache cùng entry/cùng
        TTL; inject `now: () => number` (default `Date.now`) cho test deterministic;
        aliased batch query chỉ làm nếu probe thấy rẻ + trả lời được per-workspace
        vs single-workspace (`getClients()` multi-entry)
  - [ ] Mapping `state.type` (giá trị đã biết): completed→done, started→in-progress,
        unstarted/backlog→todo; **default branch bắt buộc: giá trị khác/rỗng/không
        nhận diện được → 'unknown'** (không crash, không đoán); `canceled`→'unknown'
        (quyết định spec rev 3); fallback khác (không connect / lỗi / id null / 404)
        → 'unknown' per-id — method KHÔNG BAO GIỜ fail vì Linear
  - [ ] storyList data path (spec-critic P0 — pin): **re-read bracket text + gọi
        `parseBracketSfs` lấy linear ids trong cùng pass hiện có** — KHÔNG đổi
        `BracketStoryScan`/`scanWorktreeBracketStories` (SF-1 frozen), KHÔNG parser
        thứ ba. `sfDone` = đếm 'done' của SF có `linear:`
  - [ ] Tests (cả 2 method file): connected map đúng, không connect, thiếu `linear:`,
        per-issue lỗi, TTL 30s qua inject `now` (2 poll ≤ TTL → 1 lượt reads),
        mapping từng state.type đã biết + giá trị lạ/rỗng → 'unknown'
- **Acceptance:** `pnpm tc` pass; `pnpm test src/main/runtime/rpc/methods/superpowers-story-detail.test.ts
  src/main/runtime/rpc/methods/superpowers-story-list.test.ts` pass. Linear-only theo
  contract (`linear:` là Linear id — §3b không có khái niệm GitHub/GitLab tương đương).

### T8 strings-inline-convention-probe
- **Files:** `mobile/src/superpowers/story-screen-copy.ts` (mới — copy module theo
  precedent `mobile/src/source-control/hosted-review-copy.ts`).
- **Steps:**
  - [ ] Probe convention hiện có: grep cách screens lấy strings (inline trong
        component vs copy module) — chốt 1 cách cho cả SF-2
  - [ ] Tập strings screen cần: title list/detail, section 'khác', stale banner,
        status labels (todo/in-progress/done/unknown), progress, refresh/pull hint,
        parseError entry label
- **Acceptance:** copy module tồn tại + type-safe; KHÔNG thêm i18n dep vào
  `mobile/package.json`; decision ghi 1 dòng vào task report.

### T3 story-list-data-module-cache-reconnect
- **Files:** `mobile/src/superpowers/story-list-host-fetch.ts`, `mobile/src/superpowers/story-screen-cache.ts`,
  `mobile/src/superpowers/use-mobile-story-list.ts` + tests colocated.
- **Steps:**
  - [ ] Cache persisted AsyncStorage versioned (chốt Alt 3-B — pattern
        `mobile/src/cache/home-snapshot-cache.ts`: throttle write + versioned key)
        keyed `hostId`; lỗi response KHÔNG xóa cache (giữ data cũ + flag stale,
        pattern `markUnavailable` của `home-host-worktree-fetch.ts`)
  - [ ] Fetch qua `sendSingleFlightRequest(client, hostId, 'superpowers.storyList', {})`
        — pattern `home-host-worktree-fetch.ts` (cutover retry cap 2, disposed guard,
        cache write chỉ khi `response.ok`)
  - [ ] Hook theo pattern `mobile/src/worktree/host-worktree-refresh.ts` (đã verify
        phase0): AppState gate — background KHÔNG poll, foreground resume + refresh
        ngay; interval foreground **60s** (precedent `host-worktree-refresh.ts:45`);
        clientEvents `'ready'` → refetch sau reconnect
  - [ ] Pull-to-refresh handler expose cho T5 (RefreshControl — precedent
        `mobile/src/host-screen/host-workspace-list.tsx`)
  - [ ] Tests: cache-first render (persisted seed), refetch sau reconnect ('ready'),
        background không poll, cutover retry, stale-flag giữ cache
- **Acceptance:** `cd mobile && pnpm test src/superpowers/` (file mới) pass; typecheck pass.

### T4 story-detail-data-module
- **Files:** `mobile/src/superpowers/story-detail-host-fetch.ts`, `mobile/src/superpowers/use-mobile-story-detail.ts`
  + tests.
- **Steps:**
  - [ ] Cache keyed `hostId` + `storyId` (cùng pattern T3, cùng `story-screen-cache.ts`)
  - [ ] `sendSingleFlightRequest(client, hostId, 'superpowers.storyDetail', { storyId })`
  - [ ] `story_not_found` → state riêng (KHÔNG throw) cho T9 stale banner; loading/
        error/refresh states
  - [ ] Foreground poll + background dừng + reconnect refresh — dùng chung cơ chế
        T3 nếu extract được (không clone); interval 60s như list (desktop TTL cache
        30s hấp thụ chi phí Linear join)
  - [ ] Tests: cache-first, not-found state, poll lifecycle
- **Acceptance:** tests pass; typecheck pass.

### T5 story-list-ui-group-worktree
- **Files:** `mobile/app/h/[hostId]/stories.tsx` (route — thin default-export wrapper,
  boundary), `mobile/src/superpowers/MobileStoryListScreen.tsx`, `mobile/src/superpowers/story-list-groups.ts`
  (group logic thuần để test) + tests.
- **Steps:**
  - [ ] Group per worktree: section theo `worktreeId` (header = `workspaceName`;
        `worktreeId: null` defensive → nhóm trung tính — phase0: v1 thực tế luôn
        có id); nhiều entry cùng worktree cùng group; giữ thứ tự server
        (`updatedAt` desc)
  - [ ] Entry row: title, epicId, tiến độ sfDone/sfTotal, pendingGates badge,
        parseError entry → row flag lỗi (KHÔNG crash, KHÔNG ẩn các story healthy)
  - [ ] Tap entry → navigate detail route `stories/[...storyId]` (catch-all —
        PROBE catch-all behavior trước; fallback query-param nếu có trở ngại thật)
  - [ ] Component test: grouping, parseError row, healthy rows vẫn hiển thị, nav params
- **Acceptance:** `cd mobile && pnpm test` (file mới) + `pnpm typecheck` pass; route
  pass `mobile/src/expo-route-module-boundary.test.ts`.

### T6 story-detail-ui-tiers-progress
- **Files:** `mobile/app/h/[hostId]/stories/[...storyId].tsx` (route catch-all, khớp
  nav T5), `mobile/src/superpowers/MobileStoryDetailScreen.tsx` + tests.
- **Steps:**
  - [ ] Header story: title, epicId, workspaceName, destination (nếu có)
  - [ ] SF list: nhóm/order by tier, mỗi SF: name + title + dependsOn + status chip
        (todo/in-progress/done theo token hiện có; 'unknown' = chip trung tính —
        không đoán, không treo; canceled hiển thị 'unknown' theo mapping)
  - [ ] Progress tổng: sfDone/sfTotal (progress bar/token hiện có)
  - [ ] Gates: hiển thị THỤ ĐỘNG (số pending + danh sách title/status) — KHÔNG
        resolve UI (boundary SF-3)
  - [ ] Component test: tier grouping, progress calc, chip 'unknown', gates passive
- **Acceptance:** tests + typecheck + boundary pass; không có nút/flow resolve.

### T9 stale-malformed-handling
- **Files:** chỉnh `MobileStoryListScreen.tsx` / `MobileStoryDetailScreen.tsx` + hooks
  T3/T4 (stale state), tests mới.
- **Steps:**
  - [ ] Detail nhận `story_not_found` giữa 2 poll → stale banner + nút refresh,
        KHÔNG crash, KHÔNG trắng màn (cache cũ vẫn render dưới banner nếu có)
  - [ ] List: entry biến mất giữa 2 poll → update list; entry parseError → flag
        (đã có T5) + các entry khác vẫn hiển thị
  - [ ] Tests: not-found banner path, removed-entry path, malformed+healthy mix
- **Acceptance:** tests pass; behavior chứng minh bằng test (device check ở bước verify).

### T2 host-scoped-story-routes-boundary-test
- **Files:** `mobile/src/superpowers/story-routes-host-scope.test.ts` (structure test
  đọc `mobile/app/` — pattern `expo-route-module-boundary.test.ts`).
- **Steps:**
  - [ ] Test: story routes TỒN TẠI dưới `app/h/[hostId]/stories*` và KHÔNG có route
        story ngoài host scope (`app/stories*` phải không tồn tại)
  - [ ] Test: screen components nhận `hostId` từ route params (không singleton host)
        — assert qua render test với 2 hostId khác nhau cho 2 render khác nhau
  - [ ] Chạy full `expo-route-module-boundary.test.ts` trong verify
- **Acceptance:** `cd mobile && pnpm test src/superpowers/story-routes-host-scope.test.ts
  src/expo-route-module-boundary.test.ts` pass.

### T10 responsive-dark-pass
- **Files:** chỉnh `MobileStoryListScreen.tsx` / `MobileStoryDetailScreen.tsx` +
  tests render.
- **Steps:**
  - [ ] Wide layout: dùng `useResponsiveLayout` (precedent `app/h/[hostId]/index.tsx`)
        — list/detail hiển thị hợp lý (probe pattern list+detail hiện có của tabs)
  - [ ] Dark + light: CHỈ token/theme hiện có (không introduces màu/hex mới);
        render test cả 2 scheme
  - [ ] Grep self-check: không hex/rgb literal mới trong file mới
- **Acceptance:** render tests light+dark pass; code-reviewer xác nhận không token mới.

## Verification protocol (sau T10 — KHÔNG phải checkbox)

1. `cd mobile && pnpm typecheck && pnpm test && pnpm lint` — sạch (file touched + full suite mobile).
2. `pnpm tc` (root) + `pnpm test src/main/runtime/rpc/methods/superpowers-story-detail.test.ts`
   + `pnpm run check:code-quality:changed`.
3. Tránh pre-existing fail đã biết (baseline 2026-09-05 trước mọi thay đổi SF-2):
   root `pnpm test src/main/plugins` (~6 fail sẵn), lint finding
   `browser-page-annotation-tray.tsx:63`, mobile `src/mock-server-key-pair.test.ts`
   (1 fail — child-process eval) — không dành fix-loop cho chúng.
4. Device Rule 0: app lên emulator-5554 (`cd mobile && pnpm android`, dev server
   `pnpm start`) → màn story list + detail THẤY THẬT qua `adb -s emulator-5554
   exec-out screencap -p > /tmp/story/fi305/sf2-device-*.png`; nếu build/emulator
   không khả dụng sau probe → ghi rõ trong verifier report (không claim).
5. verifier agent đối chiếu ACCEPTANCE 6 dòng context pack — từng dòng 1 evidence.
   Lưu ý dòng 1: parity = data storyList khớp bracket files thật (fixture test +
   output check) — KHÔNG so "desktop panel" (superpowers không có UI desktop,
   phase0 risk #6). Dòng 3: behavior + unit test chứng minh; con số ≤10s verify
   device-level thuộc SF-4 theo spec §4.
6. security-auditor review: story routes boundary + mobile surface (3 method có sẵn,
   không thêm allowlist, không resolve UI).
7. doc-writer: ghi note wire-compat (không wire change — mobile consumes existing
   methods; storyDetail giá trị status mới nằm trong shape cũ) + handoff SF-3/SF-4.

## Merge protocol (SAU verify — KHÔNG phải checkbox)

1. Commit cuối cùng sạch (`git status` trống); docs commit bằng `git add -f docs/superpowers/...`.
2. Re-check parent: nếu `story/fi305-superpowers-android` tiến hơn base (khác
   `da90feaa71`) → `git merge story/fi305-superpowers-android --no-edit` trước.
3. GUARD 1: `git merge-base --is-ancestor story/fi305-superpowers-android HEAD` (parent
   cũ là ancestor của HEAD mới) — pass mới được update-ref.
4. `git update-ref refs/heads/story/fi305-superpowers-android HEAD` (FULL refname;
   story branch KHÔNG được worktree nào checkout — verify `git worktree list` trước).
5. Read-back: `git rev-parse refs/heads/story/fi305-superpowers-android` == HEAD;
   `git rev-list --count story/fi305-superpowers-android..HEAD` == 0; các sf-branch
   khác (sf-3) không bị ảnh hưởng.
6. Comment merge hash lên FI-307 (`orca linear comment add --id FI-307 --body-file -`).
7. `orca linear save-issue FI-307 --state Done` + read-back. KHÔNG merge vào main.
