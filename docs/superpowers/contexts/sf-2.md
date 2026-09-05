# Context pack — FI-305 SF-2: Mobile story screens + Linear status

Source spec: `docs/superpowers/specs/2026-09-04-superpowers-android.md` (rev 3).
Code chống contract §3b đã commit bởi SF-1 (shared types + fixture) — KHÔNG tự
định nghĩa shape, import từ shared location.

## Spec slice
Story screens theo pattern mobile hiện có: expo-router route host-scoped, data
module `sendSingleFlightRequest`, hooks `use-mobile-*`. Story list group per
worktree (1 worktree nhiều bracket → nhiều entry cùng group; parseError → entry
flag lỗi, không crash). Story detail: SF tiers + progress + status (`'unknown'`
hiển thị state trung tính). Data module behavior: render từ cache NGAY khi mở,
poll interval nhẹ khi foreground + pull-to-refresh, tự refresh sau reconnect.
Task desktop trong SF này: Linear sub-issue status read (batch theo epic, 1
fetch/request màn cho v1, probe rate-limit; Linear chưa connect/bracket thiếu
`linear:` → 'unknown'). Strings theo convention inline hiện có — probe i18n
trước, KHÔNG thêm i18n library.

## Touch map (verified)
- Routes: `mobile/app/h/[hostId]/` (pattern: index.tsx, tasks.tsx… — thêm
  story list + story detail route; pass `mobile/src/expo-route-module-boundary.test.ts`)
- Data modules: pattern tham chiếu `mobile/src/worktree/home-host-worktree-fetch.ts`
  (single-flight + cache + retry trên logical-client cutover); cache theo pattern
  `mobile/src/cache/`
- Conformance smoke test: mock responses phải satisfy shared §3b types của SF-1
- Desktop side (1 task): Linear status read — Linear integration hiện có
  (`src/preload/api/linear-api.ts`, `runtime-linear-*-commands.ts`); wire vào
  `superpowers.storyDetail` result (sfs[].status)
- KHÔNG đụng file notification (thuộc SF-3)

## ACCEPTANCE (user-visible / verifiable)
- Mở màn story list trên phone: thấy đúng stories khớp desktop panel (cùng
  bracket, cùng group worktree), kể cả host nhiều workspace/roots
- Bracket malformed/xóa giữa 2 poll → stale banner + refresh, app không crash,
  story khác vẫn hiển thị
- Màn render từ cache ngay khi mở (không trắng màn), tự refresh ≤10s sau reconnect
- SF status hiển thị: Linear connected → đúng status sub-issue; không connect →
  'unknown' trung tính (không đoán, không treo)
- Pull-to-refresh + foreground poll hoạt động; background không poll (battery)
- Responsive + dark theme theo design system hiện có (không introduces màu/token mới)

## Boundary
- KHÔNG làm gate resolve UI hay notification handling (SF-3)
- KHÔNG deep-link route wiring (SF-4)
- KHÔNG thêm i18n library mới — inline strings theo convention
  (precedent: `mobile/src/source-control/hosted-review-copy.ts`)
- KHÔNG đổi contract §3b — nếu phát hiện contract thiếu → REQUIREMENT-GAP comment
  lên epic, không tự vá shape
- KHÔNG poll khi app background; KHÔNG thêm file-watcher

## Device verify (meta 2026-09-04 — user cung cấp)
Android emulator đã mở sẵn: id `emulator-5554` (Android 14 / SDK 34, ARM64) —
DÙNG ĐÚNG thiết bị này, KHÔNG tự tạo emulator mới. App `mobile/` (expo):
build+install `pnpm android`, dev server `pnpm start`. Rule 0: THẤY màn chạy
thật trên emulator trước khi claim — `adb -s emulator-5554 exec-out screencap
-p > /tmp/shot.png`.
