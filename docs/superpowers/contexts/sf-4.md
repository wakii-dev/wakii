# Context pack — FI-305 SF-4: Convergence QA + deep-link wiring

Source spec: `docs/superpowers/specs/2026-09-04-superpowers-android.md` (rev 3).
SF-2 + SF-3 đã merge về nhánh đích — verify TRÊN code đã hội nhất, không verify
từng mảnh.

## Spec slice
Deep-link route wiring: notification tap (`gateId`/`storyId` từ payload) → mở
đúng màn story của SF-2 có gate anchor (route học target mới trong
`notification-routing.ts` + `use-open-notification-route.ts`). Device-session
e2e CHUỖI serialized trên Android thật (1 thiết bị — không fan-out song song
các task cần device): story visible → gate mở → notification ≤5s → tap →
resolve → agent trong terminal tiếp tục; desktop restart giữa chừng → phone
cache render + refresh ≤10s; parity phone vs desktop panel trên ≥2 story thật
(seed brackets trước — setup note trong task). Verification-only các item khác:
security review (code-reviewer + security-audit) allowlist surface +
`resolveGateIfPending`; wire-compat regression MỨC UNIT trên STORED notification
data (không cần old APK — wire payload không mang `hostId`, field đó do
`buildLocalNotificationData(event, hostId)` đóng dấu local): (a) old shape
story-linked (`worktreeId` có, `storyId`/`gateId` KHÔNG — như build cũ drop) →
tap route worktree; (b) old shape 'khác' (cả hai absent) → host screen;
(c) full new payload + fields lạ → chỉ known fields được đọc, không crash;
(d) banner data well-formed (hiển thị). Multi-root/multi-host assertion
(không first-match, hostId đúng trong notification data); strings audit
(inline convention, không typo/missing); docs update (mobile README +
notifications docs).

## Touch map (verified)
- `mobile/src/notifications/notification-routing.ts` (DesktopNotificationSource
  union + `getNotificationNavigationTarget`) + `use-open-notification-route.ts`
  — phần duy nhất được sửa routing trong story
- Route của SF-2 là đích deep-link — KHÔNG sửa lại screens, chỉ wiring
- Regression test mới cạnh `mobile/src/notifications/notification-routing.test.ts`
- Docs: `mobile/README.md` (pair + story screens + gates), notifications docs
- KHÔNG đụng desktop code trừ bug-fix nhỏ có review riêng

## ACCEPTANCE (user-visible / verifiable)
- E2E Android thật, đủ chuỗi: story list → (gate mở từ desktop) → local
  notification ≤5s → tap → đúng màn story + gate anchor → confirm resolve →
  gate resolved, agent trong terminal worktree tiếp tục workflow
- Desktop restart: phone không trắng màn — cache render ngay, dữ liệu tươi ≤10s
  sau reconnect
- Parity ≥2 story thật: story list/detail trên phone khớp desktop superpowers
  panel (cùng SF status, cùng gate states)
- Old-build safety: unit regression test trên STORED data (xem Spec slice a-d):
  old shape story-linked → hiển thị + tap route worktree; old shape 'khác' →
  host screen; fields lạ không đọc, không crash ( amendment 2026-09-05 )
- Multi-root: host có ≥2 workspace có brackets → list đủ, không lẫn; notification
  tap từ host đúng → đúng host
- Security review pass: surface = 3 method; resolve bắt buộc paired + confirm;
  guard không bypass được; không secret/log leak
- Docs cập nhật: README mobile + notifications docs phản ánh feature mới
- (Owner 2026-09-05) Nút "Stories" trên host screen: thấy được cạnh Gates (cả 2
  toolbar variant), tap → `/h/<hostId>/stories`; evidence = code + screencap
  device khi khả dụng (button render đúng kể cả pairing invalid — disabled khi
  disconnected)

## Boundary
- KHÔNG thêm feature mới — chỉ wiring + verify + fix bug tìm thấy
- **NGOẠI LỆ owner-mandated (2026-09-05):** screen Stories KHÔNG có entry point UI
  (chỉ deep-link `orca://h/<hostId>/stories`) → BẮT BUỘC thêm 1 button/link
  "Stories" ở host screen cạnh nút Gates đã có (`host-screen-header.tsx`, cả 2
  toolbar variant responsive) điều hướng `/h/<hostId>/stories` — trước khi set Done
- Bug P0/P1 tìm trong QA → fix + ghi nhận; P2 → improvements-log, không scope-creep
- KHÔNG tự merge vào `main` — story dừng ở nhánh đích
  `story/fi305-superpowers-android`, PR do agent tạo, merge là quyền người
- Device tasks CHẠY CHUỖI (một device-session) — không dispatch song song các
  task cần thiết bị

## Device verify (meta 2026-09-04 — user cung cấp)
Android emulator đã mở sẵn: id `emulator-5554` (Android 14 / SDK 34, ARM64) —
device-session e2e chạy trên ĐÚNG thiết bị này, KHÔNG tự tạo emulator mới.
App `mobile/` (expo): build+install `pnpm android`, dev server `pnpm start`.
Bằng chứng e2e: `adb -s emulator-5554 exec-out screencap -p > /tmp/shot.png`
tại từng bước flow (story list → gate → notification → resolve).

## Amendments (spec-critic 2026-09-05 — FIX-P0-FIRST đã áp)

**A1. Device-latch conditionality (P0-1):** đầu run 2026-09-05 emulator-5554
latch "Pairing invalid — re-pair" (desktop auth budget latch — re-pair là việc
user). Các acceptance CẦN REAL HOST bị điều kiện hóa:
- **Conditional (BLOCKED-on-user-re-pair nếu latch còn):** e2e chuỗi đầy đủ,
  notification ≤5s, desktop-restart ≤10s, parity ≥2 story thật trên real host.
- **Không conditional (phải xanh kể cả khi latch):** deep-link wiring unit
  tests, wire-compat stored-data regression, multi-host/multi-root unit
  assertions, strings audit, security review, docs.
- Evidence khi blocked = chuỗi `BLOCKED-on-user-re-pair` + screenshot latch +
  những gì mock-server path chứng minh được (screens + gate push + resolve).
  Mock evidence là BỔ TÚC, KHÔNG thay thế các acceptance conditional ở trên.
  Nếu user re-pair kịp trước task device → chạy full e2e, acceptance bỏ condition.

**A2. Verification rules cho acceptance (P1 — verifier đối chiếu theo đây):**
- **≤5s notification:** đo = timestamp dispatch log desktop → logcat
  notification-post (emulator chia host clock). 1 lần sạch + 1 retry policy.
  KHÔNG bao giờ báo pass từ mock.
- **Desktop restart ≤10s:** đo TỪ LÚC ws reconnect (không phải từ lúc desktop
  up — backoff transport 0.5s→60s ngoài touch map, không thể đảm bảo).
  Precondition: app foregrounded. "Không trắng màn" = cached list render ngay
  (screencap), KHÔNG blank frame; spinner/error banner được chấp nhận như
  intermediate. Dữ liệu tươi ≤10s tính từ reconnect (logcat timestamps).
- **Parity ≥2 story:** so screencap pair (phone vs desktop panel) + checklist
  SF/gate states per story. Bằng chứng cứng parse-parity đã có ở CI fixture
  (epic §5) — device parity là e2e smoke, không phải independent-source verify
  (cùng parser + gates DB theo design). Cần REAL gates trong SQLite (seeding
  bằng gate thật từ story workflow hoặc CLI/store — plan ghi method).
- **Security "guard không bypass được" operationalized:** (a) allowlist đúng 3
  `superpowers.*` (review/test); (b) write path mobile duy nhất =
  `resolveGateIfPending` conditional UPDATE (review); (c) non-pending → no-op +
  double-resolve song song → đúng 1 lần land (test có từ SF-1 hoặc thêm);
  (d) "confirm" là UX client — enforcement server = paired scope + pending
  guard (nói rõ layer nào bind); (e) không credentials trong payload/stored
  data, không log raw payload trong mobile routing.
- **Multi-root:** tách 2 nửa — "list đủ, không lẫn" = storyList projection
  (SF-1 code, fixture-testable, KHÔNG phải thay đổi SF-4); "tap từ host đúng" =
  unit (2 stored blobs khác hostId → target.hostId đúng; unknown hostId → null).
  Device pass là optional khi latch gỡ.
- **Coercion stored-data:** tap side đọc STORED data (khác shape wire parser)
  — shared null-coercion semantics (absent/null/empty → null); OS có thể
  string hóa fields khi round-trip (test pin hành vi này).
- **Cold-start deep push** vào catch-all story route chưa có precedent → probe
  TRƯỚC trong e2e; bug navigation ngoài 2-file touch map (nếu có) = QA fix
  được pre-authorize theo Boundary (có review riêng).
- **Mock `notificationId`:** `pushGateEvent` đang omit `notificationId`
  (dedup/watermark untestable under mock) — in-scope NHƯ test infrastructure
  1 dòng khi task device dùng mock path.
