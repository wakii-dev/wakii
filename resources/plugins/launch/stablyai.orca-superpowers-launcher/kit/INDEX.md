# Kit INDEX — bản đồ 59 bins theo vòng đời story

> Đọc file này trước khi lần đầu dùng kit. Mỗi bin 1 dòng: *làm gì*. Nhóm theo giai đoạn lifecycle — không phải alphabet.
> Đây là root file (không cài vào `~/.claude`) — nguồn tra cứu, không phải công cụ.
> **Cách hệ thống vận hành end-to-end** (actors, vòng đời 7 bước, fences, giám sát): `OPERATING-MODEL.md`.

## 1 · Quan sát — nắm tình hình (5)

| Bin | Làm gì |
|---|---|
| `story-status` | 30 giây nắm tình hình MỌI story active — SF done/chạy/chờ, worktree, agent treo |
| `story-top` | Một màn hình watch mọi agent đang chạy (Orca + ngoài Orca), tự refresh |
| `story-stats` | Số liệu vận hành per SF: cycle-time, khối lượng (Linear + git) |
| `story-sequence` | Vẽ Mermaid sequenceDiagram QUÁ TRÌNH chạy thật của story |
| `story-snapshot-env` | Chụp trạng thái môi trường trước/sau thay đổi lớn |

## 2 · Khởi động story (9)

| Bin | Làm gì |
|---|---|
| `story-preflight` | Chạy TRƯỚC khi bắt đầu code — kiểm điều kiện launch |
| `story-impact` | Tính impact area (file/flow đụng tới) cho SF |
| `story-plan-validate` | Kiểm task DAG của orchestration run trước khi execute |
| `story-mindmap` | Sinh mindmap `.wakii` (schema v1) từ bracket/pack — nguồn state chuẩn |
| `story-mindmap-trigger` | Wrapper fail-open cho 3 lifecycle trigger của story-mindmap |
| `story-launch` | NGUỒN DUY NHẤT dựng SF launch prompt + tạo worktree (validate approve/deps) |
| `story-distributed-claim` | Distributed claim FI-458 — nhiều máy tranh một việc, dùng chung lib |
| `story-automation-install` | 1 LỆNH trên máy mới là có ca trực 24/7 |
| `story-hooks-install` | Merge story-team-kit hook entries vào settings.json |

## 3 · Trong lúc làm — worker/executor (16)

| Bin | Làm gì |
|---|---|
| `story-checkpoint` | Checkpoint store/restore (JSONL + git refs) + `with_file_lock` dùng chung |
| `story-attempt` | Track debugging attempts — chặn lặp cùng cách fail |
| `story-memory` | Quản lý state memory story (mark-git/mark-index, state lock) |
| `story-memory-fuse` | Fuse gate cho memory KG (đọc có provenance, hết hạn có kiểm soát) |
| `story-memory-index-hook` | Post-pass incremental index cho graph memory (FI-190) |
| `story-memory-parse` | Parse session → memory triples |
| `story-kb` | Knowledge base story (ghi/đọc kiến thức tích luỹ) |
| `story-lesson` | Ghi bài học per story — fences + lessons index |
| `story-test` | RULE 0 ENFORCER: tự mở browser, đi flow, verify hoạt động |
| `story-surface-lint` | Structural lint bề mặt story (đã bắt SyntaxError cp1252 30/09) |
| `story-skill-lint` | Structural integrity check cho story-workflow SKILL.md |
| `story-diff-review` | Tự review diff TRƯỚC commit |
| `story-coordinator-pass` | MỘT lượt coordination pass có giới hạn vào coordinator đang chạy |
| `workfront-driver` | Coordinator tự động: verify → tick → launch → convergence → DONE gate; `--repo` portable (worktree per-story + PR) — xem NAVIGATOR.md |
| `story-notify` (+ `story-notify-toast.ps1`) | Thông báo có context/screenshot/đề xuất (Windows toast) |

## 4 · Verify & đóng (8)

| Bin | Làm gì |
|---|---|
| `story-verify` | Enforce COMPLETE-RUN CHECKLIST 5 bước TRƯỚC khi Linear Done |
| `story-review-fuse` | Fuse gate review — chặn merge khi review chưa đạt |
| `story-report-validate` | Validate story report trước khi ghi nhận |
| `story-smoke` | Runtime smoke gate cho SF (verify.runtimeSmoke, FI-380) |
| `story-visual-regress` | So screenshot hiện tại vs baseline (Figma captures) |
| `story-post-merge` | Verify SAU merge: tests + browser + agents |
| `story-sync-dest` | Đưa meta commits từ main vào nhánh đích, AN TOÀN |
| `story-pr-checks` | CI gate cho PR trước merge — cùng dữ liệu Checks panel |

## 5 · Giữ sống & chữa (5)

| Bin | Làm gì |
|---|---|
| `story-watchdog` | Self-sustainment loop: phát hiện stall, auto-resume (--install-cron 30') |
| `story-resume` | Chẩn đoán 3 tầng + resume SF stalled (LAUNCH/RESUME tool hoá) |
| `story-ownership-probe` | Ownership probe — ai đang sở hữu story/worktree (chống double-writer) |
| `story-doctor` | Kit health 9 checks (marker/kitHash/bins/deps/hooks/kb/orphans) + `--repair` + `--uninstall` |
| `story-pane-watch` | Detector 4-state worker panes (working/waiting/blocked/idle) — mắt của HITL relay |

## 6 · Đóng story & hội đủ điều kiện DONE (1)

| Bin | Làm gì |
|---|---|
| `story-close` | Chuẩn hoá CLOSE phase: audit merge + ownership probe + dọn an toàn (BLOCK nếu nghi) |

## 7 · Hooks & nền tảng (9)

| Bin | Làm gì |
|---|---|
| `hook-session-start` | Wrapper settings.json hooks.SessionStart |
| `story-fact-pack` | SessionStart: inject ≤2KB fact-pack context story liên quan |
| `story-compact-recovery` | SessionStart (matcher: compact): nhắc khôi phục story state sau mỗi lần compaction |
| `hook-post-tool-use` | Wrapper settings.json hooks.PostToolUse |
| `hook-stop` | Wrapper settings.json hooks.Stop |
| `story-guard-dangerous` | PreToolUse: chặn lệnh phá hoại (force-push pattern, rm đệ quy…) |
| `story-guard-secrets` | PreToolUse: chặn rò rỉ secrets |
| `story-guard-envfiles` | PreToolUse: chặn đụng .env files |
| `linear-rate-limit` | State machine máy-level cho Linear rate limit (policy 20/09) — `run` bọc mutation, 429 tự note |

## 8 · Đồng bộ & tích hợp ngoài (6)

| Bin | Làm gì |
|---|---|
| `wakii-mcp-server` | MCP server read-only: bracket/task-list/gate-list/watchdog cho agent ngoài |
| `wakii-validate` | Validate file `.wakii` mindmap schema v1 — exit 0/1/2, `--linear`, `--resolve-primary` |
| `wakii-skill-export` | Export skills ra định dạng chia sẻ |
| `wakii-skill-import` | Import skills từ định dạng chia sẻ |
| `source-sync-dispatch` | Điều phối sync feature từ NGUỒN THAM CHIẾU BẤT KỲ |
| `vscode-sync-dispatch` | ⚠️ DEPRECATED — giữ cho automation prompts cũ; dùng `source-sync-dispatch` |

## Lưu ý driver

`workfront-driver` đã vào kit (nhóm 3 — runbook `NAVIGATOR.md`): lái các bins nhóm
2→4→6 tự động theo decision table, per-story instance, tự kill khi story DONE.
Bản chạy cục-máy tại `docs/superpowers/navigator/` (gitignored) là driver state,
không phải nguồn.
