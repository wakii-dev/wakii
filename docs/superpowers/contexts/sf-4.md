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
`resolveGateIfPending`; wire-compat regression MỨC UNIT (recorded `'gate-open'`
payload — không cần old APK: chứng minh routing đọc chỉ hostId/worktreeId,
fields lạ không đọc, hiển thị không crash); multi-root/multi-host assertion
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
- Old-build safety: unit regression test chứng minh payload `'gate-open'` qua
  pipeline routing hiện tại → hiển thị, tap route worktree, không crash
- Multi-root: host có ≥2 workspace có brackets → list đủ, không lẫn; notification
  tap từ host đúng → đúng host
- Security review pass: surface = 3 method; resolve bắt buộc paired + confirm;
  guard không bypass được; không secret/log leak
- Docs cập nhật: README mobile + notifications docs phản ánh feature mới

## Boundary
- KHÔNG thêm feature mới — chỉ wiring + verify + fix bug tìm thấy
- Bug P0/P1 tìm trong QA → fix + ghi nhận; P2 → improvements-log, không scope-creep
- KHÔNG tự merge vào `main` — story dừng ở nhánh đích
  `story/fi305-superpowers-android`, PR do agent tạo, merge là quyền người
- Device tasks CHẠY CHUỖI (một device-session) — không dispatch song song các
  task cần thiết bị
