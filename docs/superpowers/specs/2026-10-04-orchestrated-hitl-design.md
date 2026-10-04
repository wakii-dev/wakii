# Design — Orchestrated HITL: orchestration làm BA điều phối + relay human-in-the-loop

- Ngày: 2026-10-04
- Tác giả: session coordinator (cùng thảo luận với user)
- Trạng thái: đã duyệt design (user OK), chờ implementation plan
- Nguồn: 13 sai phạm ILEC 03/10 + vòng PR #127/#128 04/10 (bypass permissions, worktree
  mồ côi ×3, worker kẹt prompt câm, coordinator dừng im)

## 1 · Vấn đề

Mọi agent story hôm nay spawn qua template Orca `--agent claude` = `--dangerously-skip-permissions`
(bypass LUẬT 24/09). Worker chạm permission wall → **kẹt ở prompt câm trong pane** không ai
nhìn (ILEC: đứng hàng giờ chờ "1. Yes"). Human-in-the-loop hiện tại là phản ứng: người tình cờ
nhìn thấy. Quyền overshoot: worker tự quyết mọi thứ không audit.

## 2 · Quyết định đã chốt (user 04/10)

| Quyết | Chọn | Nghĩa |
|---|---|---|
| Phạm vi enforcement | **A** | story-agents do kit spawn; session cá nhân user không đụng. Enforcement tại kit-layer |
| Hình thái worker | **B** | TUI pane (user nhìn thấy worker làm) — chấp nhận cần prompt-detector |
| Kênh HITL | **C** | Hybrid: bấm trực tiếp pane (mặc định) + sweep safety-net relay/escalate khi vắng |
| Mức tự chủ BA | **B** | BA tự trả câu hỏi **có trong spec/KB/touch map** (bắt buộc trích dẫn nguồn); scope/rủi ro/priority/tiền → RELAY user |

## 3 · Kiến trúc

```
                         BẠN (owner) — business-judgment only
                           ▲ Relay kèm diễn giải nghiệp vụ + khuyến nghị
                           │ (khi BA không tự trả lời được)
              ┌────────────┴─────────────┐
              │  BA LAYER = COORDINATOR  │ ← nắm: epic-why, spec, acceptance,
              │  (Claude session/story)  │    touch map, story-kb, glossary
              └───┬───────────┬──────────┘
     brief the-WHY│           │ phân xử câu hỏi worker
                  ▼           ▼
  WORKERS (TUI pane, acceptEdits)    PANE-WATCH (detector sweep 30')
  spawn hai bước qua story-launch    tail → working/waiting/blocked/idle-done
```

Enforcement kit-layer: mọi spawn story-agent đi qua `story-launch`/recipe hai bước
(`terminal create --command "claude --permission-mode acceptEdits"`); bypass-pid
baseline + `story-doctor --live` canh vi phạm. Session cá nhân user ngoài phạm vi.

## 4 · Components

### 4.1 `story-pane-watch` (bin mới — detector)
- List worker panes theo worktree story (bám **handle + cwd**, KHÔNG bám title —
  Orca đổi title theo process, ILEC 04/10)
- Đọc tail, phân loại: `working` (spinner/commit mới) · `waiting-approval`
  ("Do you want to proceed?", "❯ 1. Yes", "allow?") · `blocked` ("BLOCKED",
  "APPROVAL-NEEDED", "REQUIREMENT-GAP") · `idle-done` ("❯" trống + 0 commit +
  plan hết)
- Output JSON: `{worktree, handle, state, question}` — mọi caller đọc được
  (cwd tính bởi consumer; age deferred phase-2 pager)
- Fail-open: orca chết → trả rỗng + exit 0

### 4.2 BA Layer (protocol trên coordinator session — không phải hệ thống mới)
- **Nguồn nghiệp vụ**: epic spec + story `.wakii` (why/acceptance) + context packs +
  `story-kb` + glossary — coordinator nắm từ CREATE
- **Nhiệm vụ 1 — brief the-WHY**: context pack bổ sung tại sao tính năng tồn tại,
  ai dùng, acceptance nghĩa là gì (worker định hướng, không làm theo checklist mù)
- **Nhiệm vụ 2 — phân xử câu hỏi**: câu HOW có trong spec/KB/touch map → BA tự trả
  vào pane + **ghi audit (bắt buộc trích dẫn mục spec)**; scope/rủi ro/priority →
  RELAY user kèm diễn giải tiếng-người + khuyến nghị
- **Nhiệm vụ 3 — nghiệm thu nghiệp vụ**: trước khi nói SF done, đối chiếu output với
  business acceptance (không chỉ tests xanh)
- **Audit trail**: mọi auto-answer ghi story audit — review thấy BA quyết gì, vì sao

### 4.3 Relay hybrid C
- Mặc định: user thấy prompt trong pane → bấm trực tiếp (độ trễ 0)
- Safety-net: pane-watch thấy `waiting-approval`/`blocked` không ai xử trong 1 sweep
  → relay notification + worktree comment: **câu hỏi (đã diễn giải nghiệp vụ) +
  pane handle + khuyến nghị**
- `idle-done` ≥1h → coordinator kick endgame (contract sẵn)
- Trả lời 2 chiều qua message: phase 2 (MVP là pager)

### 4.4 Enforcement (đã có, giữ)
- Hai bước spawn acceptEdits + cấm `--agent claude` (test L-suite assert)
- `story-doctor --live` + watchdog bypass-pid baseline — pid mới → escalate
- Naming `story/{feature}` · `features/{slug}` · cấm `wakii-dev/` remote

## 5 · Data flow ví dụ

Worker sf-4 chạm prompt `npx drizzle-kit push` → pane-watch bắt `waiting-approval`
→ BA đọc touch map: migrate schema thuộc acceptance SF-4 → **auto-answer "1. Yes"
vào pane** + audit "BA auto-approve: migrate thuộc acceptance SF-4" → worker chạy
tiếp, user không bị phiền. Ngược lại worker hỏi "thêm export PDF?" → BA: out-of-
scope (không trích được spec) → RELAY user: "Worker đề xuất export PDF — ngoài
acceptance. Khuyến nghị: từ chối." → user gật/chỉnh.

## 6 · Failure modes

| Fail | Xử lý |
|---|---|
| BA auto-answer sai (không khớp spec) | audit bắt ở review; fence: chỉ trả khi trích dẫn được nguồn — không trích được → RELAY |
| pane-watch miss prompt | sweep 30' + fallback: worker im ≥1h không commit → coordinator đọc trực tiếp |
| Coordinator chết | watchdog revive theo recipe — spec nằm trong repo, context tái lập được |
| Worker stall lúc user vắng | pager escalate (hybrid C) |
| Prompt signature miss (CLI đổi wording) | detector giữ bảng signature mở rộng được + fallback `idle-done` heuristic |

## 7 · Testing

- `story-pane-watch`: fixture tails cho 4 state — TDD thuần (node:test, pattern
  linear-rate-limit-tests)
- BA Layer protocol: contract tests — fixture spec + câu hỏi mẫu: spec-answerable →
  auto + audit; ngoài spec → relay. Không test Claude-giác quan — test PROTOCOL
- E2E: 1 story fixture chạy trọn spawn → prompt → auto-answer → done
- Regression: L-suite story-launch giữ nguyên (spawn hai bước + cấm bypass)

## 8 · Rollout

1. Bin `story-pane-watch` + wiring watchdog/coordinator-pass (nhỏ, độc lập)
2. BA Layer protocol vào SKILL.md + coordinator brief template (doc)
3. Áp dụng ngay trên VU-32 (sf-4 đang chạy — coordinator chuyển vai BA từ giờ)
4. Phase 2: patch template Orca bỏ bypass (ghép đợt #5 restart app) — khoá tuyệt đối

## 9 · Success criteria

1. Worker story không dừng >1 sweep mà không có state phân loại + relay
2. 0 spawn bypass mới từ kit (bypass-pid baseline không đổi ngoài baseline cũ)
3. Mọi auto-answer của BA có audit trích dẫn nguồn
4. User chỉ bị hỏi business-judgment — đo bằng: số relay/tuần và tỷ lệ relay
   có khuyến nghị kèm theo
