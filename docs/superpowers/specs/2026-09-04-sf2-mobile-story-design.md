# SF-2 Design — Mobile story screens + Linear status (FI-307)

Parent spec: `2026-09-04-superpowers-android.md` rev 3 (§3b contracts PINNED).
Context pack: `docs/superpowers/contexts/sf-2.md`.
Phase 0: IMPACT-READY (`/tmp/story/fi305/sf2-phase0-impact.md` — touch map verified).
Spec-critic round 1: FIX-P0-FIRST → đã fix (P0 sfDone data path, P1 state.type default
branch + TTL pin, P2 citations/precedents). Status: rev 3.

## Scope

Mobile (chính): story list screen group per worktree + story detail screen (SF tiers
+ progress + status), data modules `superpowers.storyList`/`superpowers.storyDetail`
với cache render-ngay + reconnect-refresh + foreground poll + pull-to-refresh,
conformance smoke test chống shared contract, host-scoped route boundary test,
stale/malformed handling, responsive + dark pass, strings probe.
Desktop (1 task): wire Linear sub-issue status read vào CẢ HAI method —
`superpowers.storyDetail` `sfs[].status` (SF-1 hardcode `'unknown'` tại
superpowers-story-detail.ts:99) VÀ `superpowers.storyList` `sfDone` (SF-1 hardcode
`0` tại superpowers-story-list.ts:110-111, comment "SF status needs Linear reads (SF-2)").

Out of scope (boundary context pack): gate resolve UI + notification handling (SF-3),
deep-link wiring (SF-4), i18n library mới, đổi contract §3b, poll khi background,
file-watcher, allowlist mới (3 entries `superpowers.*` SF-1 đã allowlist).

## Contracts

§3b verbatim — không lặp. Mobile import types từ
`src/shared/superpowers/story-rpc-contract.ts` (type-only file, deep-relative import
pattern đã verify: `worktree-host-row-identity.ts:1`; Metro watchFolders đã include
`src/shared` — `mobile/metro.config.js`). Contract check Phase 0: KHÔNG gap shape —
mọi thứ SF-2 cần đã có trong contract (status enum có 'unknown', sfDone, parseError,
story_not_found, `linear: string | null`).

**Giá trị được ĐIỀN THẬT (shape không đổi):**
- `storyDetail.sfs[].status`: `'todo' | 'in-progress' | 'done'` khi Linear đọc được,
  `'unknown'` fallback.
- `storyList.sfDone`: đếm SF có status 'done' qua cùng nguồn Linear (TTL cache
  desktop — xem Desktop). **Data path (spec-critic P0 — pin):** `BracketStoryScan`
  của scanner SF-1 KHÔNG mang linear ids → list method RE-READ bracket text + gọi
  `parseBracketSfs` (đã parse `linear:` — `bracket-file-parse.ts`) trong cùng pass
  hiện có; KHÔNG đổi `BracketStoryScan`/`scanWorktreeBracketStories` (SF-1 frozen),
  KHÔNG parser thứ ba.
- Mapping Linear `state.type` → contract enum: `LinearIssue.state.type` là `string`
  KHÔNG closed union (`src/shared/linear/issue-types.ts:14`) → map giá trị ĐÃ BIẾT
  (`completed`→done, `started`→in-progress, `unstarted`/`backlog`→todo), giá trị
  KHÁC/rỗng/không nhận diện được → **'unknown' (default branch bắt buộc — không
  crash, không đoán)**. `canceled`→'unknown': quyết định spec chốt tại đây (contract
  thiếu canceled; 'unknown' trung thực hơn 'todo').
- `story_not_found` → stale banner + refresh, không crash.

**Route shape (chốt):** `mobile/app/h/[hostId]/stories.tsx` (list) +
`mobile/app/h/[hostId]/stories/[...storyId].tsx` (detail catch-all — storyId chứa
`/` vd `brackets/fi305-superpowers-android.md`, single dynamic segment không match;
catch-all giữ route path ổn định cho SF-4 deep-link). Executor probe catch-all
behavior trước khi commit; fallback query-param nếu catch-all có trở ngại thật.

**Cache granularity (chốt Alt 3-B):** persisted AsyncStorage theo pattern
`mobile/src/cache/home-snapshot-cache.ts` (throttle write + versioned key) —
cold-start/app-kill vẫn paint ngay; desktop-restart scenario (SF-4) không trắng màn.

## Components (mobile)

| Unit | Location (phase0-verified pattern) | Role |
|---|---|---|
| Routes | `mobile/app/h/[hostId]/stories.tsx` + `stories/[...storyId].tsx` — thin default-export wrappers, logic ngoài `app/` (boundary test enforce) | host-scoped expo-router routes |
| Data modules | `mobile/src/superpowers/story-list-host-fetch.ts` + `story-detail-host-fetch.ts` | `sendSingleFlightRequest` (coalesce theo client+hostId+kind) + cutover retry cap 2 + write-through cache — pattern `home-host-worktree-fetch.ts`; lỗi response KHÔNG xóa cache (giữ data cũ + flag stale, pattern `markUnavailable`) |
| Cache | `mobile/src/superpowers/story-screen-cache.ts` | persisted AsyncStorage versioned (pattern `home-snapshot-cache.ts`) keyed hostId (+storyId) |
| Hooks/poll | `mobile/src/superpowers/use-mobile-story-list.ts` + `use-mobile-story-detail.ts` | pattern `mobile/src/worktree/host-worktree-refresh.ts` đã verify: AppState gate (background không poll) + interval foreground **60s** (precedent `host-worktree-refresh.ts:45`) + clientEvents `'ready'` → refetch sau reconnect + pull-to-refresh (RefreshControl precedent `mobile/src/host-screen/host-workspace-list.tsx`) |
| UI list | `mobile/src/superpowers/MobileStoryListScreen.tsx` + `story-list-groups.ts` (logic thuần test được) | group per worktree (header `workspaceName`), parseError entry flag, stale banner |
| UI detail | `mobile/src/superpowers/MobileStoryDetailScreen.tsx` | SF tiers + progress sfDone/sfTotal + status chip ('unknown' trung tính), gates THỤ ĐỘNG (đếm + list — KHÔNG resolve UI, SF-3) |
| Strings | `mobile/src/superpowers/story-screen-copy.ts` | inline copy module (precedent `hosted-review-copy.ts`), KHÔNG i18n library |

Phone KHÔNG gọi `linear.*` trực tiếp (Alt 1A desktop-join đã pin ở epic — "phone
stays thin"; linear.* đã allowlist cho mobile tasks screens nhưng SF-2 không dùng).

## Components (desktop — 1 task)

| Unit | Location | Role |
|---|---|---|
| Linear status helper | `src/main/superpowers/story-linear-status.ts` (mới) | đọc statuses cho tập linear identifiers; **TTL cache 30s** (chống poll amplification — Alt 4-ii): 1 Map module-level DÙNG CHUNG cho cả 2 method, key = linear identifier (vd `FI-306`), resolution identifier→UUID (nếu probe (a) cần) cache CÙNG entry/cùng TTL; nhận inject `now: () => number` (default `Date.now`) để test TTL deterministic; map `state.type` giá trị đã biết + default 'unknown' (bảng trên); fallback 'unknown' per-id; reuse `src/main/linear/linear-issue-lookups.ts` + limiter max-4 (`linear-request-concurrency.ts`) |
| `superpowers.storyDetail` | `superpowers-story-detail.ts` | thay hardcode `'unknown'` bằng helper result |
| `superpowers.storyList` | `superpowers-story-list.ts` | trong cùng pass hiện có: re-read bracket text + `parseBracketSfs` lấy linear ids (KHÔNG đổi scanner SF-1) → `sfDone` = đếm 'done' từ helper (thay hardcode `0`) |

**PROBE bắt buộc trước implement (phase0 risk #2/#3):** (a) bracket ghi `linear: FI-306`
(identifier); `getIssue` (`linear-issue-lookups.ts:33-64`) gọi SDK `entry.client.issue(id)`
— probe `issue(id:)` có nhận identifier không / cần resolve bước nào, quyết định trong
`src/main/linear/` (query mới = internal change, KHÔNG phải wire change); (b) "batch
per epic, 1 fetch/request màn" = helper gom ĐỦ ids mỗi request (v1 budget spec) —
aliased batch query chỉ làm nếu probe thấy rẻ, VÀ probe trả lời thêm batch
per-workspace hay single-workspace (`getClients()` có thể nhiều entries multi-workspace);
(c) rate limit thực qua limiter max-4 chung với mobile tasks screens.

## Testing

- Conformance smoke (mobile): mock responses khớp shared §3b types — parse + render
  từ fixture-shaped data; `story_not_found` path; parseError entry path.
- Route boundary: 2 route mới pass `expo-route-module-boundary.test.ts` + structure
  test host-scope riêng.
- Desktop: mở rộng `superpowers-story-detail.test.ts` + `superpowers-story-list.test.ts`
  — Linear connected (status map + sfDone đúng), không connect ('unknown'/0), bracket
  thiếu `linear:`, per-issue lỗi → 'unknown' per-SF (không fail method), TTL 30s
  deterministic qua inject `now` (2 poll ≤ TTL → 1 lượt Linear reads), mapping
  từng state.type đã biết + giá trị lạ/rỗng → 'unknown' (default branch).
- Unit data module: cache render-ngay (persisted seed), reconnect refetch
  (clientEvents 'ready'), AppState background không poll, cutover retry.
- UI test vitest RN (pattern `*.test.tsx` hiện có): group per worktree, parseError
  entry, stale banner, status chip 'unknown', responsive + dark (token check).
- Device check Rule 0: emulator-5554 screenshot list + detail.

## ACCEPTANCE → task mapping (verifier Phase 5 đối chiếu từng dòng)

1. List khớp stories trên host, multi-workspace → T5 + T3; **evidence = data parity
   với bracket files thật qua storyList output + fixture test (KHÔNG so "desktop
   panel" — superpowers không có UI desktop; phase0 risk #6)**
2. Malformed/xóa giữa 2 poll → stale banner + không crash, story khác vẫn hiển thị → T9
3. Render từ cache ngay + refresh ≤10s sau reconnect → T3/T4 (behavior + unit test;
   con số ≤10s là device-level — verify thật ở SF-4 theo spec §4)
4. SF status: Linear connected đúng / không connect 'unknown' → T7 (+T6 hiển thị)
5. Pull-to-refresh + foreground poll hoạt động; background không poll → T3/T4 hooks
6. Responsive + dark theo design system (không token mới) → T10
