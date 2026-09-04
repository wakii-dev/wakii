---
name: writing-plans-linear
description: >-
  Enhanced writing-plans with Linear subtask creation, semantic milestone grouping,
  progress synchronization, and multi-agent collaboration. Supports two modes:
  Write (file-only) for drafts, Publish (creates Linear subtasks + comments) for
  team visibility. Automatically detects current Linear issue and creates one
  subtask per milestone. Falls back to file writing if no Linear issue exists.
---

# Writing Plans with Linear Integration

**Enhanced writing-plans** — publishes implementation plans directly to Linear issues for team visibility.

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

**Key enhancement:** Plans are posted to the current Linear issue as comments, making them visible to the entire team. A local file backup is also created for reference.

**Announce at start:** "I'm using the writing-plans-linear skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are better reliability when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the code you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Task Scope Guidelines

### Minimum Task Size

Each task MUST represent at least **1 hour of work**. Tasks smaller than this should be merged into a larger cohesive task.

**Signs a task is too small:**
- Fewer than 4 steps
- Less than 50 lines of code
- Can be completed in < 30 minutes
- Covers only one thin slice (e.g., only CSS, only HTML) of a cohesive change

**Proper task size:**
- 4-8 main steps
- 100-200 lines of code
- 1-1.5 hours of work
- Represents substantial vertical progress (UI + behavior + tests)

### Example Split

❌ **Too small (3 separate tasks):**
- "Task 1: Add CSS variables"
- "Task 2: Add HTML toggle button"
- "Task 3: Add JS toggle logic"

✅ **Right size (1 task, all three combined):**
- "Task 1: Setup CSS Variables + Toggle UI + Persistence Logic"
  - Files: `index.html` (CSS + HTML + JS)
  - 6-8 steps, ~150 LOC, ~1.2 hours
  - Produces working, testable dark-mode toggle end-to-end

**Heuristic:** If two "tasks" cannot be tested independently (one is meaningless without the other), merge them.

## Self-Contained Subtask Format

When publishing to Linear, each subtask MUST be **self-contained** — the developer should be able to complete it from Linear alone, without opening the plan file or any external resource.

### REQUIRED in each subtask body

1. **Complete code snippets** — all CSS/JS/HTML inline in fenced code blocks
2. **Step-by-step instructions** — numbered steps with exact commands and file locations
3. **Test procedures** — expected results, verification steps, manual test cases

### FORBIDDEN in subtask body

- "See plan file for full code"
- "Reference: docs/specs/..."
- "See Task N for similar implementation"
- File attachments (use description text only)
- Links to external documentation as the primary instruction
- Code placeholders ("implement error handling here")

### ALLOWED in subtask body

- Full code in markdown code blocks (` ```css `, ` ```js `, ` ```html `)
- Complete copy-paste ready snippets
- All test steps inline with expected output
- Brief links to **reference docs** (not required reading)

### Self-containment test

Before publishing, run `bin/verify-subtask.sh <plan-file>` — it flags any subtask body containing forbidden phrases or missing code blocks.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Linear Issue:** [Linked issue identifier]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Linear Integration

### Auto-Detecting Current Linear Issue

> **Prefer `--current`** on every `orca linear ...` command — it resolves the active worktree's linked issue automatically, so you usually don't need the detection logic below at all. Use this section only when you must capture the id itself (e.g. to pass to a sub-process).

The skill automatically detects the current Linear issue from workflow context:

**Context Sources (in order of priority):**
1. **Current worktree** — Check if worktree has `linkedLinearIssue` (set by Bridge 1)
2. **Recent Bridge 5 output** — If workflow just created an issue, use that ISSUE_ID
3. **Manual fallback** — Ask user to provide Linear issue ID

```bash
# Auto-detect: Check current worktree first
WORKTREE_INFO=$(orca worktree list --json 2>/dev/null)
CURRENT_ISSUE=$(echo "$WORKTREE_INFO" | jq -r '.result.worktrees[] | select(.isActive == true) | .linkedLinearIssue' | head -1)

# If no active worktree with issue, check recent worktrees
if [ -z "$CURRENT_ISSUE" ]; then
    CURRENT_ISSUE=$(echo "$WORKTREE_INFO" | jq -r '.result.worktrees[] | select(.linkedLinearIssue != null) | .linkedLinearIssue' | head -1)
fi

# If still no issue, inform user and fallback to file-only
if [ -z "$CURRENT_ISSUE" ]; then
    echo "No Linear issue found. Plan will be saved to file only."
    FILE_ONLY_MODE=true
else
    echo "Found Linear issue: $CURRENT_ISSUE"
    FILE_ONLY_MODE=false
fi
```

### Posting Plan to Linear

**Method 1: Using `orca linear attach` (if plan is hosted)**

If the plan file is accessible via URL (e.g., in a GitHub repo):

```bash
# After committing plan to git
PLAN_URL="https://github.com/user/repo/blob/branch/docs/superpowers/plans/YYYY-MM-DD-feature.md"

orca linear attach --current --url "$PLAN_URL" --title "Implementation Plan" --json
```

**Method 2: Publish plan body into the issue (recommended for local work)**

`orca linear save-issue --current` is create-or-update, so you can write/replace the issue description with the plan body directly (verified 2026-08-01). The old claim that comments/descriptions were impossible via CLI was wrong.

```bash
# Publish (or replace) the plan as the issue body, from a file or stdin
orca linear save-issue --current --body-file docs/superpowers/plans/YYYY-MM-DD-feature.md --json
# or pipe a composed summary:
summary-body.md | orca linear save-issue --current --body-file - --json

# A comment (separate from the description) also works:
orca linear comment add --current --body-file plan-summary.md --json
```

**Method 3: Create Plan Sub-Task in Linear**

For better tracking, create a dedicated sub-task for the plan:

```bash
# This assumes orca linear subtask create exists
# If not, note in issue that plan is ready at file path
echo "Plan ready at: docs/superpowers/plans/YYYY-MM-DD-feature.md"
```

### Recommended Approach (What Actually Works)

Based on available Orca CLI commands (verified 2026-08-01):

1. **Write plan to local file** (always — source of truth)
2. **Publish the plan body into the issue** with `save-issue --current --body-file` (create-or-update; the issue body is editable via CLI)
3. **Optionally attach the plan URL** if the repo is hosted (`orca linear attach --current --url`)

**What does NOT exist:**
- `orca linear description update` / `linear edit` — there is no command by that name. But descriptions ARE editable: use **`orca linear save-issue --current --description "<text>"`** (or `--body-file -`) — `save-issue` is create-or-update (verified 2026-08-01). Prefer `--body-file -` (stdin) over `--body "$arg"` to avoid shell-escaping breaks.
- `orca linear subtask create` — Use `orca linear create --title ... --parent <parentId>` (or `--parent-current`) instead.

**Posting comments** (this DOES exist):
- `orca linear comment add --current --body-file -` — post a comment from stdin (preferred over `--body "$arg"`). `--current` resolves the worktree's linked issue.

**Actual workflow:**
```bash
# 1. Write plan to file
PLAN_FILE="docs/superpowers/plans/YYYY-MM-DD-<feature>.md"

# 2. Commit to git
git add "$PLAN_FILE"
git commit -m "plan: implementation plan for <feature>"

# 3. Publish the plan body into the linked Linear issue (--current resolves it)
orca linear save-issue --current --body-file "$PLAN_FILE" --json

# 4. If repo has remote/GitHub, ALSO attach the browsable plan URL
if git remote get-url origin > /dev/null 2>&1; then
    PLAN_URL=$(git remote get-url origin | sed 's|git@github.com:|https://github.com/|' | sed 's|\.git$||')/blob/main/$PLAN_FILE"
    orca linear attach --current --url "$PLAN_URL" --title "Implementation Plan" --json
fi
```

If `--current` cannot resolve an issue (no linked worktree), fall back to an explicit id: `save-issue MY-XX --body-file "$PLAN_FILE"`.

### Plan Summary Format for Linear

When referencing the plan in Linear (via attach, notes, or description), use this concise format:

```markdown
## 📋 Implementation Plan: [Feature Name]

**Status:** ✅ Ready to Execute
**Tasks:** [N] tasks | **Est. Complexity:** [Simple/Medium/Complex]
**Plan File:** `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

### 🎯 Goal
[One sentence describing what this builds]

### 🏗️ Architecture
[2-3 sentences about the technical approach]

### 📦 Task Breakdown
| # | Task | Description | Files |
|---|------|-------------|-------|
| 1 | [Task 1 title] | [1-line description] | `file1.js`, `file2.css` |
| 2 | [Task 2 title] | [1-line description] | `file3.js` |
| ... | ... | ... | ... |
| N | [Task N title] | [1-line description] | `fileX.js` |

### 🚀 Execution Options
- **Subagent-Driven:** Fresh subagent per task + review (recommended)
- **Inline:** Execute in session with checkpoints

See full plan file for detailed implementation steps with code examples.
```

**Key improvements:**
- **Table format** — Easier to scan task breakdown
- **Files column** — Shows which files each task touches
- **Status badge** — Clear visual indicator
- **Execution options** — Reminds reader how to implement

## Write vs Publish Mode

The skill operates in two modes:

### Write Mode (default)
- Triggered on first invocation
- Writes plan to file only
- NO Linear operations
- Purpose: Create draft for review

### Publish Mode
- Triggered after review approval OR explicit user command
- Creates Linear subtasks
- Posts plan summary comment
- Purpose: Make plan visible to team in Linear

### Mode Switching

| Trigger | Mode | Linear Operations |
|---------|------|-------------------|
| First invocation | Write | None (file only) |
| After reviewer approved | Publish | Create subtasks + post comment |
| User: "Publish to linear" | Publish | Create subtasks + post comment |
| User: "/orca-linear-publish" | Publish | Create subtasks + post comment |

## Orca Agent Collaboration Workflow

When multi-agent review is desired:

1. **Coordinator writes plan (Write mode)**
   - Skill auto-detects: no review yet
   - Write to file only, NO Linear operations

2. **Spawn reviewer terminal**
   ```bash
   orca terminal create --worktree active --command "claude" --title "plan-reviewer" --json
   ```

3. **Dispatch with lifecycle**
   ```bash
   orca orchestration dispatch --to h1 --from h0 --inject --json
   ```

4. **Wait for reviewer findings**
   ```bash
   orca orchestration check --terminal h0 --wait --types worker_done --json
   ```

5. **Address feedback → Publish**
   - After reviewer approved, switch to Publish mode
   - Create subtasks via `bin/publisher.sh`
   - Post plan summary comment

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- Each task ≥ 1 hour of work (merge thin-slice tasks)
- Linear subtasks are self-contained — full code inline, no "see plan file"
- DRY, YAGNI, TDD, frequent commits
- Post to Linear for team visibility
- Keep local file as backup

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Linear Post-Plan Steps

After the plan is written and reviewed:

1. **Save plan to local file** (always do this for backup):
   ```bash
   # Save to docs/superpowers/plans/YYYY-MM-DD-<feature>.md
   ```

2. **Post plan summary to Linear**:
   ```bash
   # Get current Linear issue ID
   ISSUE_ID=$(orca worktree list --json | jq -r '.result.worktrees[] | select(.linkedLinearIssue != null) | .linkedLinearIssue' | head -1)
   
   # Update issue description or attach plan reference
   # (Use appropriate Orca command based on available features)
   ```

3. **Commit the plan file**:
   ```bash
   git add docs/superpowers/plans/YYYY-MM-DD-<feature>.md
   git commit -m "plan: add implementation plan for [feature]"
   ```

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Summary posted to Linear issue $ISSUE_ID. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
