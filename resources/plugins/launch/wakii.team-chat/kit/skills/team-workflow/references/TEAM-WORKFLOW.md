# Wakii Team Workflow — Operating Manual v2.1
**Updated:** 2026-10-30 · **Source:** VU-66 + VU-67 rehearsals (10 lessons + agent naming + Orca 249-cmd research)

---

## 0. Team Roster — Agents với Tên

```
                    ┌─────────────┐
                    │   CAPTAIN   │  ← Zcode
                    │   (Zcode)   │     PM / Coordinator
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────┴──────┐  ┌─────┴──────┐  ┌─────┴──────┐
   │  BUILDERS   │  │   SCOUTS   │  │  GUARDIANS │
   │ (Developers)│  │ (Researchers)│  │ (Reviewers)│
   └─────────────┘  └────────────┘  └────────────┘
```

| Tên | Nhóm | Agent type | Vai trò |
|---|---|---|---|
| **Captain** | Leadership | Zcode | PM — điều phối toàn team, hire, review, merge |
| **Smith** | Builders | Claude worker | BE developer — viết services (api/domain/db) |
| **Weaver** | Builders | Claude worker | FE developer — viết UI remotes, components |
| **Forge** | Builders | Claude worker | Infra — compose, nginx, CI/CD config |
| **Mason** | Builders | Claude worker | Tests — characterization, tooling, automation |
| **Pathfinder** | Scouts | Explore agent | Research codebase (read-only) |
| **Radar** | Scouts | General-purpose | Research linh hoạt + fix nhỏ |
| **Sentinel** | Guardians | spec-critic | Review spec (Phase 2) |
| **Arbiter** | Guardians | plan-critic | Review plan (Phase 3) |
| **Warden** | Guardians | code-reviewer | Review code trước merge (Phase 4) |
| **Verifier** | Guardians | verification | Final check (Phase 5) |
| **Aegis** | Guardians | security-audit | OWASP security check (Phase 5) |
| **Scribe** | Specialists | background task | Ghi audit Linear, cập nhật docs |
| **Herald** | Specialists | notification | Push notification khi gate chờ |
| **Watchman** | Specialists | launchd daemon | Canh worktrees 24/7 |

**Cách dùng tên khi dispatch:**
```bash
# Hire Smith (BE):
orca orchestration worker-start --task T1 --agent claude --name smith-auth-svc --worktree new-top-level ...

# Hire Weaver (FE):
orca orchestration worker-start --task T2 --agent claude --name weaver-ai-mock-ui --worktree new-top-level ...

# Dispatch Pathfinder (research):
Agent(subagent_type="Explore", prompt="...")
```

**Interaction Protocol:**
- User = **Owner/CEO** → "Hey Captain" = gọi PM (Zcode) → PM báo cáo + nhận chỉ đạo
- "How's Smith doing?" → Captain checks Smith's worktree + reports

### 0.1 Agent Definitions (nơi AI THỰC SỰ đọc)

Agent definitions nằm ở **`.claude/agents/`** — Claude Code tự load khi `/agent <name>`:

| Agent | File | Vai trò |
|---|---|---|
| **be-dev** | `.claude/agents/be-dev.md` | Backend — services, API, DB, Kafka |
| **service-dev** | `.claude/agents/service-dev.md` | Tạo service mới qua gen:service |
| **fe-dev** | `.claude/agents/fe-dev.md` | Frontend — remotes, MF, shell |
| **ui-dev** | `.claude/agents/ui-dev.md` | UI với @wakii/ui-kit |
| **forge** | `.claude/agents/forge.md` | DevOps — Docker, nginx, CI/CD, monitoring |
| **mason** | `.claude/agents/mason.md` | QA — tests, characterization, load-tests |
| **contracts-keeper** | `.claude/agents/contracts-keeper.md` | Giữ contracts nhất quán |
| **gate-keeper** | `.claude/agents/gate-keeper.md` | Verify gate trước merge |
| **e2e-runner** | `.claude/agents/e2e-runner.md` | Chạy stack thật + e2e |
| **release-manager** | `.claude/agents/release-manager.md` | Publish npm packages |

**Skills** (Claude Code tự discover) nằm ở **`.claude/skills/`**:
- `add-service` · `sync-contracts` · `use-ui-kit` · `wakii-debug-kafka` · `wakii-publish` · `wakii-ship-feature`

**Mapping Wakii naming ↔ existing agents:**

| Wakii tên | Claude agent | Khi nào dùng |
|---|---|---|
| Smith | `be-dev` hoặc `service-dev` | Task BE |
| Weaver | `fe-dev` hoặc `ui-dev` | Task FE |
| Forge | `forge` | Task infra |
| Mason | `mason` | Task tests |
| Warden | `gate-keeper` | Verify trước merge |
| — | `contracts-keeper` | Sync contracts |
| — | `e2e-runner` | Chạy e2e |
| — | `release-manager` | Publish npm |

**Worker brief từ giờ:** dùng Claude agent name (`/agent be-dev`) thay vì Wakii name. Brief template trong worker-start prompt reference đúng agent.

---

## 1. Team Composition (6 thành phần)

```
┌─────────────────────────────────────────────────────────────┐
│  👤 PM / TEAM LEAD                                          │
│  └─ Zcode (coordinator)                                     │
│     · Tạo ticket (Linear) · Thuê dev (worker-start)         │
│     · Review (verify evidence + gate-resolve)               │
│     · Merge + deploy + audit                                │
│     · TỐI ƯU HÓA team (luôn nghĩ: pipeline đầy chưa?)       │
│                                                             │
│  👨‍💻 DEVELOPERS (N người song song, 24/7)                   │
│  └─ Claude agents (unattended, --dangerously-skip-perms)    │
│     · Mỗi dev 1 worktree riêng (git isolated)               │
│     · Brief tự chứa (DoD + budget + boundary)                │
│     · Viết code + test + build → báo DONE/BLOCKED           │
│                                                             │
│  📋 PROJECT BOARD (Linear)                                  │
│  └─ VU-xx issues · audit comments · status tracking         │
│                                                             │
│  🖥️ DEV INFRASTRUCTURE (Orca)                               │
│  └─ Worktrees · Terminals · Orchestration · Browser         │
│                                                             │
│  ✅ CI/CD + VERIFICATION                                    │
│  └─ verify:quick (lint+typecheck+test+spectral+gitleaks)    │
│  └─ Gates (approve/reject) · Docker compose                 │
│                                                             │
│  📚 KNOWLEDGE BASE                                          │
│  └─ goal-state.md · improvements-log.md · ADRs · runbooks   │
└─────────────────────────────────────────────────────────────┘
```

## 2. PM Playbook (cách team lead làm việc)

### Vòng lặp chuẩn (4 bước — giống team thật)

```
TẠO TICKET → THUÊ DEV → CHỜ BÁO → REVIEW/MERGE
```

### Chi tiết từng bước

**Bước 1: TẠO TICKET**
```bash
RUN=$(orca orchestration run-create --objective "<mô tả>" --json | jq -r '.result.run.id')
TASK=$(orca orchestration task-create --task-title "<title>" --spec "<spec + DoD>" --run "$RUN" --json | jq -r '.result.task.id')
orca orchestration task-update --id "$TASK" --status ready --json
```

**Bước 2: THUÊ DEV (1 lệnh — worker-start)**
```bash
orca orchestration worker-start \
  --task "$TASK" \
  --worktree new-top-level \
  --agent claude \
  --name <worktree-slug> \
  --repo id:<repoId> \
  --run "$RUN" \
  --json
```
> `worker-start` tự động: tạo worktree + terminal + claude agent + gửi brief + track completion.

**Bước 3: CHỜ BÁO (Orca-native — không shell script)**
```bash
# Chạy như background task:
orca orchestration check --run "$RUN" --wait --types worker_done,escalation,question --timeout-ms 480000 --json
```
> Khi worker báo → notification → PM dậy → đi verify.

**Bước 4: REVIEW/MERGE**
```bash
# 4a. Tạo gate
GATE=$(orca orchestration gate-create --task "$TASK" \
  --question "<verify question>" \
  --options '["approved","changes_requested"]' --json | jq -r '.result.gate.id')

# 4b. VERIFY (không tin report — TỰ CHẠY DoD)
cd <worktree> && pnpm test && pnpm build

# 4c. Nếu PASS:
orca orchestration gate-resolve --id "$GATE" --resolution approved --json

# 4d. COMMIT + MERGE
cd <worktree> && git add <files> && git commit -m "feat(scope): description (VU-xx T<n>)"
cd <main-repo> && git merge --no-edit <worktree-branch>

# 4e. HOÀN TẤT TASK
orca orchestration task-update --id "$TASK" --status completed --json

# 4f. DỌN WORKTREE (quan trọng!)
orca worktree remove --worktree <worktree-id> --force --json

# 4g. AUDIT
orca linear comment add VU-xx --body "<kết quả verify + commit hash>"
```

### PM thông minh (Lesson #0)

| PM thường | PM thông minh |
|---|---|
| Chờ worker xong mới nghĩ việc kế | Dispatch 3-4 task song song, luôn có backlog |
| Ngồi chờ marker DONE | Thấy terminal idle + files ổn định → ĐI VERIFY NGAY |
| Dừng khi merge xong | Merge xong → dispatch task kế NGAY TRONG CÙNG TURN |
| Xây infrastructure phức tạp | Dùng Orca-native (1 lệnh thay 5) |
| Verify = "tests pass" | Verify = mở browser NHÌN sản phẩm (Rule 0) |

## 3. Worker Playbook (cách dev làm việc)

### Brief chuẩn (mọi worker PHẢI nhận được)

```markdown
Task: <mô tả ngắn>
Repo: <worktree path>

CÁCH LÀM:
1. <step cụ thể>
2. <step cụ thể>

DoD (Definition of Done — đo được bằng lệnh):
- <lệnh verify 1> → expected output
- <lệnh verify 2> → expected output

KHÔNG: commit · đụng file ngoài boundary · grind quá ~15 phút
KẾT THÚC: in dòng "DONE <files> <verify output>" hoặc "BLOCKED <lý do>"
```

### Pattern hoạt động (verified từ 7 workers)

| Pattern | Status | Ghi chú |
|---|---|---|
| `worker-start` (1 lệnh) | ✅ PREFERRED | Tự track, tự tạo worktree+terminal |
| `--dangerously-skip-permissions` | ✅ BẮT BUỘC | acceptEdits KHÔNG đủ (bash prompts chặn) |
| Brief có DoD đo được | ✅ BẮT BUỘC | Worker phải biết khi nào xong |
| Worktree riêng | ✅ MẶC ĐỊNH | Cô lập hoàn toàn, không conflict |
| `gen:service` làm khởi điểm | ✅ Pattern tốt | CRUD mẫu → thay bằng domain thật |
| Budget ~15 phút | ✅ | Kẹt thì BLOCKED, đừng grind |
| Nhiều worker cùng file | ❌ CẤM | Conflict merge (queue tuần tự thay vì) |

## 4. Orca-Native Commands (cheat sheet)

### Identity (tôi là ai trong Orca)
```bash
echo $ORCA_AGENT_PANE        # pane UUID (tôi CÓ stable pane)
echo $ORCA_WORKTREE_ID       # worktree hiện tại
```

### Task lifecycle
```bash
# Status enum: pending → ready → dispatched → completed | failed | blocked
# (KHÔNG có in_progress; tasks tạo ra mặc định BLOCKED)

orca orchestration task-create --task-title "<t>" --spec "<s>" --run <RUN> --json
orca orchestration task-update --id <TASK_ID> --status ready --json  # unlock
orca orchestration dispatch --task <TASK_ID> --to <worker-handle> --from <my-handle> --run <RUN> --json
orca orchestration task-update --id <TASK_ID> --status completed --json
```

### Worker dispatch (preferred)
```bash
orca orchestration worker-start \
  --task <TASK_ID> \
  --worktree new-top-level \
  --agent claude \
  --name <slug> \
  --repo id:<repoId> \
  --run <RUN> --json
```

### Wake/Wait
```bash
# Primary (Orca-native):
orca orchestration check --run <RUN> --wait --types worker_done,escalation,question --timeout-ms 480000 --json

# Terminal read (khi cần soi manual):
orca terminal read --terminal <handle> --limit 100 --json
# Output: .result.terminal.tail[] (mảng string)
```

### Gates
```bash
orca orchestration gate-create --task <TASK_ID> --question "<q>" --options '["approved","changes_requested"]' --json
orca orchestration gate-resolve --id <GATE_ID> --resolution approved --json
```

### Worktree lifecycle
```bash
orca worktree create --repo id:<repoId> --name <slug> --no-parent --agent claude --prompt "<brief>" --json
orca worktree remove --worktree <id> --force --json  # SAU MERGE — luôn dọn!
```

### Terminal management
```bash
orca terminal create --worktree <id> --title "<name>" --command "claude --dangerously-skip-permissions" --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 150000 --json  # satisfied: true?
orca terminal send --terminal <handle> --text "<brief>" --enter --json
orca terminal read --terminal <handle> --limit 100 --json  # .result.terminal.tail[]
orca terminal close --terminal <handle> --json  # KHÔNG phải kill
```

## 5. Knowledge Base

### Files chuẩn (mọi repo chạy team workflow)

| File | Mục đích | Ai đọc |
|---|---|---|
| `docs/superpowers/goal-state.md` | Đích + queue + ledger + CHỜ-BẠN | PM đầu MỌI turn |
| `docs/superpowers/improvements-log.md` | Bài học → luật (timestamped) | PM cuối MỖI task |
| `docs/adr/NNNN-*.md` | Quyết định kiến trúc | Team |
| `docs/runbooks/*.md` | Vận hành (cutover, rollback, on-call) | Team |
| `.claude/discovery-config.json` | Linear team + project | PM Phase 1 |

### Anti-Idle Rule (quan trọng nhất)

> **Coordinator KHÔNG kết thúc turn khi TODO còn mục không cần user-input.**
> Turn chỉ kết thúc khi: (a) đích đạt · (b) kẹt user-only · (c) context critical.

## 6. 10 Lessons (từ VU-66 + VU-67)

| # | Lesson | Fix |
|---|---|---|
| 0 | **Làm việc thông minh — không over-engineer** | Orca có sẵn → dùng, không tự chế |
| 1 | Preflight agent CLI (`which codex/claude`) | Fail-silent = shell rỗng |
| 2 | `--dangerously-skip-permissions` | acceptEdits KHÔNG đủ |
| 3 | DONE/BLOCKED marker protocol | Anti-false-positive |
| 4 | File-activity probe (stuck detector) | files=0 qua 2 heartbeat = soi terminal |
| 5 | `terminal read` → `.result.terminal.tail[]` | Parse đúng shape |
| 6 | `worker-start` là PREFERRED | 1 lệnh thay 4 |
| 7 | `dispatch --from` cần terminal handle THẬT | `$ORCA_AGENT_PANE` |
| 8 | `task-update --id` (không --task) | Status enum đúng |
| 9 | Tasks mặc định BLOCKED → cần READY trước dispatch | Luôn unlock |

## 7. Metrics (đo hiệu quả team)

| Metric | VU-66 | VU-67 | Mục tiêu |
|---|---|---|---|
| Tasks hoàn thành | 4/4 | 5/5 (running) | — |
| User interventions | 0 | 0 | 0 |
| Tests verified | 88 | 88+ (running) | — |
| Time to first merge | ~40 min | ~20 min | <15 min |
| Workers idle | N/A | 0 (pipeline đầy) | 0 |
| Worktrees left dirty | 4 (mistake) | 0 (fixed) | 0 |

---

*Tài liệu này là OPERATING MANUAL — session sau đọc file này + SKILL.md là biết đủ mọi thứ.*
