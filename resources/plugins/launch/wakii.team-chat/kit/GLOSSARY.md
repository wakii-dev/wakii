# GLOSSARY — thuật ngữ team Wakii

Mỗi mục có dòng **Trong code** trỏ tới identifier thật (bin + hàm) — hết thời
đại "thuật ngữ chỉ sống trong đầu captain". Test bắt vít: `tests/team-glossary.test.mjs`
(mỗi mục phải có "Trong code" trỏ tới identifier tồn tại thật trong tree).

| Thuật ngữ | Nghĩa | Avoid (đừng dùng) |
|---|---|---|
| **Captain** | Team lead thường trực (PM), vai trình chuyển được — nhận lệnh CEO qua chat panel, điều phối workers, KHÔNG tự code. | "boss", "lead" (mờ vai CEO/captain) |
| **Worker** | Agent được Captain thuê 1 task, làm trên worktree room, báo qua tin template (plan/done/blocked). | "agent" trần (nhầm với agent defs khác), "mate" |
| **CEO** | Người ra lệnh cuối trong panel chat — duyệt stage, đóng bug, chốt scope. | "user", "admin" (CEO ≠ user terminal thường) |
| **Room** | Kênh chat 1 feature (rooms.json, status open/🔒) + worktree riêng + grid ghế. Đúng 1 room = 1 feature. | "channel" khi nói feature (channel là field kỹ thuật), "workspace" |
| **REG** | Registry pane→worker: `~/.claude/chat/.workers.json` — nguồn sự thật danh tính (pane handle, name, worktree, task, room). | ".workers file" suông, "roster" (roster.json là ĐỘI HÌNH CEO đặt, khác REG) |
| **RECEIPT** | Tin `✅ RECEIPT …` bin tự post vào room sau spawn/gate — bằng chứng máy; captain CHỈ copy số liệu từ đó, không tự điền tay. | "log spawn", "báo cáo spawn" (đó là tin captain, không phải RECEIPT) |
| **Hand-back** | Tin `DONE <task>` 6 mục (① Đã làm ② Cách test ③ Bằng chứng ④ Deviations ⑤ Still open ⑥ For-next-crew) — giao việc/kết quả cho reviewer + worker kế. | "handoff" (trỏ terminal handover khác), "report" |
| **BRIEF** | Context pack nạp cho worker lúc spawn (SessionStart) — task + DoD + room. Nguồn: `team-session-brief`. | "prompt", "spec" (spec là tài liệu stage 4, brief là pack runtime) |
| **Heartbeat** | Nhịp tin trạng thái captain gửi room ~5'/bước để CEO không mù; app-side là heartbeat tick của supervisor. | "ping" (peek là 1 lần, heartbeat là nhịp), "status spam" |
| **Churn** | Vòng lặp chết–tái sinh worker/captain mỗi restart (orphan captain) — đã fix `3d93504529`: xoá REG cần chết 2 tick + REG >5', adopt trước spawn. | "restart loop", "flapping" |
| **Dispatch** | 1 lần giao task cho worker qua orchestration (run → task → worker-start), có `dispatchId` trong RECEIPT. | "send", "spawn" (spawn là dựng pane, dispatch là giao task) |
| **Ledger** | Sổ dispatch per room: `~/.claude/chat/ledger/<room>.jsonl` — dòng `dispatch` (pane, name, dispatchId, session jsonl, startedAt) khi worker-start, dòng `end` (endedAt) khi done/cleanup; nguồn số liệu token cho team-usage. | "log spawn" (đó là file spawn-*.log), "usage db" (ledger là JSONL thuần đọc ghi-append) |

## Trong code

- **Captain** — `kit/agents/captain.md` + router `captainRoute` (`lib/router.mjs`)
- **Worker** — `team-orch worker-start` (`kit/bin/team-orch`)
- **CEO** — role `owner` trong `send_msg` (`kit/bin/team-chat`) + router `[CEO→captain]` (`lib/router.mjs`)
- **Room** — `rooms.json` + `meta_note`/`--channel` (`kit/bin/team-chat`)
- **REG** — `.workers.json` + `reg_put` (`kit/bin/team-orch`)
- **RECEIPT** — chuỗi `✅ RECEIPT spawned` / `✅ RECEIPT gate CLOSED` (`kit/bin/team-orch`)
- **Hand-back** — `team-chat done` (`kit/bin/team-chat`)
- **BRIEF** — `team-session-brief` (`kit/bin/team-session-brief`) + `install_worker_hooks` BRIEF_BIN (`kit/bin/team-orch`)
- **Heartbeat** — section HEARTBEAT (`kit/agents/captain.md`) + `captainSupervisor` (`lib/supervisor.mjs`)
- **Churn** — `supervisorMisses`/`supervisorRespawned` (`lib/supervisor.mjs`) + commit `3d93504529`
- **Dispatch** — `dispatch $DISPATCH_ID` trong RECEIPT (`kit/bin/team-orch`) + `dispatchId` (`kit/bin/story-coordinator-pass`)
- **Ledger** — `ledger_dispatch`/`ledger_end` (`kit/bin/team-orch`) + dòng end trong `team-chat done` (`kit/bin/team-chat`) + đọc qua `kit/bin/team-usage`
