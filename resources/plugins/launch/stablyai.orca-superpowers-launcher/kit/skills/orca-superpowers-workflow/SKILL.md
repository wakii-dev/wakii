---
name: orca-superpowers-workflow
description: >-
  Complete superpowers workflow with automatic orca-bridge integration. Use this for ANY feature work in Orca-managed projects.
  Automatically invokes Bridge 5 (Linear sync), Bridge 1 (worktree), Bridge 3 (task DAG), and Bridge 2 (gates) at key transition points.
  Uses writing-plans-linear to publish plans directly to Linear issues for team visibility.
  Replaces manual invocation of brainstorming + writing-plans + Orca orchestration (execute/gate/worker-start) with a unified workflow that handles Orca infrastructure automatically.
---

# Orca + Superpowers Unified Workflow

Handles the complete superpowers workflow and auto-activates Orca bridges (5, 1, 3, 2) at the right moments.

## When to Use / Not

Use for ANY new feature work in an Orca-managed project (Orca worktrees + Linear), or when you'd reach for `superpowers:brainstorming`.

**Skip** when: user wants to skip Linear/worktree integration, a quick fix, or says "skip the workflow" / "just implement it".

# ⚠️ MINDSET SỐ 0 — BROWSER LÀ NƠI TÔI LÀM VIỆC (không phải tool để gọi)

**Đây KHÔNG PHẢI rule để check — đây là CÁCH TÔI LÀM VIỆC.**

## Sai lầm tôi lặp đi lặp lại (và phải chấm dứt):

```
SAI:  code → tests pass → launch agent → nói agent "mở browser test"
      → tôi ngồi xem CLI status → user gặp lỗi

ĐÚNG: code → TÔI MỞ BROWSER → TÔI NHÌN màn hình → TÔI CLICK
      → TÔI THẤY nó hoạt động (hoặc KHÔNG) → rồi mới nói "xong"
```

## Tại sao tôi cứ bỏ qua browser (phải tự nhận diện pattern này):

1. **CLI dễ hơn browser** — gõ lệnh → kết quả ngay. Browser cần focus,
   cần đợi render, cần tìm element. Tôi lười nên chọn CLI.
2. **DOM query cho cảm giác "đã kiểm tra"** — đo được height/màu → nghĩ
   "đã verify". NHƯNG: DOM đúng ≠ người dùng thấy đúng. Element có thể
   bị ẩn, bị clip, bị che, không scroll tới được.
3. **"Agent sẽ test" = thoái thác** — tôi launch agent với prompt
   "mở browser test" rồi coi như xong việc. Agent có thể test sai,
   test thiếu, hoặc không test gì cả.

## BROWSER-LÀM-VIỆC (thay thế CLI-first):

```
TRƯỚC KHI BẮT ĐẦU bất kỳ việc gì liên quan UI:
  1. MỞ orca browser → NHÌN hiện trạng (không đo, chỉ nhìn)
  2. CHỤP SCREENSHOT → lưu làm BEFORE
  3. Làm việc (code/fix)
  4. MỞ browser LẠI → NHÌN kết quả
  5. CHỤP SCREENSHOT → lưu làm AFTER
  6. So BEFORE vs AFTER → có khác đúng ý không?
  7. NẾU screenshot fail → HỎI USER nhìn giúp → KHÔNG tự đo DOM thay thế

SAU KHI LAUNCH AGENT:
  1. ĐỪNG ngồi xem CLI status
  2. MỞ browser → NHÌN agent đang làm gì trên màn
  3. Nếu agent sửa UI → TÔI cũng phải thấy kết quả

KHI GẶP LỖI:
  1. ĐỪNG đo DOM từng element
  2. MỞ browser → NHÌN màn hình lỗi bằng mắt
  3. Chụp screenshot → phân tích từ ảnh (không từ DOM query)
```

## QUY TẮC TUYỆT ĐỐI:

1. **Screenshot > DOM query** — ảnh cho thấy TOTAL; DOM chỉ từng mảnh
2. **Tôi tự nhìn > agent báo cáo** — agent có thể sai; mắt tôi không
3. **Screenshot fail → nói thật + nhờ user** — không lặng lẽ fallback sang DOM
4. **Mở browser TRƯỚC khi code** — xem hiện trạng rồi mới sửa
5. **CLI chỉ dùng cho: git, tests, servers, deploy** — KHÔNG dùng thay browser

**Verify = TÔI mở browser, TÔI nhìn bằng mắt, TÔI chụp screenshot, TÔI thấy nó hoạt động. Không agent, không DOM query, không tests report. TÔI.**

> Bài học 30/8: tôi code auth system, 205/205 tests pass, reviewer approve,
> merge main, nói user "thử đi" — user KHÔNG ĐĂNG NHẬP ĐƯỢC. Vì tôi không
> bao giờ mở browser để tự thử. Tests kiểm MẢNH RIÊNG — chỉ browser kiểm
> CHUỖI LIỀN MẠCH. Nếu tôi không tự verify = tôi giao sản phẩm mù.

## 3 TẦNG NHẬN THỨC — cách AI "nhìn" browser (must-know)

**Tầng 1 — DOM query (eval):** Đo được số liệu (height, màu hex, text).
→ HỮU ÍCH cho: kích thước chính xác, format data, giá trị form.
→ HẠN CHẾ: KHÔNG thấy tổng thể — chỉ từng mảnh rời rạc. Dễ đo nhầm element.
→ CẢNH BÁO: Query element không tìm thấy ≠ không tồn tại. Có thể sai selector,
  element chưa render, hoặc ở trong shadow DOM.

**Tầng 2 — Screenshot (visual):** Thấy ảnh tĩnh của màn hình.
→ HỦU ÍCH cho: layout tổng thể, màu sắc thực tế, spacing, design fidelity.
→ CẦN: So VỚI Figma capture đặt cạnh nhau — không chỉ nhìn một mình.
→ HẠN CHẾ: Không thấy animation, hover states, scroll feel. Cần window focus.

**Tầng 3 — Trải nghiệm flow (walkthrough):** Đi trọn luồng người dùng.
→ CHỈ CÁCH NÀY xác nhận "hoạt động thật": login → navigate → click → logout.
→ DOM từng bước + screenshot mỗi màn + check console errors.
→ ĐÂY là "TÔI đã thấy nó hoạt động" — không phải đo từng mảnh rồi ghép.

**Quy tắc nhận thức:**
1. DOM query THẤT BẠI ≠ kết luận "không có bug" — chỉ là tôi không tìm thấy
2. Screenshot là BẰNG CHỨNG mạnh nhất cho UI — ưu tiên hơn DOM đo từng element
3. Flow walkthrough là CHUẨN ĐO DUYNHẤT cho "xong" — DOM + screenshot chỉ hỗ trợ
4. Nếu tôi không THẤY được (screenshot fail, DOM không match) → NÓI THẬT
   "tôi không xác nhận được" → nhờ USER xác nhận bằng mắt → KHÔNG tự kết luận

**Verify = trải nghiệm bằng giác quan + so với thiết kế + chỉ khi hoạt động mới nói "xong".**

---

## 5 GATES — chặn sai sót ở mọi bước (tool-enforced)

```
GATE 1: PRE-FLIGHT (trước code)
  ~/.claude/bin/story-preflight
  → đúng branch · tree sạch · server sống · DB có data · deps

GATE 2: DIFF-REVIEW (trước commit)
  ~/.claude/bin/story-diff-review
  → không debug code · không secrets · files trong plan · tokens-only

GATE 3: BROWSER TEST / Rule 0 (trước "xong")
  ~/.claude/bin/story-test <url> --login --flow
  → mở browser → đi flow → screenshot → PASS → touch .browser-test-passed

GATE 4: ENV-SNAPSHOT (trước/sau merge)
  ~/.claude/bin/story-snapshot-env <tag>
  → chụp branch/head/servers/db/agents

GATE 5: POST-MERGE (sau merge)
  ~/.claude/bin/story-post-merge <dest> --login --port
  → tests trên đích + browser + agents sống
```

## Prime Directive (applies to every phase, overrides everything below)

**Do not guess. If anything is unclear, you MUST stop and resolve it before continuing.** Before writing code, creating an issue, drafting a plan, or invoking a bridge, ask: *do I actually understand this, or am I pattern-matching?*

**Stop when you encounter:** ambiguous requirement (scope/intent/success unclear) — surface options, don't pick silently; unread codebase (about to modify code you haven't read, or depend on inferred behavior) — read it first; unknown API/convention/file layout — discover from the codebase (grep, read), never from memory or other projects; design/data ambiguity — don't fabricate tokens/types/shapes, fetch/verify then state what you found; conflicting signals between request and existing code.

**Resolve in order:** (1) ask the user when only they can decide (intent, scope, tradeoffs) — specific question, not vague; (2) read/probe the codebase when the answer lives in code; (3) proceed only once resolved, stating briefly what you found.

This is a **hard rule**. "I assumed X" is never an acceptable post-mortem. First exercised in Phase 0, binds throughout Phase 1-5 and any ad-hoc action.

## Token Contract Table (single source of truth for launcher wiring)

| Token in Start prompt | Effect | directives.json key |
|---|---|---|
| `Autonomous mode: ON.` | Gates self-approved after P3 checkpoint (mandatory); no chat stops | `AUTONOMOUS_TOKEN` |
| `audit-log: off` | Skip Principle 7 entirely for the run | `AUDIT_OFF_TOKEN` |
| `Phase 0 analyst: ON.` | `phase0-impact-analyst` dispatch mandatory (even small changes) | `PHASE0_ANALYST_TOKEN` |
| `Spec critic: ON.` | spec-critic gate mandatory regardless of mode/size | `SPEC_CRITIC_TOKEN` |
| `Plan critic: ON.` | plan-critic gate mandatory regardless of mode/size | `PLAN_CRITIC_TOKEN` |
| `Code review: ON.` | code-reviewer before EVERY task gate resolution (incl. Quick-fix) | `CODE_REVIEWER_TOKEN` |
| `Security audit: ON.` | security-audit unconditional (overrides OWASP auto-detect) | `SECURITY_AUDIT_TOKEN` |
| `Verifier: ON.` | Explicit re-affirm of the always-mandatory verifier | `VERIFIER_TOKEN` |
| `Rollback fixer: ON.` | rollback-fixer for ANY rollback incl. single-commit Quick-fix | `ROLLBACK_FIXER_TOKEN` |
| `Execute mode: delegate\|inline\|superpowers` | Overrides Phase 4 delegation table for the run | `EXECUTE_*_TOKEN` |

Renaming any token requires updating its directives.json key in the same change — the token is the only wire between panel and skill. Inline mentions below refer to this table.

## Phase-Ordering Invariant (overrides everything below)

**Every workflow run executes Phase 0 → 1 → 2 → 3 → 4 → 5 in order. No phase is skippable EXCEPT via the Tier system (Phase 0: Quick-fix skips Phases 0-3, Standard abbreviates Phase 0 — see tier table). Autonomous mode changes WHO approves the gates, not WHETHER phases run.**

- **Phase 0 (impact analysis) MANDATORY** both modes (Full + Standard tiers). Autonomous does it fully (5 sections + multi-dim) and picks direction itself instead of asking — does NOT skip.
- **Phase 1 (Linear issue via Bridge 5) MANDATORY** both modes (Full + Standard tiers). Create issue + "In Progress" before any worktree, spec, or code. No exceptions, including autonomous.
- **Phase 2 MUST invoke `superpowers:brainstorming`** — do NOT write the spec yourself from Phase 0. Phase 0 = impact analysis; brainstorm skill = spec; they are sequential, not interchangeable. Writing `Status: Approved (autonomous self-review passed)` in a self-authored spec is a Phase-2 violation.
- **Phase 3 (plan + task DAG) MANDATORY** both modes (`writing-plans-linear` posts plan to Linear). Task DAG runs when plan has 5+ steps.
- **Phase 4 gates exist in autonomous too** — autonomous self-approves after self-adversarial review; it does not delete them.

If you're about to write code, a spec, or a plan and Phase 0 (output produced) AND Phase 1 (Linear issue created) are not both complete, **stop and run them now**. Order is not optional.

## Precedence Stack (when rules conflict, top wins)

**Prime Directive > Phase-Ordering Invariant > Principles (2-8) > Workflow phase instructions > Examples/templates.**

The Prime Directive (don't guess — ask or read code) outranks Phase-Ordering: if a phase instruction tells you to proceed but you don't actually understand the requirement/codebase, STOP and resolve first. Phase-Ordering outranks Principles: a principle cannot authorize skipping a phase. Principles outrank workflow examples: if a sample command contradicts a principle, the principle wins.

## Principle 2: Surgical Scope (applies to every phase)

**Code only what the feature needs. Touch only files the feature requires.** Every changed line must trace directly to the feature request.

- **No drive-by edits** — don't improve/reformat/refactor adjacent code; match existing style.
- **No speculative abstraction** — no helpers/options/config for hypothetical needs; three repeated lines beat a premature abstraction.
- **No unrelated cleanup** — spot pre-existing dead code/issues outside scope → *mention to the user*, don't fix silently.
- **Own your orphans, not others'** — remove only what YOUR change made unused; leave pre-existing dead code unless asked.
- **Discover the right place** — follow codebase conventions for new files (ties to Prime Directive); if unsure where a file belongs, ask.

If you can't map a change to the request, it doesn't belong here. Surface unrelated findings as a note, not a diff.

## Principle 3: Autonomous Self-Review (mandatory when Autonomous mode: ON.)

Autonomous mode turns gate approval over to you; without a disciplined substitute it becomes rubber-stamping. Run this checkpoint before ANY self-approval: gate resolution, direction pick, alternative choice, irreversible action.

**Activation contract:** triggered by the literal token `"Autonomous mode: ON."` in the Start prompt (see Token Contract Table). In non-autonomous mode this checkpoint is optional (the user reviews at gates); in autonomous it is mandatory.

**Checklist (all five, in order):**
1. **Strongest counter-argument.** State one reason the decision could be wrong. Can't find one → re-read the code/request, you haven't looked hard enough.
2. **Missed edge case / second-order effect.** What breaks under different input, scale, or state?
3. **Reconsider one dismissed alternative.** Sound dismissal, or convenience?
4. **Verify against the codebase** (don't trust memory). Probe the files/APIs/conventions the decision rests on.
5. **Decide.** Proceed only if the review passes. Real problem you can't resolve → STOP, ask the user a specific question.

**Division of labor with P4 (no double-dip):** P4 owns the Phase 0 dimension sweep (functional/perf/security/...) in both modes; this checkpoint critiques the *picked direction or gate* — a single decision. In autonomous Phase 0: run P4 once → then this checkpoint once. Never re-run a dimension sweep here.

## Principle 4: Multi-Dimensional Analysis (binds in Phase 0, both modes)

**AI sees dimensions one at a time, not the whole picture at once.** In Phase 0, analyze the decision across *multiple* dimensions explicitly — don't grab the first angle that fits. Pick the ones relevant to THIS feature (justify each in-scope pick + each skip); don't blindly run all.

| Dimension | Probe |
|-----------|-------|
| Functional | Meets the requirement? |
| Technical/architecture | Fits existing arch? coupling/layering? |
| Data | Schema, migration, state transitions, integrity |
| Performance | Scale, latency, hot paths, bottlenecks |
| Security | Attack surface, auth, input validation, secrets |
| Backward-compat | Breaks existing API/contract/consumers? |
| UX | User flow, error states, edge-case UX |
| Maintenance | Readability, testability, debuggability |
| Operational | Logging, monitoring, alerting, rollback path |
| Business | Right priority? ROI? goal alignment? |

**Apply (Phase 0 output, both modes):** for each in-scope dimension → one assessment + one risk/gap. **Justify skips explicitly** ("skipping UX: backend-only") — silent omission or bare "N/A" = violation. Don't let the first dimension you saw drown out the others. In autonomous mode, P4 pairs with P3 (P4 sweeps dimensions → P3 critiques the picked direction; see P3 division of labor).

## Debugging discipline: 3-WHY + attempt-cap

Khi gặp lỗi — TRẢ LỜI 3 CÂU trước khi fix:
1. WHAT: Lỗi chính xác là gì? (đọc FULL message, không scan)
2. WHY: Tại sao xảy ra? (root cause, không phải symptom)
3. PROOF: Làm sao tôi BIẾT fix đúng? (tái hiện → fix → lỗi hết)

Track attempts:
```bash
~/.claude/bin/story-attempt log "<approach>" "<result>"
```
Sau 3 lần cùng approach → BUỘC đổi hướng (hỏi user / debug sâu / restart sạch / làm phần khác).

## Principle 5: Self-Doubt Proactive (binds throughout, every phase)

**Always question yourself. Proactively look for what's suspicious about your own work — don't wait for it to break.** This is a standing habit (not a one-time check) binding every phase, every claim, every conclusion.

**Triggers** — fire doubt whenever: about to assert something as fact (did I verify it this session, or pattern-matching from memory?), while writing code (looks right vs. *is* right; what input breaks it?), after completing a step (what did I assume?), when something feels easy (easy = pattern-match risk), when reusing knowledge (memory is stale by default).

**Act on it:** don't suppress a flicker — chase it. Verify over assume (read/run/probe, don't reason from "probably"). Self-cross-check (try to refute your own claim before asserting). Surface residual doubt explicitly to the user ("not sure X because Y — dig more?"). Treat your own past conclusions as suspect — re-check on new evidence.

**Anti-pattern:** "I'm confident this works" without having probed how it could fail. Confidence without verification is the failure mode this principle exists to kill.

## Principle 6: Continuous Improvement Flag (in-flight, do NOT self-edit skill)

If you notice a gap in the workflow/skill itself mid-task — do NOT silently self-edit. Flag it for the user to approve intentionally.

**Triggers:** rule/template doesn't fit (too rigid/loose/wrong); missing step you had to do; scope/decision mismatch; ineffective prompt (had to re-read 3×); bug or contradiction inside this SKILL.md.

**Action — flag, don't fix:**
1. Print inline at the point you noticed it: `⚠ IMPROVEMENT OPPORTUNITY: <what> at <where> — suggested change: <how>`
2. Append to `docs/superpowers/improvements-log.md` (create if missing): date, task/issue id, what, where, suggested change.
3. Continue the task — do NOT pause to fix the skill (loses focus + risks a bad auto-edit). User reviews the log periodically.

**Why not auto-fix:** a skill edit during a task is unreviewed, can corrupt the contract, and may be based on a misread. Memory `feature-explorer-wrongly-deleted-restored` — auto-fix once destroyed active code. Flagging is safe; auto-editing is not. Ties to P2. **Applies in both modes** — in autonomous you still flag, you do NOT self-approve a skill edit.

## Principle 7: Linear Audit Log (default ON; opt-out only via Start prompt)

**After EVERY phase and EVERY Phase 4 task, push a reproduction-grade comment to the Linear issue.** Goal: someone (you, another agent, a reviewer) reading the comments later can REPRODUCE the entire workflow for a similar issue — every decision, command, and output.

**Command:**
```bash
orca linear comment add --current --body "<markdown>" --json
# or for multiline:
orca linear comment add --current --body-file - --json <<'EOF'
<markdown>
EOF
```

**Per-milestone minimum content** (each comment MUST carry enough to reproduce that step without re-thinking):

| Milestone | Required content |
|-----------|------------------|
| After Phase 0 | Direction chosen + WHY (rationale for A vs B, what was dismissed), touch map, top risks, gate status |
| After Phase 1 | Issue identifier, status set, worktree path |
| After Phase 2 (brainstorm) | Absolute spec path + scope summary (in/out) + key clarifying Q&A that shaped the design |
| After Phase 3 (plan) | Absolute plan path + task count + DAG tier structure + key orca commands used (so they can be replayed) |
| During Phase 4 (per task) | task N/total, title, exact commands with `--flags`, key output ids (issue/gate/task/commit hash), gate resolution — max ~15 lines. Full narrative (files modified, reviewer notes, rationale) goes in the consolidated "Phase 4 full reproduction" comment |
| After Phase 4 final gate | Verification outcome + evidence (test result, build status) |
| After Phase 4 (full reproduction) | ONE consolidated comment: per-task files modified, reviewer notes, rationale, gate resolutions — the reproduction-grade narrative for the whole execution phase |
| After Phase 5 | Done status, PR link, post-task-ritual summary (patterns learned) |
| BLOCKER / ESCALATION / ERROR | what + when + full error context + how resolved (or what was tried) |

Format: markdown (bold headers, fenced code blocks for commands/outputs, bullet lists). Skip in Quick-fix mode (no Linear issue). Standard tier: single end-of-run comment instead of per-task comments.

**Resume idempotency (applies when resuming mid-workflow — e.g. continue-plan, resume, restart):** before commenting for a phase/task, check whether that milestone was already logged. Each comment MUST start with a milestone marker line (`**Phase 0**`, `**Phase 1**`, `**Phase 2**`, `**Phase 3**`, `**Phase 4 task N/total**`, `**Phase 4 full reproduction**`, `**Phase 4 final gate**`, `**Phase 5**`). On resume:
```bash
# (learned 2026-08-31 FI-234: `orca linear comment list` KHÔNG tồn tại —
# pipe-swallowed error tự biến thành "0 comments" ảo. Lệnh list comments
# hoạt động, đã verify, là `orca linear issue <id> --comments --json`
# (trả comments[].body). Parse bằng python3 nếu jq không có trên máy.)
orca linear issue <id> --comments --json | python3 -c "import sys,json; [print(c.get('body','')) for c in json.load(sys.stdin).get('result',{}).get('issue',{}).get('comments',[])]" | grep -E '^\*\*Phase [0-5]'
```
- If the milestone marker for the phase you're about to log **already exists** → SKIP commenting (do not duplicate). The first comment wins.
- If it's **missing** → comment normally (backfill with the actual state, not a guess — if you don't have the output for a past phase, say "reconstructed from plan/state" rather than fabricating).
- Phase 4 per-task comments are keyed by `task N/total` — only deduplicate the same N, not across tasks.
This prevents double-commenting on resume and silent skips when the agent wrongly assumes a phase was already logged.

**Opt-out:** the Start prompt may include a literal `audit-log: off` token (see Token Contract Table) — if present, skip this principle entirely for that run. Absent = ON.

## Principle 8: Figma Pipeline (auto-triggers khi description chứa figma.com URL)

**Quy tắc lõi: mọi giao tiếp với Figma đi qua MỐT pipeline F1-F13 dưới đây —
một nguồn (repo captures), một format (5 sections), một đường verify.**
Không tự chế biến thể. (Thống nhất 2026-08-28 sau FI-187: 7 mảnh rải rác —
P8 cũ, bracket Design:, captures /tmp mồ côi, URL chết theo session, review
bằng mắt agent, diff số liệu mù, launch prompt text-only — gây app khớp
text-spec mà SAI design: thiếu sidebar 48px + header + row 80px.)

**Kích hoạt:** description có `figma.com/(design|file|proto|board)/` URL
HOẶC bracket ghi `Design: figma`. Bắt đầu bằng `figma-orientation` (router).

### Tầng NGUỒN (chống mất — bài học 12 ngày mất URL)

- **F1. FIGMA-INDEX.md** tại `docs/superpowers/figma/<story-slug>/` — ghi
  file key + mọi node-id dùng trong story + trạng thái capture. URL Figma
  KHÔNG BAO GIỜ chỉ sống trong chat/session — vào index, commit, dùng mãi.
- **F2. Capture + DEEP-DIVE mọi frame spec nhắc** ngay ở Phase 0/CREATE,
  per frame-id (Figma là input trọng yếu — phân tích cạn =garbage in,
  garbage out toàn story; FI-187 trả giá: khớp text-spec, sai design):
  - `.png` — screenshot ĐẦY ĐỦ phân giải (fidelity target; KHÔNG dùng
    Orca artifacts — link hết hạn)
  - `.md` — **8 sections, đủ mới gọi là phân tích xong**:
    1. `Intent (why)` — màn này phục vụ nhịp làm việc nào; quyết định
       density/spacing/biến có mặt là vì gì
    2. `Layout logic` — auto-layout → CSS CONSTRAINT (w fixed vs fill,
       h chuẩn, gap, padding) — KHÔNG tọa độ tuyệt đối
    3. `Component inventory` — MỖI component trong frame được phân loại:
       REUSE (có sẵn /packages/ui) · EXTEND · NEW + vị trí đề xuất
    4. `States matrix` — từng element tương tác × hover/focus/disabled/
       selected/loading/empty (Figma thường chỉ vẽ default — thiếu state
       nào liệt kê thành câu hỏi, không bịa)
    5. `Tokens (đo được)` — màu/type/radius/spacing ĐO từ design context
       (không nhớ nhớ) + đối chiếu tokens package hiện có
    6. `Interactions & flows` — gì mở gì (nút → popup nào), ESC/F4,
       keyboard, polling — từ prototype connections + convention
    7. `Data shapes inferred` — frame ngụ ý API fields gì (cột bảng =
       fields của DTO; chip = enum) → feeds contracts
    8. `Open questions` — mọi điều frame KHÔNG trả lời được → thành
       REQUIREMENT-GAP ngay ở CREATE, không chờ SF gặp
  - `.json` — node-id · size · lastModified · capturedAt
  - **F2b. Design-critic round (bắt buộc ở CREATE)** — một đầu khác đọc
    capture .md SO VỚI raw design context, checklist:
    [ ] đủ 8 sections, không section rỗng không lý do
    [ ] component inventory phủ MỌI element nhìn thấy trong ảnh
    [ ] states matrix có ≥1 hàng cho mọi element tương tác
    [ ] tokens khớp màu đo được (spot-check 3)
    [ ] open questions không chứa câu mà frame thật sự đã trả lời
    Fail → bổ sung capture TRƯỚC khi CREATE commit. (Capture là spec
    của design — nó xứng đáng critic như spec-critic với spec.)
- **F3. Commit cùng story CREATE** → mọi SF kế thừa qua git (cơ chế
  context packs). Idempotent: frame-id có sẵn → reuse, không re-fetch.

### Tầng SF (kế thừa — không re-analyze)

- **F4. Launch prompt** trỏ ĐƯỜNG DẪN capture (.md + .png), không chỉ
  node-id (story-launch template đã gắn sẵn).
- **F5. Drift guard**: SF Phase 0-mini so `lastModified` capture vs Figma
  live → khác = REQUIREMENT-GAP ("Figma đổi sau duyệt — bản nào?"), không
  tự implement bản mới. Frame CHƯA capture → pull + commit trên nhánh SF.
- **F6. Code theo Intent + Layout logic + States + Tokens** — KHÔNG code
  từ ảnh suông, KHÔNG từ text-spec (text không ghi sidebar/row-height —
  FI-187 chứng minh). Tokens-only: hex cứng ngoài tokens package = P1.
  Component mới: `image-to-code` với capture làm fidelity target.

### Tầng REVIEW + VERIFY (đo được — không tin mắt dev)

- **F7. BROWSER WALKTHROUGH (bắt buộc TRƯỚC khi nói "xong")** —
  (bài học UAT 30/8: "150/150 tests xanh" ≠ "người dùng đăng nhập được".
  Agents code mù — không mở browser, không thấy màn hình, không đi trọn
  flow → user gặp lỗi ngay lần đầu. Tests unit kiểm MẢNH RIÊNG, không
  kiểm CHUỖI LIỀN. Browser walkthrough là CỔNG DUY NHẤT phát hiện:
  cookie cross-origin chết · React state không navigate · UI render sai
  · luồng người dùng đứt chỗ mà code "đúng")

  **KHI NÀO MỞ BROWSER (7 thời điểm — không được bỏ):**
  | Thời điểm | Tại sao | Làm gì |
  |---|---|---|
  | Sau MỖI task có UI | Component render đúng? | tab create → snapshot → thấy đúng → commit |
  | Sau auth/session/routing change | Cookie sống? Navigate? | Login → navigate → thấy màn |
  | Sau MỖI merge vào đích | Merge không vỡ? | Mở app → flow chính → screenshots |
  | Trước nói "task xong" | Rule 0 | Đi trọn flow → chụp → so design |
  | Khi user báo lỗi | Tái hiện bằng mắt | Làm đúng bước user → thấy lỗi |
  | Sau FIX bug | Fix có work? | Mở browser → làm lại → PASS |
  | Trước STORY-COMPLETE | F9 sweep | Mọi screen → chụp → so → sạch |

  **Trình tự F7 (agent tự làm, KHÔNG giao user):**
  ```bash
  # 1. Mở app trong browser
  orca tab create --url http://localhost:<port>

  # 2. Đi trọn luồng user bằng tay (KHÔNG curl API — phải qua UI):
  #    login → navigate → thao tác chính → logout
  #    (từng bước: fill form → click → chờ → snapshot → check kết quả)

  # 3. Nếu có auth: đăng nhập THẬT qua UI (không bypass bằng header)
  #    → verify cookie sống → verify navigate sau login

  # 4. Chụp screenshot mỗi màn (fidelity + audit trail)
  orca screenshot --format png

  # 5. Snapshot structure để audit: đủ phần tử? đúng vị trí? đúng text?
  orca snapshot

  # 6. Chỉ khi MỌI bước qua → mới được báo "UI hoạt động"
  ```

  **Checklist F7 (phải PASS từng dòng):**
  - [ ] App mở không lỗi console (F12 network tab sạch)
  - [ ] Login → chuyển trang đúng (nếu có auth)
  - [ ] Cookie/session sống qua nhiều request (nếu cross-origin: SameSite đúng)
  - [ ] Mọi nút/form thao tác được (click thật, không chỉ inspect code)
  - [ ] Điều hướng giữa screens hoạt động
  - [ ] Chụp screenshot SO VỚI Figma capture → liệt kê gap từng mục
  - [ ] Thoát/logout → quay về màn login → back button không vào lại được

  **PHÁT HIỆN SỚM — UI audit checklist (rà từ F7 screenshot, so với design):**
  | Kiểm tra | Cách phát hiện |
  |---|---|
  | Shell: sidebar / header / footer | So ảnh — có đường phân cách dọc/ngang không? |
  | Density: row height / spacing | Đếm pixel từ screenshot (PIL) |
  | Vị trí: buttons / filters / pagination | Design ghi PHẢI → actual ở đâu? |
  | States: hover / disabled / focus / empty | Click thử + screenshot từng state |
  | Đủ phần tử: thiếu cột / thiếu nút / thiếu hint | Snapshot tree so với design tree |
  | Format: ngày / số / tiền tệ | So text từng cell với design |
  | Cross-origin cookie chết | Login xong navigate → quay về login = cookie rớt |
  | React state không update | Fill form → submit → thấy alert lỗi gì? |

- **F7b. Visual diff (sau khi walkthrough pass):** đặt CẠNH capture chuẩn
  → liệt kê từng khác biệt (vị trí + design + actual). Pixel-diff cho SỐ
  (chú ý: diff đều ≠ khớp — có thể lệch style toàn cục; diff cục bộ vọt
  = sai vùng đó). Verdict có dẫn chứng ảnh.

- **F8. UX review (P8.6)** — 3 lớp chạy như TASK trong plan (không phải
  gợi ý), so implementation lại Intent:
  · `web-design-guidelines` — 105 rules cụ thể trên CODE (a11y/focus/
    forms/animation/keyboard) — bắt lỗi ảnh không thấy được
  · `gpt-taste` + `design-taste-frontend` — thẩm mỹ + anti-slop
  · `frontend-design` — chủ đích: signature, copy-as-design, calibration
    chống 3 "AI default looks"
- **F9. Story-level visual sweep** (convergence SF): mọi key screen chụp
  lại → so capture chuẩn → gap-list repair → re-chụp tới sạch.

### Quy tắc vàng (ngắn)

1. Nguồn duy nhất = repo captures + FIGMA-INDEX. Figma MCP chỉ để
   CAPTURE/lần đầu, không re-read mỗi phase.
2. **"Xong" = F7 browser walkthrough PASS + ảnh hai bên cạnh nhau.**
   Tests xanh ≠ người dùng dùng được. KHÔNG được nói "UI hoạt động"
   nếu chưa tự mở browser + đi trọn flow + chụp screenshot.
3. Thiếu capture = KHÔNG code frame đó (pull trước — 5 phút).
4. **Browser walkthrough TRƯỚC khi merge**, không phải sau. Bắt lỗi
   cookie / navigate / render ở tầng dev rẻ hơn ở tầng user 100 lần.

*(Phase 0 six-step cũ: VERIFY → DIFF vs codebase → COMPONENT MAP → FILE
STRUCTURE → IMAGE-TO-CODE → UX REVIEW vẫn đúng thứ tự bên trong — giờ
được tổ chức thành F1-F9 với storage + verify tường minh.)*

## The Workflow

```
USER INPUT (feature idea)
    ↓
[PHASE 0] Impact analysis & direction sync → HARD GATE (chat approval; autonomous self-picks)
    ↓
[PHASE 1 / BRIDGE 5] Create Linear issue + set "In Progress"
    ↓
[PHASE 2] superpowers:brainstorming → spec.md (MANDATORY in both modes; autonomous self-answers) → [BRIDGE 1] worktree
    ↓
[PHASE 3] writing-plans-linear → plan (MANDATORY) → [BRIDGE 3] task DAG (if 5+ steps)
    ↓
[PHASE 4] execute plan tasks (inline OR delegate via `orca orchestration worker-start` per the Delegation table) → [BRIDGE 2] gates at checkpoints via `gate-create`
    ↓
[BRIDGE 2] Gates at verification checkpoints
    ↓
[BRIDGE 5] Update Linear to "Done"
    ↓
post-task-ritual (skill self-improvement: learn → pattern → update skill)
```

## Phase-by-Phase Instructions

### Principle → Phase matrix (which principles bind at each phase)

| Phase | Always-bind | Conditional |
|-------|-------------|-------------|
| **0** Impact Analysis | PD, PO, 2 (surgical), 4 (multi-dim), 5 (self-doubt), 6 (flag) | 8 (figma — if URL), 3 (self-review — if autonomous), 7 (audit) — binds per matrix |
| **1** Bridge 5 (issue+worktree) | PO, 5, 6 | 7 (audit) |
| **2** Brainstorm (MANDATORY invoke) | PD, 2, 5, 6 | 7 (audit) |
| **3** writing-plans-linear (MANDATORY) | 2, 5, 6 | 7 (audit) |
| **4** Execute + gates | PD, PO, 2 (per-task commit), 5, 6 | 3 (self-approve gate — if autonomous), 7 (audit per task) |
| **5** Final sync + verifier | PO, 5, 6 | 7 (audit), security-review (if OWASP surface) |

**Legend:** PD = Prime Directive · PO = Phase-Ordering · 2 = Surgical Scope · 3 = Autonomous Self-Review (triggered by `"Autonomous mode: ON."` — see Token Contract Table) · 4 = Multi-Dim · 5 = Self-Doubt · 6 = Continuous-Improvement-flag · 7 = Audit Log · 8 = Figma Verify. "Always-bind" principles CANNOT be opted out (foundational); "Conditional" principles fire on toggle/URL/surface.

### Phase 0: Impact Analysis & Direction Sync (binds per tier — Full runs it fully, Standard abbreviated, Quick-fix skips)

**When:** Before creating any Linear issue, worktree, or plan — confirm direction *before* committing hard-to-rollback resources.

**Tier system (canonical — Quick-fix mode and Phase 0 must agree on this):**

| Tier | Criteria (ALL must hold) | Workflow |
|---|---|---|
| **Quick-fix** | ≤1 file, ≤10 lines (add+delete), no API contract/DB schema/config/env var/shared utility touched, no second-order effects on other features | Skip Phases 0-3 (per launcher Quick-fix directive) |
| **Standard** | ≤4 files, ≤150 changed lines (add+delete), no API contract/DB schema/config/env var touched, no cross-feature second-order effects | Abbreviated Phase 0 (touch map + risks only, no alternatives fork); Phase 1 issue; no task DAG, no critics, no per-task audit comment (single end-of-run audit comment); commit per task |
| **Full** | anything failing Standard | All 6 phases, all conditional gates |

When in doubt between two tiers, run the higher one. The Quick-fix criteria are kept in sync with `directives.json` `QUICK_FIX_DIRECTIVE`; the source of truth lives here — if you edit one side, edit the other. **Mid-flight tier escalation:** when a Standard-tier run discovers scope beyond its criteria → STOP, report, re-enter at Full tier from current state (do not retroactively create missed artifacts — the audit comment for artifacts you do create notes the tier change).

**Orphan-state recovery (run before Phase 0 on every invocation):** check for orphaned workflow state from a previous crashed/interrupted run:
```bash
orca orchestration run-list --json | jq -r '.result.runs[] | select(.legacy != true) | "\(.id) \(.objective) \(.updated_at)"' | head -5
```
- If runs exist with `in_progress` tasks AND no recent agent activity in the terminal → **orphan**. Report to the user: "Found orphaned run `<id>` for `<objective>` (last updated `<time>`)." Offer 2 options: (a) resume that run (continue from where it stopped), or (b) clean it up (mark task failed + close run). Do NOT silently start a new run on top of orphans — that creates Linear/worktree confusion.

**Action:** Produce the impact analysis below, then **STOP** and wait for chat approval before Phase 1. Do NOT call any orca bridge yet. This is a chat-approval gate (same fallback as Phase 4 gates without a taskId).

```
<!-- Template below — fill each section, then paste the populated analysis into the chat. Headings inside this fence are template fields, not document sections. -->
## Phase 0: Impact Analysis

### 1. Problem framing
1-2 sentences in your own words. Separate the actual problem from any proposed solution ("user suggested X to solve Y; real problem is Y"). Flag scope ambiguity.

### 2. Touch map
- Files/modules to modify: <list, paths>
- Consumers/callers that depend on them (regression candidates): <list>
- Shared surfaces: API contracts, DB schema, config, env vars, events — <which>

### 3. Second-order effects
- Existing features that could break under the proposed direction
- Non-functional (per Principle 4 — analyze across ALL relevant dimensions: functional/arch/data/performance/security/backward-compat/UX/maintenance/ops/business; justify any skip): perf, security, backward-compat, migrations
- Interaction with adjacent features / in-flight work

### 4. Alternatives (≥2)
- Direction A: <summary> — pros / cons / blast radius
- Direction B: <summary> — pros / cons / blast radius
(Prefer smaller blast radius unless a tradeoff is justified.)

### 5. Risks & unknowns
- What must be verified before implementing (probes, reads, experiments)?
- Unverified assumptions you're about to make?
```

**Then STOP.** Ask one direct question: *"Which direction (A/B/other), and is the touch map complete?"* Don't proceed to Phase 1 until answered. If the user changes direction, update + re-confirm first.

**Design-fidelity requests ("feature exists but doesn't match design"):** almost always a scope ambiguity, not a styling task — what exists is usually only PART of the design. After the diff-vs-codebase step, explicitly fork the direction: (A) restyle what exists; (B) build the missing structure the design shows (modal shell, extra column, entry point); (C) wrong screen — the design belongs to another flow. Put all three in the STOP question (small ASCII previews help); do NOT default to (A). Blast radii differ by an order of magnitude.

**Subagent option (when the Start prompt includes a multi-dim SUBAGENT_DIRECTIVE — panel "Subagents" checkbox 1-10, OR you judge the change spans enough dimensions to warrant parallel coverage):** spawn N read-only `Agent` subagents (subagent_type `general-purpose` or `Explore`), one per relevant dimension round-robin (functional/architecture/data/performance/security/backward-compat/UX/maintenance/operational/business). Each subagent gets a self-contained briefing (it does NOT see this conversation) — feature idea + files in scope + its assigned dimension + "return assessment + risk + alternative". Synthesize their outputs into the impact analysis above (dimensions covered → touch map / risks / alternatives). Read-only: subagents must NOT write code (no worktree isolation); for code-write delegation use `worker-start` at Phase 4.

**Dedicated Phase 0 agent (optional, for structured analysis):** if you want a single consolidated impact-analysis pass (instead of N round-robin subagents), dispatch the `phase0-impact-analyst` agent (subagent_type=`phase0-impact-analyst`, color blue). Brief it with: feature idea + files in scope + codebase context you already know. It returns the populated 5-section template (problem framing / touch map / second-order effects / alternatives / risks) as markdown — paste into chat, then STOP for approval (non-autonomous) or pick direction (autonomous). Read-only; does NOT write code or mutate state. **Force-on contract:** `Phase 0 analyst: ON.` token makes this dispatch MANDATORY (even for small changes that would otherwise skip it) — see Token Contract Table.

**Autonomous mode:** if the user enabled Autonomous (the Start prompt says "Autonomous mode"), do NOT stop at Phase 0 for direction approval. Still produce the impact analysis (you need the touch map and risks), pick the best direction yourself, and proceed to Phase 1. **"Proceed" means continue to Phase 1 and Phase 2 (brainstorm) — it does NOT mean skip them.** Brainstorm still runs in autonomous (you self-answer its questions). Only stop if you hit a true blocker you can't resolve.

**Rationale:** a Linear issue + worktree on the wrong direction is wasted infra + noisy history.

---

### Phase 1: Bridge 5 — Linear Issue Creation (Full + Standard tiers; Quick-fix skips)

**When:** User provides feature idea, before brainstorming.

**Preflight (resolve team + project — never hardcode):** Linear team and project are project-specific, so discover them before `orca linear create`. Check in this order:
1. `.claude/discovery-config.json` keys `linearTeam` and `linearProject` (preferred — same pattern RSA pipeline uses).
2. Ask the user once, persist to `discovery-config.json` for next time.

```bash
TEAM=$(jq -r '.linearTeam // empty' .claude/discovery-config.json 2>/dev/null)
PROJECT=$(jq -r '.linearProject // empty' .claude/discovery-config.json 2>/dev/null)
if [ -z "$TEAM" ] || [ -z "$PROJECT" ]; then
  echo "STOP: linearTeam/linearProject missing in .claude/discovery-config.json. Tell me which Linear team+project, and I'll persist them for next runs."
  return 1  # resolve in chat, then retry Phase 1
fi
```

Then create the issue with discovered values (NOT hardcoded `--team MY --project "orca"`):

```bash
FEATURE_TITLE="<feature description from user>"
ISSUE=$(orca linear create \
  --title "$FEATURE_TITLE" --team "$TEAM" --project "$PROJECT" \
  --json | jq -r '.result.issue.identifier')
orca linear status set $ISSUE --to "In Progress" --json
orca linear label add $ISSUE --label Feature --json
echo "Linear issue created: $ISSUE"
```

**Next:** proceed to Phase 2 (brainstorm).

---

### Phase 2: Brainstorm + Worktree (MANDATORY — brainstorm never skipped, any mode)

**Brainstorm is MANDATORY in both modes.** Do NOT write the spec yourself from the Phase 0 analysis — Phase 0 is impact analysis, the brainstorm skill produces the spec. They are sequential, not interchangeable.

**Action:** invoke `superpowers:brainstorming` with the feature idea + Phase 0 output. The brainstorm skill re-examines the problem from a holistic angle (the big picture), surfaces scope, edge cases, and clarifying questions you might have missed in Phase 0, and produces `docs/superpowers/specs/<date>-<feature>-design.md`.

**Mode handling at brainstorm:**
- **Non-autonomous:** the brainstorm skill asks the user clarifying questions — answer them collaboratively, the user owns scope decisions.
- **Autonomous:** brainstorm STILL RUNS — the agent self-answers the brainstorm's clarifying questions on the user's behalf (using Phase 0 + codebase context), then produces the spec. The point of brainstorm in autonomous is to **re-examine the problem holistically before committing**, not to get user sign-off. Skipping brainstorm in autonomous is a violation — you lose the holistic re-examination that catches Phase 0 blind spots.

**Anti-pattern (do not do this):** writing `Status: Approved (autonomous self-review passed)` in a spec you authored yourself without invoking the brainstorm skill. That skips the holistic re-examination and is the exact bug this rule prevents.

**Template-pick heuristic (7-section vs Epic) — apply at the end of brainstorm, before writing the plan:** count sub-features using these counting rules, not vibes:
- A **sub-feature** = a cohesive unit that could ship and prove value on its own (its own entry point, own user-facing outcome). "Tags + theme + static-gen for a blog" = 3 sub-features; "blog list + blog detail" = 1 sub-feature (same entry point family).
- A **task** = one plan-template task line (a single coherent change). Count AFTER decomposition, not before.
- **Pick Epic** when: >3 sub-features, OR >10 tasks post-decomposition, OR the feature spans >1 team/module boundary, OR a sub-feature has its own 5+ step sub-plan.
- **Pick 7-section** otherwise.
- **Ambiguity fallback:** if you cannot confidently count sub-features (the boundaries feel forced), default to 7-section and flag "may decompose at Phase 4 if implementation reveals true boundaries" — DO NOT force Epic on unclear scope (Epic overhead on a simple feature wastes a decomposition layer). If after starting Phase 4 it's clearly Epic-scale, STOP and re-plan as Epic.

**Brainstorm question mandate (this is when the AI asks to understand):** brainstorm is not decorative — it is the moment to resolve every unknown. If anything across the 6 plan-template sections below is unclear, unverified, or assumed, the agent MUST ask the user (one question at a time, per the brainstorm skill). "Anything you don't know, you must ask." Concretely, the brainstorm questions must clarify:

| Plan section | Brainstorm must clarify |
|--------------|-------------------------|
| 0. Root cause analysis | WHY the problem exists (5 Whys if needed); current state + pain points + frequency/impact; what the feature changes; constraints/hardships; high-level strategy (automation vs manual, split vs big-bang, wrap vs rewrite) — strategy here, tactics in Design |
| 1. Problem | Real problem vs proposed solution; who/when affected |
| 2. Scope | In/out boundaries; observable success criteria |
| 3. Touch map | Existing features touched; API/DB/config surfaces |
| 4. Design | 2-3 approaches + trade-offs; edge cases; non-functional (perf/security/a11y/i18n) |
| 5. Impl outline | Test strategy; file placement per codebase conventions |
| 6. Risks | Unverified assumptions; what must be probed/read first |

Skipping a question because "I can probably figure it out" is a violation. In autonomous mode the agent self-answers these questions (still must surface them); in non-autonomous the agent asks the user.

**Plan Template — MANDATORY Phase 3 Read:** the full 7-section + Epic templates live in `plan-templates.md` (same directory as this SKILL.md). **Phase 3 MUST Read that file before writing the plan** — do not write a plan from memory. Pick 7-section (default) or Epic per the Phase 2 Template-pick heuristic. Write the populated plan to `docs/superpowers/plans/<date>-<feature>-plan.md` + the Linear issue body. For Epic scope, the brainstorm must also surface: (a) should this decompose? (b) sub-features + boundaries? (c) dep graph? (d) cross-cutting concerns? — decomposition wrong = entire epic wastes effort.

**After spec produced + (in non-autonomous) user approves spec →** create worktree:

```bash
SPEC_PATH="<path-to-spec-file>"
FEATURE_SLUG=$(basename "$SPEC_PATH" .md | sed 's/^[0-9-]*//')

# Option A — workspace only (you implement this session)
orca worktree create --name "$FEATURE_SLUG" --linear-issue "$ISSUE" --no-parent --json

# Option B — AUTONOMOUS: spawn an agent that implements immediately.
# Use when goal is "do this for me"; plan steps make a great --prompt.
orca worktree create --name "$FEATURE_SLUG" --linear-issue "$ISSUE" \
  --agent claude --prompt "$(cat docs/superpowers/plans/<plan>.md)" --no-parent --json

# Output envelope: .result.worktree.id (NOT worktreeId — that's on terminal objects)
```

**From here, prefer `--current`** for every Linear call — once the worktree links `$ISSUE`, `--current` resolves it; stop tracking the id by hand.

**Spec-critic gate (optional but recommended, MANDATORY in autonomous):** before Phase 3, dispatch the `spec-critic` agent (subagent_type=`spec-critic`, color purple). Brief it with: spec.md content + original feature request + Phase 0 impact analysis. It returns P0/P1/P2 critique (ambiguity, missing edge cases, untested assumptions, scope creep, unverifiable criteria). On FIX-P0-FIRST / REWORK-SPEC → re-open the Phase 2 question per `rollback-fixer` spec-wrong playbook, revise spec, re-critique. **Rework cap: 2 cycles** — on the 3rd critique of the same spec, STOP and summarize the recurring critique + what changed each round, and ask the user (do not loop critique→rework past 2). On PROCEED → Phase 3. In autonomous mode this gate is MANDATORY (no user reviewed the spec). For trivial single-file specs, skip. **Force-on contract:** `Spec critic: ON.` token (see Token Contract Table).

**Re-arm on scope expansion:** if the user materially expands scope AFTER this gate passed (e.g., adds backend wiring to a visual-only task), re-run spec-critic on the revised spec — the earlier PROCEED covered only the old surface. (Observed DMP-1819: the expanded spec carried a P0-incoherent data path that only the re-critique caught.)

**Next:** proceed to Phase 3 (plan + task DAG).

---

### Phase 3: Plan + Task DAG (plan-writing is MANDATORY; task DAG conditional)

**Step 1 — Write the plan (MANDATORY, both modes):** invoke `writing-plans-linear` with the spec path. This publishes the plan to the Linear issue (`docs/superpowers/plans/<date>-<feature>-plan.md` + Linear body). Plan-writing is not optional and not buried — it is its own phase step.

**Step 2 — Task DAG (conditional):** only if plan has 5+ steps OR compaction is expected. For 1-4 step plans, skip the DAG and use TodoWrite.

```bash
PLAN_PATH="<path-to-plan-file>"
TASK_COUNT=$(grep -c "^### Task [0-9]" "$PLAN_PATH")

if [ "$TASK_COUNT" -ge 5 ]; then
    RUN=$(orca orchestration run-create --objective "$ISSUE: <feature>" --json \
          | jq -r '.result.run.id')

    TASK_1=$(orca orchestration task-create \
      --task-title "<Task 1 title>" --spec "$ISSUE: <Task 1 description>" \
      --run "$RUN" --json | jq -r '.result.task.id')

    TASK_2=$(orca orchestration task-create \
      --task-title "<Task 2 title>" --spec "$ISSUE: <Task 2 description>" \
      --deps '["'"$TASK_1"'"]' --run "$RUN" --json | jq -r '.result.task.id')

    # Continue for all tasks, chaining deps (cap depth at 4)...
    echo "Created $TASK_COUNT tasks in Run $RUN"
else
    echo "Plan has $TASK_COUNT tasks (< 5), skipping Bridge 3"
fi
```

**Plan-critic gate (optional but recommended when DAG has 5+ tasks, MANDATORY in autonomous):** before Phase 4, dispatch the `plan-critic` agent (subagent_type=`plan-critic`, color green). Brief it with: plan.md content + task DAG (IDs + titles + deps) + spec.md + Phase 0 touch map. It returns P0/P1/P2 critique (missing tasks, wrong dep edges, cap-4 violations, wrong granularity, spec-coverage gaps). On FIX-P0-FIRST / REWORK-PLAN → revise plan/DAG via writing-plans-linear, re-critique. **Rework cap: 2 cycles** — on the 3rd critique of the same plan, STOP and summarize the recurring critique + what changed each round, and ask the user. On PROCEED → Phase 4. For plans with <5 tasks, skip (no DAG to review). **Force-on contract:** `Plan critic: ON.` token (see Token Contract Table).

**Next:** offer execution choice (delegate via Orca `worker-start` for parallel/isolated tasks, or execute inline).

---

### Phase 4: Bridge 2 — Gates at Checkpoints (BROWSER VERIFY sau mỗi nhóm task — Rule 0)

**Execution role:** each Phase 4 task is EXECUTED by the **`task-executor` agent** (green) — dispatch with: task spec slice + spec/plan paths + worktree + boundary + commit convention + orca task ID. It returns DONE (commit hash + files + tests) or BLOCKED (symptom + tried + need). The coordinator (you) keeps: dispatch, gates, Linear sync, next-task routing. Do not implement inline unless the task is trivial (single-file Quick-fix tier).

**Coordinator enforcement (loop caps are YOURS, not the executor's):**
- **Attempt ledger** — you track attempts per task. Every re-dispatch briefing carries: *"attempt K/3 — previous symptom: X, tried: Y. Do NOT repeat Y."* Never trust the executor's own count (context pressure makes it forget). At attempt 3 → STOP, escalate per Loop caps below.
- **Budget line** — every dispatch briefing carries: *"Budget: ~15 min / ~40 tool-calls. Not done → report BLOCKED with progress made; do not grind."*
- **DONE evidence check** — accept a DONE only after verifying: (1) commit hash exists in `git log`, (2) message matches the repo convention, (3) changed files ⊆ task boundary (`git show --name-only <hash>`). Any mismatch → treat as BLOCKED, re-dispatch per ledger. A DONE without evidence is not a DONE.

**Commit rule (per task):** each task = one atomic commit. Stage only the files the task touched (never `git add -A` / `git add .` — they sweep up secrets, lockfiles, unrelated drift). Commit message format: `<type>(<scope>): <imperative summary>` (e.g. `feat(orders): add return reason field`) — follow the repo's existing convention if it differs. Do NOT skip pre-commit hooks (`--no-verify`); if a hook fails, fix the root cause, then commit again. Commits are the rollback unit (see Rollback Ritual) — keep them surgical and reviewable.

**Test rule (before gate):** before requesting gate approval on a task, run the repo's test suite for the touched surface — **at minimum the unit tests for files you changed**, plus any integration test that exercises the new code path. Report what you ran + pass/fail in the gate question. If the repo has no tests for the surface, say so explicitly ("no existing test coverage for X; manually verified Y") rather than implying green. Coverage is a goal, not a gate — don't block a task for missing coverage, but do flag it.

**Code-review between tasks (optional but recommended for non-trivial tasks, MANDATORY in autonomous):** before resolving the gate as approved, dispatch the `code-reviewer` agent (subagent_type=`code-reviewer`, color cyan). Brief it with: task ID + title + spec slice + `git diff <base>..<head>` + files modified + codebase conventions. It returns P0/P1/P2 review (bugs, security, style, missing error handling, untested paths, surgical-scope violations). On CHANGES-REQUESTED → dispatch a fix task via `worker-start`; do NOT resolve gate approved. On REJECT-AND-REVERT → call `rollback-fixer`. On APPROVED → resolve gate. For Quick-fix single-line changes, skip. If OWASP surface → escalate to `security-audit` (P5) instead. This is the "review-only worker" the worker-patterns.md mentions — now a dedicated agent. **Force-on contract:** `Code review: ON.` token makes code-reviewer run before EVERY task gate resolution regardless of mode or task size (including Quick-fix tasks) — see Token Contract Table.

**Rolling review theo nhóm (learned 2026-08-28 FI-190, từ bài học FI-187):** SF nhiều tasks (≥8) KHÔNG dồn 1 review lớn cuối — chia tasks theo nhóm 4-5 cùng đường (ví dụ nhóm watchdog-path, nhóm fusion-path) và dispatch code-reviewer ĐỘC LẬP trên diff nhóm đó ngay khi nhóm xong, song song với việc executor làm nhóm kế (khác file). Reviewer chỉ soi commit list cố định của nhóm (qua `git show <hash>`, không đọc working tree — chống lẫn commit nhóm đang chạy). Fix theo verdict từng nhóm trước khi merge; đừng để agent đứng chờ 30+ phút một review khổng lồ.

**When:** Verification checkpoint reached (as defined in plan). **Precondition:** an Orca `taskId` exists (from Bridge 3); if not, fall back to chat approval.

```bash
TASK_ID="<current-orca-task-id>"
GATE_ID=$(orca orchestration gate-create \
  --task "$TASK_ID" --question "<Verification question>" \
  --options '["approved","changes_requested","rejected"]' \
  --json | jq -r '.result.gate.id')
# Verified 2026-07-09: gate-create returns .result.gate.id (singular).
# Top-level `id` is the REQUEST id — do not capture that.
# Recover a lost id via `gate-list --task <taskId>` (returns .result.gates[]).

# Wait for chat reply. When user says "approved":
orca orchestration gate-resolve --id "$GATE_ID" --resolution approved --json
# If "changes_requested", create follow-up task.
```

**Next:** mark task completed, move to next task.

**Autonomous mode:** if enabled (Start prompt says "Autonomous mode"), do NOT wait for chat approval at gates. Self-verify the task against its acceptance criteria per Principle 3 (Autonomous Self-Review checklist — not a rubber-stamp), then self-approve (`gate-resolve ... --resolution approved`) and continue.

**Escape hatch (both modes) — no infinite verification loops:** if verification fails twice on the same task with the same root cause, STOP retrying. Summarize what's failing + what you tried + ask the user. Do not loop "fix → verify → fail → fix" indefinitely — 2 failures means the cause isn't what you're patching. Applies to build failures, visual verification, test failures, any verify step.

**Loop caps (all follow the same shape: max N → STOP + summarize + ask user — do NOT keep looping):**
- **Task retry cap (3):** a single Phase 4 task may be retried at most 3 times, regardless of root cause. The verify-loop escape hatch above catches repeated *same-cause* failures; this cap catches the *different-cause* failure mode (fail A → fix → fail B → fix → fail C) where each failure looks novel but the task is clearly not converging. On the 4th attempt → STOP. Summarize: the task, each attempt's symptom + fix tried, why none converged. Ask the user how to proceed (different approach, escalate, or descope).
- **Gate-resolve cap (3):** if a single gate is `rejected` 3 times, STOP re-submitting. Summarize: the gate, each rejection reason, what you changed each time, why the reviewer keeps rejecting. Ask the user — do not loop "submit → reject → patch → submit" past 3. Repeated rejection usually means you're not understanding the feedback, not that the next patch will fix it.

---

### Phase 5: Final Verify (BROWSER WALKTHROUGH BẮT BUỘC — Rule 0) Bridge 5 — Final Sync

**When:** All tasks completed, final gate approved.

```bash
# Publish plan/spec body so the team sees it (create-or-update).
# (CLI descriptions ARE editable — old "uneditable" assumption was wrong.)
orca linear save-issue --current --body-file docs/superpowers/plans/<plan>.md --json
orca linear status set --current --to "Done" --json

# Label step ONLY if "review-approved" exists in the team's workspace.
# Team MY has ZERO labels by default (verified 2026-07-08) — create it in
# the Linear UI once, then run the line below; otherwise omit it.
orca linear label add --current --label "review-approved" --json
```

**`save-issue` false negative:** it can return `ok:false` with error `linear_write_unconfirmed` while the write DID apply — check the issue body (`orca linear issue --current --json | jq -r '.result.issue.description'`) before retrying; a blind retry overwrites.

**Independent verifier (MANDATORY before "Workflow complete", both modes):** spawn the `verification` agent (subagent_type="verification") on the changed files. Pass: original task description + files changed + approach taken. It must return PASS before you declare the workflow done. **This is always MANDATORY**; the `Verifier: ON.` token is an explicit re-affirm — redundant but visible (see Token Contract Table).
- **PASS** → proceed to "Workflow complete".
- **PARTIAL** → report what passed / what could not be verified, ask the user.
- **FAIL** → do NOT declare done. Resume the fix loop (subject to the Phase 4 task-retry cap of 3).
- Your own self-checks and a fork's self-checks do NOT substitute — only the independent verifier assigns a verdict. (Per memory `self-test-can-prove-negative-but-not-positive`.)

**Security review (CONDITIONAL — when the change touches user input, auth, secrets, external APIs, or new dependencies):** spawn the `security-audit` agent on the diff before the verifier. OWASP-top-10 surface = unconditional trigger (XSS, SQLi, command injection, auth bypass, secret leakage). If it surfaces a real finding → fix before verifier (do NOT declare done on a known vuln). Non-trigger changes (refactor, docs, pure logic with no I/O) may skip this. **Force-on contract:** `Security audit: ON.` token runs security-audit unconditionally regardless of OWASP auto-detection — see Token Contract Table.

**Workflow complete** — offer next steps (PR, review, etc.).

**Post-task ritual (skill self-improvement):** after workflow complete, invoke the `post-task-ritual` skill. This is the deliberate learning step (distinct from Principle 6, which is the in-flight flag — that one stays safe; this one is the intentional, end-of-task update). The skill defines the 6 steps (problems → solutions → patterns → which skill to update → update → clear log). Our workflow-specific overlay on top of the ritual:
1. **Read `docs/superpowers/improvements-log.md` first** (if it exists) — these are the in-flight gaps Principle 6 flagged during this run. They take priority (already-identified issues) over new learning.
2. When the ritual asks "which skill to update", consider: this SKILL.md, a downstream skill (brainstorming/writing-plans-linear), the Orca orchestration layer, or framework docs.
3. Cover BOTH the Principle 6 flagged gaps AND new learning from this task in the update.

Do NOT skip just because the task felt routine (routine tasks hide the most useful patterns).

---

## Delegation & Worker Lifecycle

**Pick the right mechanism (quick reference):**
- Task writes code (implement/fix/execute) → dispatch the **`task-executor` agent** (subagent_type=`task-executor`, color green) — the dedicated EXECUTE role; it reads the spec slice, implements, tests, commits atomically, reports DONE/BLOCKED
- Task mutates Orca/Linear state (issues, worktrees, DAG) → coordinator does it via `orca` CLI directly (or `worker-start` when worker isolation is wanted)
- Task only reads + reasons + returns text (analysis) → Agent tool (built-in subagent)
- Unsure or small single-file → inline (you do it)

**Rule of thumb:** `task-executor` for code writes; Agent tool for analysis (no isolation); inline when briefing cost > doing it. Never let the coordinator's own context carry implementation work — that's what task-executor exists to absorb.

**`Execute mode:` token contract:** the Start prompt may carry `Execute mode: delegate|inline|superpowers` (see Token Contract Table). These override the decision above for the whole run.

**Full delegation reference (decision table, single-worker dispatch, multi-agent topology, retry, multi-server, worker-side reporting, worker lifecycle cleanup table):** read `worker-patterns.md` in this skill's directory when Phase 4 dispatches work. That file holds the bash patterns + lifecycle commands; this SKILL.md keeps only the routing rule above.

---

## Rollback Ritual (when something breaks mid-workflow)

Per Phase 4 task-retry cap + gate-resolve cap, when you hit a STOP or a task clearly diverged, **recover to the last known-good state before retrying or escalating.** Do not pile a "fix" on top of a broken half-change.

**Dedicated rollback agent:** for non-trivial rollbacks (multi-commit revert, orphan Linear/Orca state cleanup, Orca state reset), dispatch the `rollback-fixer` agent (subagent_type=`rollback-fixer`, color yellow). Brief it with: what broke + which Phase/task + last-green commit hash + files/state involved + what was tried. It reverts safely (prefer `git revert`), confirms with user before destructive ops (`reset --hard`, `reset --all`, force-push), preserves audit trail (Linear comment), and respects loop caps (task-retry 3 / gate-resolve 3 / verify-fail 2). For Quick-fix single-commit reverts, do it inline — overkill to dispatch. **Force-on contract:** `Rollback fixer: ON.` token dispatches `rollback-fixer` for ANY rollback (including single-commit Quick-fix reverts); default behavior (inline for small) is overridden — see Token Contract Table.

- **Per-task granularity:** each Phase 4 task should be a single commit (or a small atomic group) so rollback = revert one commit, not reconstruct work. Commit hash goes in the audit log (Principle 7) — that's your checkpoint.
- **Task diverged / verify-fail loop hit:** revert the task's commits and re-approach from the last green state.
  ```bash
  git log --oneline -5              # find the last green commit
  git revert <bad-commit>           # preferred — preserves history + audit trail
  # only use `git reset --hard <commit>` if the change was never pushed/committed AND you have the user's explicit OK (destructive)
  ```
- **Spec wrong after brainstorm (Phase 2) discovered at Phase 3+:** do NOT silently rewrite the spec mid-execute. STOP, re-open the Phase 2 question that was missed, update the spec, then resume. The spec is the contract — if it's wrong, the whole plan is suspect.
- **Linear/Orca state created for an abandoned direction:** if a worktree/run/task was created for a direction you've since abandoned, mark it (don't delete — audit trail): set Linear issue to `Canceled` or comment why; resolve the Orca run as abandoned. Do not leave orphan state that confuses the next resume.
- **Reset orchestration state (scoped):** when Orca state itself is the mess (stuck tasks, stale messages, orphan run) and per-item cleanup isn't enough, `orca orchestration reset (--all | --tasks | --messages) --json` resets one explicit scope. Prefer the narrowest scope (`--tasks` or `--messages`) before `--all`; `--all` is destructive and re-runs setup. Confirm with the user before `--all` (it wipes the run's state machine).
- **Ask before destructive rollback:** `git reset --hard`, force-push, dropping DB migrations, deleting worktrees — these are irreversible. Per system rule, confirm with the user first unless they pre-authorized it. `git revert` is safe-by-default (additive); prefer it.

## Fallback Behavior

**Orca CLI failure:** if Orca CLI is unavailable or commands fail: continue with the superpowers workflow without bridges, inform the user ("Bridge X unavailable, continuing..."), and note which bridge failed for later debugging.

**Skill-invoke failure (graceful degradation per phase):** if a delegated skill cannot be invoked (not installed, renamed, returns an error, or the skill loader reports it unknown) — do NOT silently fall back to "I'll just do it myself" for MANDATORY-skill phases. The MANDATORY skills exist to catch specific failure modes (brainstorming = holistic re-examination; writing-plans-linear = structured plan). Falling back silently loses that coverage. Instead:
- **Phase 2 brainstorming unavailable:** STOP. Tell the user the skill is missing and that proceeding inline skips holistic re-examination (per Principle 5, flag don't silently act). Ask whether to (a) install/fix the skill and retry, or (b) proceed inline with an explicit user-acknowledged risk flag. Autonomous mode does NOT authorize this fallback — brainstorming STILL RUNS rule (line 312) binds.
- **Phase 3 writing-plans-linear unavailable:** STOP. Same pattern — the skill structures the plan; inline risks skipping sections. Ask the user.
- **Phase 4 superpowers:executing-plans unavailable (only when user picked superpowers execute-mode):** this is NOT mandatory (delegate/inline are valid alternatives). Inform the user the chosen execute-mode is unavailable, fall back to the default delegate table for this run, and note it in the audit log. Do NOT keep retrying the missing skill.
- **Figma Principle 8 skills (image-to-code/gpt-taste/design-taste-frontend) unavailable:** these are conditional (only fire on figma.com URL). Skip the affected step, inform the user which verification step was skipped, and proceed — the workflow can complete without UX polish, just flag the gap in the audit log.

General rule: a MANDATORY skill going missing is a STOP + ask (Phase 2, Phase 3); a CONDITIONAL skill going missing is a skip + flag (Figma steps, executing-plans when not the only option).

This skill wraps the standard superpowers skills (brainstorming, writing-plans-linear) + Orca orchestration (execute via inline or `worker-start`, gate via `gate-create`) — adding bridge invocations at transitions and speaking the worker-side lifecycle when dispatched. No modifications to superpowers required.
