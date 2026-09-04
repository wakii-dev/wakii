---
name: brainstorm
description: >-
  Brainstorm a feature idea into a validated spec + implementation plan,
  then optionally publish to Linear and set up a worktree.
  Triggered by /brainstorm.
---

# /brainstorm

Turn an idea into a spec + plan. Optionally publish to Linear + create worktree.

**Announce:** "Using /brainstorm — explore idea → spec → plan → optionally Linear."

## Configuration

Read Linear defaults from `.claude/env.md` in project root. Look for these values:

```
linear:
  team: MY
  project: orca
```

If env.md missing or no linear config found, ask user for team/project at the gate.

---

## Flow

```
/brainstorm "idea"
    ↓
[Phase 1] Brainstorming → spec file → user approve
    ↓
[Phase 2] Writing plan → plan file (Linear-ready format)
    ↓
[Rethink] Subagent verify → PASS / CONCERNS → fix nếu cần
    ↓
[Gate] "Publish lên Linear?"
  [Không] → Done
  [Có]   → hỏi worktree preference
         → tạo issue (description = plan + worktree info)
         → tạo worktree linked to issue (nếu chọn tạo mới)
    ↓
Done.
```

---

## Phase 1: Brainstorming

### 1. Explore project context
**PHẢI đọc thực tế, KHÔNG được giả định:**
- Đọc files liên quan (HTML, JS, CSS, config)
- Đọc git log gần đây
- Hiểu architecture hiện tại (tech stack, patterns, conventions)
- Xác định: cái gì đã có, cái gì chưa có, cái gì đang hoạt động thế nào
- Nếu không chắc về behavior → đọc code, không đoán

**Sử dụng `codegraph` để khám phá codebase:**

```bash
# Init (chạy 1 lần nếu project chưa có .codegraph/)
codegraph init

# Xem file structure
codegraph files

# Tìm symbols liên quan đến feature
codegraph query "<keyword>"

# Explore 1 vùng code — xem source + call paths
codegraph explore "<area description>"

# Xem 1 symbol cụ thể — source + callers/callees
codegraph node "<function-or-class-name>"

# Xem impact nếu thay đổi 1 symbol
codegraph impact "<symbol>"
```

Dùng codegraph để hiểu nhanh codebase trước khi hỏi questions hoặc propose approach. Đặc biệt hữu ích cho project lớn hoặc unfamiliar.

### 2. Ask clarifying questions
One per message. Multiple choice preferred. Focus: purpose, constraints, success criteria.

### 3. Propose 2-3 approaches
Trade-offs + recommendation.

### 4. Present design
Section by section, confirm with user.

### 5. Write spec

Save to `docs/superpowers/specs/YYYY-MM-DD-<topic>.md`:

```markdown
# <Feature title>

**Slug:** <kebab-case>
**Created:** YYYY-MM-DD

## Goal
<1-2 sentences>

## Context
<current state, why this feature>

## Scope
<what's included>

## Non-goals
<what's excluded>

## Design
<approach chosen>

## Acceptance Criteria
- [ ] ...
```

Commit: `git commit -am "spec: <topic>"`

### 6. Self-review
Fix placeholders, contradictions, ambiguity inline.

### 7. User review
> "Spec tại `<path>`. Review — có muốn thay đổi gì không?"

Proceed only after approved.

---

## Phase 2: Writing Plan

Write plan using the **same format that will appear on Linear**. One format, one source of truth.

Reference template: `templates/linear-issue-description.md` (in skill directory).

Save to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`:

```markdown
# <Feature Title>

**Slug:** <kebab-case> · **Estimate:** ~Xh

---

## Problem

**Before:** <trạng thái hiện tại — 1-2 câu>

**After:** <trạng thái mong muốn — 1-2 câu>

**Why:** <gap cần giải quyết>

---

## Approach

<Architecture đã chọn + lý do. Key trade-offs. 2-5 câu.>

## File Structure

| File | Action | Role |
|------|--------|------|
| `path/to/file` | create/modify | responsibility |

---

## Tasks

### 1. <title> (~Xh)

`file1` · `file2`

**Step 1: <action>**

```lang
<complete code — copy-paste ready>
```

**Step 2: <action>**

```lang
<complete code>
```

**Verify:** <expected result>

```bash
git commit -am "feat(scope): message"
```

---

### 2. <title> (~Xh)

`file`

**Step 1: <action>**

```lang
<complete code>
```

**Verify:** <expected result>

```bash
git commit -am "feat(scope): message"
```

---

## Done When

- [ ] <acceptance criterion 1>
- [ ] <acceptance criterion 2>

## Out of Scope

- <điều không làm>
```

### Plan principles
- Self-contained tasks — dev đọc plan đủ để implement, không cần mở thêm gì
- Code snippets hoàn chỉnh, copy-paste ready
- Minimum task: ≥ 1h work, 100-200 LOC
- DRY, YAGNI, frequent commits

Commit: `git commit -am "plan: <topic>"`

---

## Rethink: Subagent Verify

Sau khi plan written, spawn subagent chạy background để rethink + reverify.

**Subagent KHÔNG trust main agent** — nó verify independently từ đầu.

### Subagent task:

```
Bạn là reviewer agent. Đọc spec + plan + codebase INDEPENDENTLY.
Không tin kết luận của main agent. Tự verify mọi thứ.

1. RETHINK approach:
   - Approach trong plan có phải tối ưu nhất cho codebase này?
   - Có approach nào tốt hơn bị miss?
   - Có edge case nào plan chưa handle?
   - Task ordering có hợp lý? Có dependency ngược?

2. REVERIFY code correctness:
   - Đọc từng file được reference → confirm tồn tại + đúng structure
   - Code snippets trong plan có đúng syntax?
   - Function/class/variable names có match codebase thực tế?
   - Line numbers có chính xác? (dùng codegraph nếu cần)
   - Nếu follow plan step-by-step, result có đúng acceptance criteria?

3. REVERIFY feasibility:
   - Code khi paste vào codebase có conflict với existing code?
   - Có side effects nào plan chưa mention?
   - Có missing imports, missing dependencies?

4. OUTPUT:
   - PASS: plan is correct, no concerns
   - CONCERNS: list từng issue cụ thể + suggest fix
```

### Cách chạy:

Agent chính spawn subagent với context:
- Spec file path
- Plan file path
- Project root path

### Xử lý result:

- **PASS** → continue to Gate
- **CONCERNS** → main agent đọc concerns, fix plan, commit lại. Không cần re-run rethink (1 lần đủ).

### Khi nào SKIP rethink:

- Plan ≤ 2 tasks (quá nhỏ, overhead > value)
- User nói "skip review" / "nhanh đi"

---

## Gate: Publish to Linear?

After plan written, ask:

> "Plan xong ✓ Publish lên Linear không? (có/không)"

### [Không] → Done. Summarize and exit.

### [Có] → Hỏi worktree, tạo issue, tạo worktree.

---

**Step 1: Hỏi worktree preference:**

> "Worktree cho issue này?"
> - **a) Tạo mới** — isolated branch
> - **b) Dùng worktree hiện tại**
> - **c) Skip**

Ghi nhớ choice + slug. Chưa tạo worktree.

---

**Step 2: Tạo issue với plan + worktree info trong description:**

```bash
TEAM="MY"        # from .claude/env.md
PROJECT="orca"   # from .claude/env.md
SLUG="<kebab-case>"
PLAN_PATH="docs/superpowers/plans/YYYY-MM-DD-<topic>.md"

# Build issue body: plan content (skip title line) + worktree section
# Title đã hiển thị trên Linear issue, không cần lặp trong description
sed '1d' "$PLAN_PATH" > /tmp/linear-issue-body.md

# Append worktree info
if [ "$CHOICE" = "a" ]; then
  printf "\n---\n\n## Worktree\n\n**Branch:** \`%s\`\n**Base:** \`main\`\n" "$SLUG" >> /tmp/linear-issue-body.md
elif [ "$CHOICE" = "b" ]; then
  printf "\n---\n\n## Worktree\n\n**Branch:** current worktree\n" >> /tmp/linear-issue-body.md
fi

ISSUE=$(orca linear create \
  --title "<feature title>" \
  --team "$TEAM" \
  --project "$PROJECT" \
  --assignee me \
  --label Feature \
  --priority medium \
  --estimate <number from plan Estimate header, e.g. 2 for ~2h> \
  --body-file /tmp/linear-issue-body.md \
  --json | jq -r '.result.issue.identifier')

rm /tmp/linear-issue-body.md
```

Report: "Created $ISSUE trên Linear."

---

**Step 3: Tạo worktree (nếu choice = a):**

Branch naming convention: `<prefix>/<ISSUE_ID>:<slug>`
- Prefix: `feat` (feature mới) hoặc `fix` (sửa lỗi)
- Vì /brainstorm mặc định là feature → prefix = `feat`

```bash
BRANCH_NAME="feat/${ISSUE}:${SLUG}"
# Ví dụ: feat/MY-128:i18n-toggle

orca worktree create \
  --name "$BRANCH_NAME" \
  --linear-issue "$ISSUE" \
  --no-parent \
  --json
```

Report: "Worktree `$SLUG` created, linked to $ISSUE."

Nếu choice = b: no action, code on current worktree.
Nếu choice = c: no worktree.

---

## Done

Summarize:

> **Summary:**
> - Spec: `<path>`
> - Plan: `<path>`
> - Linear: `$ISSUE` (or "none")
> - Worktree: `<name>` / existing / none
>
> Ready to execute.

---

## Rules

1. **No code until spec approved**
2. **One question per message**
3. **Respect "không"** — stop that branch immediately
4. **Plan file = Linear description** — same format, same content, one source of truth
5. **Self-contained** — dev reads plan (local or Linear) and implements without extra context
6. **Fallback** — if orca CLI fails, skip bridge, continue text-only
7. **READ BEFORE CLAIM** — Phải đọc file/code thực tế trước khi đưa ra bất kỳ nhận định nào về codebase. Không được giả định cấu trúc, logic, hay behavior mà chưa verify bằng cách đọc source code. Nếu chưa đọc → nói rõ "chưa verify" thay vì trình bày như fact.
8. **KHÔNG BỊA LOGIC** — Không được chế ra code pattern, API, function name, file structure mà không tồn tại trong project. Mọi code snippet trong plan phải dựa trên codebase thực tế đã đọc. Nếu không chắc → đọc lại hoặc hỏi user.
9. **VERIFY TRƯỚC KHI VIẾT PLAN** — Trước Phase 2 (writing plan), agent PHẢI đã đọc tất cả files liên quan. Plan không được chứa assumptions chưa verify. Line numbers, class names, function signatures phải chính xác từ source code hiện tại.
