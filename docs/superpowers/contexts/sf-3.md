# Context pack — FI-305 SF-3: Gate resolve UX + notification handling

Source spec: `docs/superpowers/specs/2026-09-04-superpowers-android.md` (rev 3).
Code chống contract §3b đã commit bởi SF-1 (shared types + fixture). KHÔNG làm
route wiring sang màn story — thuộc SF-4.

## Spec slice
Pending-gates surface per host (gates `storyLinked: false` / worktreeId null →
nhóm "khác", vẫn resolve được). Resolve flow: gate có `options` → choice buttons
(giá trị = option); options rỗng → free-text; LUÔN có confirm dialog trước khi
gửi. Error states theo taxonomy: `gate_not_found` / `gate_not_pending` /
`invalid_resolution` / ws-drop giữa confirm-response → refresh state + hiển thị
trạng thái mới; retry model = re-tap an toàn (pending guard ở desktop trả lỗi
sạch, không side effect). Notification handling: nhận `'gate-open'` → thêm vào
pending list; `'gate-closed'` → gỡ khỏi pending list (kể cả resolution từ
desktop/CLI/timeout). Testable bằng fixture payloads (không cần route thật).

## Touch map (verified)
- `mobile/src/notifications/notification-routing.ts` — KHÔNG đụng ở SF này
  (routing chỉ học gate target ở SF-4); SF-3 chỉ parse payload fields ở data layer
- Pending gates data module + hooks: pattern `sendSingleFlightRequest` +
  `use-mobile-*` như các SF khác
- Resolve UX tham chiếu precedent approval/question đã có:
  `mobile/src/session/MobileNativeChatQuestion.tsx`,
  `MobileNativeChatPermission.tsx` (pattern UI, KHÔNG dùng `agentSession.*` —
  gates là object khác, đi qua `superpowers.gateResolve`)
- Gate-open/closed subscription: `client.subscribe('notifications.subscribe', …)`
  pattern từ `mobile/src/notifications/mobile-notifications.ts`; reconnect
  catch-up pattern từ `notification-reconnect-catchup.ts`
- Conformance smoke test chống shared types SF-1

## ACCEPTANCE (user-visible / verifiable)
- Phone thấy đúng mọi pending gate trên host, đúng nhóm (story vs "khác")
- Resolve gate có options → bấm option + confirm → gate resolved, agent bên
  desktop nhận biết và tiếp tục workflow (verify bằng terminal/CLI đọc gate)
- Resolve gate đã resolved/timeout → thông báo sạch + state refresh, KHÔNG
  overwrite; gate biến mất khỏi pending list khi `'gate-closed'` đến
- Mất mạng giữa confirm và response → UI không kẹt spinner; sau reconnect state
  đúng; re-tap an toàn (2 request song song → đúng 1 land, test được)
- Free-text resolve hoạt động với gate không options
- Unit tests cho resolve flow + event handling chống fixture payloads

## Boundary
- KHÔNG đụng `notification-routing.ts` / `use-open-notification-route.ts`
  (deep-link thuộc SF-4)
- KHÔNG sửa desktop code (resolve guard + hooks là SF-1) — nếu contract thiếu
  → REQUIREMENT-GAP lên epic
- KHÔNG dùng `orchestration.gateResolve` hay `agentSession.respondTo*` cho gates
- KHÔNG tự thêm confirm-bypass/quick-approve setting — mọi resolve qua confirm
  dialog (decision #6)
