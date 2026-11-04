# Context pack — SF-2: Plugin wake floating + release + verify thật

## Spec slice

Wake Captain cho room KHÔNG-worktree (`general` + mọi room rooms.json thiếu worktree) dùng op `agent.launchFloating` (SF-1) thay vì gán lầm `wts[0]`; room CÓ worktree giữ nguyên đường `team-captain-spawn`; Captain Supervisor thêm nhánh respawn floating; release + cài + verify thật Windows.

## Touch map

| File | Thay đổi |
|---|---|
| `resources/plugins/launch/wakii.team-chat/orca-plugin.json` | Thêm capability `agent:launch` (accessGrowth → re-consent chấp nhận — flow có thật: plugin-update-access-growth) |
| `resources/plugins/launch/wakii.team-chat/main.mjs` | 1. **Wake cmd path: THAY cả khối early-return** `if (!wt) { notify 'thất bại — không tìm thấy worktree'; return }` (~1915-1918) bằng nhánh floating `host.call('agent.launchFloating', {agent:'claude', title:'Captain #<room>', prompt: brief})`. 2. **Brief QUA param `prompt`** (composer-wait built-in của binding — KHÔNG terminal send trần, tránh tái tạo bug CEO 1/11 "prompt rơi vào shell trống khi claude boot chậm"); nội dung rút gọn dưới TEXT_MAX: trỏ `~/.claude/agents/captain.md` + yêu cầu ACK vào room. 3. **Serialize 2 đường wake (P1-2):** wake cmd + captainRoute auto-wake dùng CHUNG 1 in-flight set (mở rộng `wakingRooms` cho cả cmd path): check-AND-set trước launch, clear trong finally → hết race tin-CEO-đúng-lúc-bấm-🔔. 4. **Alive-check:** registration + terminal list (floating terminal CÓ trong unscoped `terminal list` — bằng chứng floating-terminal-inventory-ownership.test.ts:65-68). 5. **Captain Supervisor nhánh floating (P0-2):** Layer 2 hiện `if (!capPane && wt)` (main.mjs:1708) bỏ qua room wt rỗng và respawn gọi team-captain-spawn đường worktree — thêm nhánh `wt === ''` → respawn qua `agent.launchFloating`. Không có nhánh này = Captain floating chết không bao giờ tự hồi. 6. Text 3 chỗ: success toast (~1922-1924), offline route message (~1819), hint "kéo tab". 7. Room CÓ worktree: giữ nguyên team-captain-spawn path. |
| `resources/plugins/launch/wakii.team-chat/panel.html` | Hint dòng dưới nút wake: "Captain room không worktree tự nằm trong Floating Workspace" |
| `resources/plugins/launch/bundled-plugins.json` | Rehash contentHash (`orca plugin inspect`) |
| gate tests | **Race unit test PASS là exit criterion** (P1-2 — live không tái lập được race): unit test stub `host.call` assert check-AND-set trên in-flight set dùng chung; release KHÔNG nằm trong SF này — xem SF-3 |

## Release + verify thật → ĐÃ TÁCH SANG SF-3 (plan-critic P1)

SF-2 gate chỉ gồm: `orca plugin test` + `orca plugin check` + suite related main.mjs + **race unit test PASS** (P1-2). Không bump/tag/release ở SF-2.

## ACCEPTANCE (user-visible — verifier kiểm theo đây)

1. Plugin worker gọi được wake floating end-to-end trong test harness: room không-worktree → `agent.launchFloating` được gọi (không rơi `wts[0]`, không team-captain-spawn), register worktree rỗng, brief đi qua prompt param (composer-wait) không phải send trần.
2. 🔔 khi Captain sống → no-op; **race 🔔+tin CEO → chỉ 1 Captain spawn — KHẲNG ĐỊNH BẰNG RACE UNIT TEST** (live không tái lập được).
3. Kill Captain floating (stub handle chết trong test) → Supervisor nhánh floating tự respawn trong **≤ 1 chu kỳ heal (tick 30s — main.mjs:1646)**.
4. Room có worktree → hành vi cũ nguyên vẹn (spawn grid, team-captain-spawn path).
5. Panel hint mới đúng.
Bug executor thật lộ khi test → escalation theo sf-1.md (re-open SF-1), không tự sửa src/ trong SF-2.

## Boundary

- KHÔNG đổi kit bins (team-captain-spawn giữ nguyên trách nhiệm room worktree).
- KHÔNG touch src/ (đó là SF-1).
- KHÔNG làm room per-ticket Jira.
- KHÔNG merge primary — PR story + human gate.

## Facts đã verify (đừng re-derive)

⚠ Line numbers trong tài liệu này lệch giữa các bản (spec vs pack ghi khác nhau) — worker tìm theo **pattern** (`if (!wt)` + notify text, `!capPane && wt`), đừng tin line number.

- `team-orch register` nhận worktree rỗng (fix a0be2a4d1a).
- Op `agent.launchFloating` trả handle ngay từ main (SF-1 contract); brief nên đi qua param `prompt` (composer-wait).
- **Floating terminal CÓ trong unscoped `terminal list`** — bằng chứng floating-terminal-inventory-ownership.test.ts:65-68 (trả lời risk #3 của Phase 0: alive-check/supervisor/idempotent đều an toàn).
- Consent flow: `orca plugin enable <key> --approve ap1-…` (error lần đầu in fingerprint).
- Supervisor Layer 2 hiện SKIP room wt rỗng (main.mjs:1708 `if (!capPane && wt)`) — đây là code phải SỬA (P0-2), không phải fact giữ nguyên.
- Fallback `wts[0]` có 3 chỗ liên quan: wake inline (~1905-1913), wake cmd (~1911), create-room (~1976 — GIỮ NGUYÊN, feature riêng có comment CEO 2/11).
- Các room "sống nhờ" `wts[0]` (repo không mở trong app) sẽ rơi vào floating — đúng chủ đích, đã soát không có case vỡ (spec-critic xác nhận).
