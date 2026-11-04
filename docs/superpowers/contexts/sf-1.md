# Context pack — SF-1: Op `agent.launchFloating` phía app

## Spec slice (from epic spec 2026-11-04-captain-floating-design.md)

Thêm op plugin `agent.launchFloating { agent, prompt? }` → main spawn terminal vào pseudo-worktree `global-floating-terminal`, trả handle ngay. Desktop-only. KHÔNG đụng renderer bridge, KHÔNG đụng layout ownership protocol.

## Touch map (files + điểm cắt)

| File | Thay đổi |
|---|---|
| `src/shared/plugins/workers/plugin-host-api-workspace-methods.ts` | Spec mới `agent.launchFloating` — params strictObject `{agent (isTuiAgent refine), title?, prompt? (TEXT_MAX)}`, result `{terminalId}`; capability `agent:launch`, `mutation: true`, `since: 4` (convention: workspace op hiện tại 3, `PLUGIN_HOST_API_MINOR` tự derive max — plugin-host-api.ts:324-326) |
| `src/main/plugins/workers/plugin-host-workspace-method-bindings.ts` | Binding: `target: { kind: 'existing', worktree: 'global-floating-terminal' }` (bare constant — `isFloatingWorkspaceSelector` chấp nhận bare; floating-workspace-worktree.ts:11-14), `surface: 'terminal'`, `presentation: 'background'`, `launchSource: 'plugin'`; prompt delivery fire-and-forget với built-in composer-wait (pattern binding agent.launch dòng ~198-212 — delivery chờ composer tới 1 phút, KHÔNG nằm trong reply); `title` truyền qua intent nếu executor hỗ trợ (verify, không block) |
| typings generate | `config/scripts/generate-plugin-author-typings` + API reference doc (`plugin-host-api-reference-doc.ts`) — commit output |
| tests | **BẮT BUỘC:** (1) executor case **floating + surface 'terminal'** — CHƯA có test nào cho combo này (test 602 chỉ structured; đường production: preflight terminal → createTerminalAgent → `runtime.createTerminal('id:global-floating-terminal')`, agent-launch-surfaces.ts:142 + terminal-workspace-scope.ts:153-165); (2) binding test (`plugin-host-workspace-methods.test.ts`): target floating đúng constant, surface terminal, result parse; (3) title pass-through nếu intent hỗ trợ |

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm theo đây)

**Harness chốt (plan-critic):** unit test gọi `pluginRuntimeRpc`/`RpcDispatcher` TRỰC TIẾP (headless mặc định, không cần plugin thật) + 1 lần smoke `orca serve` thủ công ghi kết quả trong gate report. KHÔNG đòi plugin thật (manifest capability là việc SF-2).

1. Gọi `agent.launchFloating {agent:'claude'}` qua harness → trả `{terminalId}` không throw, terminal được tạo với worktree `global-floating-terminal` (surface **terminal**, KHÔNG phải structured — combo này phải có test mới).
2. Headless mặc định của harness = chính là case headless: op **thành công** (main-owned qua `pluginRuntimeRpc` → `launchAgentOnHost`, KHÔNG qua renderer bridge); terminal floating hiện khi mở window. KHÔNG có requirement 'unavailable' — spec P0-1 đã chốt.
3. Prompt truyền kèm → được deliver sau composer ready (composer-wait tới 1 phút, fire-and-forget sau reply).
4. Suite related + `pnpm run tc:node` xanh; typings + API reference doc generated diff committed.

## Escalation khi test lộ bug executor thật (plan-critic)

Test combo floating+terminal có thể fail trên code thật → SF-1 PHẢI fix executor trong worktree của mình (re-open), KHÔNG escalate sang SF-2. Chuỗi domino ghi trước cho coordinator: fix executor → contentHash plugin đổi (SF-2 rebase) → **re-consent lần nữa** sau release → re-verify live. KHÔNG né bằng cách skip test.

## Boundary (KHÔNG làm)

- KHÔNG sửa renderer (`plugin-view-*`, `launch-agent-in-new-tab`) — không cần ở B'.
- KHÔNG đụng plugin wakii.team-chat (SF-2).
- KHÔNG đổi executor/hydration — dùng đúng đường đã có (thêm TEST cho combo floating+terminal, không đổi code executor trừ khi test lộ bug thật).
- KHÔNG thêm capability vào manifest team-chat (SF-2).

## Facts đã verify (đừng re-derive)

- Bare constant hoạt động: `isFloatingWorkspaceSelector` chấp nhận cả bare lẫn `id:` prefix (floating-workspace-worktree.ts:11-14) — bare là lựa chọn nhất quán với executor test, không phải điều kiện sống còn.
- `resolveWorkspace` nhánh `existing` pass-through, không validate catalog (executor.ts:204-207).
- Hydration: floating id nằm trong `validWorktreeIds` (workspace-terminal-hydration.ts:60) — tab main-spawned floating tự vào floating bucket.
- Đường op đi qua `pluginRuntimeRpc` → `RpcDispatcher` → `launchAgentOnHost` (plugin-runtime-rpc.ts:25-53, runtime/rpc/methods/agent-launch.ts:296-328) — KHÔNG qua renderer `ask()`; spec scope 'desktop' không có runtime enforcement (chỉ doc generator đọc) → ghi trong spec summary, không dựa enforcement.
- Test 602 chỉ chứng minh structured; floating + surface terminal CHƯA có test — SF-1 phải thêm (P1-3).
