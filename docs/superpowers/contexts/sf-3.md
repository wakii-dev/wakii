# Context pack — SF-3: Release + cài + consent + verify thật

## Spec slice

Đóng gói kết quả SF-1 + SF-2 thành release cài được, verify thật trên Windows, ghi rõ trạng thái chưa-verify của macOS + rollback criterion. SF này KHÔNG sửa code (bug lộ ở verify → escalation theo sf-1.md).

## Touch map

| File | Thay đổi |
|---|---|
| `package.json` | version bump (release commit + tag) |
| CI dispatch | `orca workflow`/`gh workflow run windows-build.yml + macos-build.yml -f release_tag=<tag>` (workflow tự tạo release — commit 41a5329b87) |
| Release notes (gh release edit) | 3 mục bắt buộc: (1) lệnh duyệt consent `orca plugin enable wakii.team-chat --approve <fingerprint>` — fingerprint lấy từ error lần enable đầu; (2) macOS artifact "chưa verify"; (3) rollback criterion |
| Installer | Tải từ release → cài silent `/S` qua detached chain (pattern C:\Users\hoivk\AppData\Local\Temp\wakii-2111\install-relaunch.cmd) |

## Verify thật (acceptance — verifier kiểm theo đây)

1. Sau cài + restart: plugin `pending` → duyệt consent → `running`.
2. Tin CEO vào `#general` → Captain floating, ACK room ≤ ~1 phút, không kéo tay, brief không rơi shell trống.
3. 🔔 khi Captain sống → no-op (race chỉ khẳng định bằng unit test của SF-2 — live chỉ làm case no-op).
4. Kill Captain floating → Supervisor tự respawn floating trong **≤ 1 chu kỳ heal (tick 30s của supervisor — main.mjs:1646)**, tính từ tick heal kế tiếp.
5. Regression: tin vào `#ict-rsa-web-thuno` → spawn grid như cũ.
6. App restart với Captain floating còn registration → sau restart alive-check nhận đúng trạng thái (hydration phục hồi tab, process chết → supervisor respawn). Edge case được plan-critic nêu — nếu fail → escalation sf-1.md.

## Rollback criterion (plan-critic P1)

Nếu floating combo vỡ behavior production sau khi cài (Captain không spawn / spawn sai chỗ / double-spawn): **quay installer bản trước** (release cũ còn trên GitHub) là biện pháp rollback duy nhất trong vòng này; code revert phải qua story mới. Ghi vào release notes.

## Boundary

- KHÔNG sửa code — mọi bug lộ → escalation sf-1.md (re-open SF-1 → fix → rehash → re-release → re-consent → re-verify; domino chain đã ghi).
- KHÔNG merge primary — PR story + human gate.

## Facts đã verify (đừng re-derive)

- 2 workflow windows-build.yml / macos-build.yml có step "Ensure release exists" (commit 41a5329b87) — dispatch là đủ, không cần tạo release tay.
- Cài silent: NSIS `/S` hoạt động; app phải đóng trước (taskkill Orca.exe trong chain).
- Consent: `orca plugin enable wakii.team-chat --approve ap1-…` — fingerprint in trong error lần đầu.
- Supervisor tick: guard 30s (main.mjs:1646), heartbeat ping 10 phút (main.mjs:1645).
