---
name: orca-bridge
description: >-
  Bridges superpowers workflow skills (brainstorming, writing-plans, executing-plans,
  verification-before-completion, subagent-driven-development) to the Orca CLI at 5
  high-leverage points: (1) worktree + Linear link, (2) hard decision gate, (3) task DAG
  as external memory, (4) lifecycle review coordination, (5) Linear status sync. Use
  when the user is running superpowers inside an Orca-managed project AND any of these
  triggers fire: "create worktree", "link linear", "verify checkpoint", "track tasks",
  "supervise review", "dispatch to reviewer", "sync linear", "update issue status",
  or when about to use `git worktree add` / TodoWrite / Claude's native Agent tool for
  tasks Orca already handles. Prefer this over raw git/TodoWrite in Orca contexts. If
  unsure which bridge fits, start with the `bridge-router` skill.
---

# Orca + Superpowers Bridges

Bridges 5 superpowers workflow moments to Orca CLI capabilities that raw git/TodoWrite/Agent-tool cannot provide. **Everything else in superpowers runs natively — do not wrap it.**

## When to use (auto-trigger)

| Trigger | Bridge |
|---|---|
| About to run `git worktree add` / `git checkout -b` after spec approval | **Bridge 1** |
| Reached `verification-before-completion` checkpoint with an Orca taskId | **Bridge 2** |
| `writing-plans` produces 5+ steps OR compaction expected | **Bridge 3** |
| User says "supervise / monitor / coordinate / DAG / wait for worker_done" for review | **Bridge 4** |
| Spec approved / gate resolved / final done — reflect in Linear | **Bridge 5** |
| YOU were dispatched by `worker-start` / `dispatch --inject` / `worktree create --agent` | **Worker lifecycle** (below) |

**Do NOT trigger** if user says "hand off / handover / give to another agent" without supervision words — that's full handoff, use `orca-cli`'s non-inject path.

---

## Bridge 1 — Worktree + Linear link

```bash
# Plain worktree (you will do the work in this session)
orca worktree create \
  --name <slug> \
  --linear-issue <id-or-url> \
  --no-parent \
  --json

# Autonomous worktree: spawn a ready agent that starts working immediately
orca worktree create \
  --name <slug> \
  --linear-issue <id-or-url> \
  --agent codex \
  --prompt "<self-contained task description>" \
  --no-parent \
  --json
```

Verified flag set (2026-08-01 via `orca help worktree create`): `--name`, `--repo|--project`, `--agent <id>`, `--prompt <text>`, `--setup run|skip|inherit`, `--base-branch`, `--issue`, `--linear-issue`, `--comment`, `--parent-worktree`, `--no-parent`, `--run-hooks`, `--activate`.

- `--no-parent` for top-level features (default). `--parent-worktree active` ONLY for stacked work.
- `--agent codex|claude` + `--prompt` turns the worktree into an **autonomous worker**: Orca creates the checkout AND boots a coding agent already primed with the task. Use this when the goal is "do this for me" rather than "give me a workspace".
- `--json` so downstream steps can read the worktree id. The create response envelope is `.result.worktree.id` (jq path; verified against runtime fallback chain `orca-feature.sh`). Note: `worktreeId` (camelCase) is a DIFFERENT field — it appears on `terminal list` objects (`.result.terminals[].worktreeId`), not on the `worktree create` response.

| ❌ Don't | ✅ Do |
|---|---|
| `git worktree add` | `orca worktree create --no-parent --json` |
| `git config branch.X.description "Linear: MY-1"` | `--linear-issue MY-1` |
| Manually `terminal create` + type the task | `worktree create --agent codex --prompt "..."` |

---

## Bridge 2 — Hard decision gate

**Precondition:** Orca taskId exists. If not, fall back to chat approval.

Full flag set (verified 2026-08-01): `--task`, `--question`, `--options`, `--from`, `--retry-request` (+ `--json`).

```bash
orca orchestration gate-create \
  --task <taskId> \
  --question "<short, scoped>" \
  --options '["approved","rejected"]' \
  [--from <coordinator-handle>] \     # routes replies back to the coordinator
  --json

# User replies "approved" in chat → coordinator runs:
orca orchestration gate-resolve --id <gateId> --resolution approved --json
```

| ❌ Don't | ✅ Do |
|---|---|
| "approve?" in chat, proceed on reply | `gate-create` + `gate-resolve` |
| Force gate when no taskId | Fall back to chat |
| Use `task-update --status done` as approval | That's mutation, not gate |

**Best practice:** attach gate to a *dedicated verification task*, not to an implementation task — avoids conflating "do" with "verify".

---

## Bridge 3 — Task DAG as external memory

**Threshold:** 5+ steps OR compaction expected. For 1-4 step plans, TodoWrite is fine.

### Real flags (verified 2026-08-01 via `orca orchestration task-create --help`)

Full set: `--spec`, `--task-title`, `--display-name`, `--deps`, `--parent`, `--run`, `--from`, `--retry-request` (+ `--json`).

```bash
orca orchestration task-create \
  --spec "<text>" \
  [--task-title "<short>"] \
  [--display-name "<ui label>"] \     # UI label for dispatched worker rows
  [--deps '<json_array_of_task_ids>'] \
  [--parent <task_id>] \
  [--run <runId>] \                   # scope to a Run (see `orchestration run-create`)
  [--from <handle>] \
  --json

orca orchestration task-list [--status <status>] [--ready] --json

orca orchestration task-update --id <taskId> --status completed --json
```

### How to encode ordering (NO `--order` flag)

Sequential: each task has `--deps '[<prev_task_id>]'`. Cap depth at 4.

### How to scope to a feature (NO `--worktree` / `--linear-issue` flag on task-create)

Embed ticket id in `--spec` text: `--spec "MY-79: audit hardcoded colors..."`. Fresh instance recovers via `task-list --ready --json` then filters `spec` substring.

### Don't / Do

| ❌ Don't | ✅ Do |
|---|---|
| `--worktree` / `--linear-issue` / `--title` / `--order` (still don't exist) | `--spec` + `--task-title` + `--deps` (+ `--display-name` / `--run` / `--from` if needed) |
| `task-list --worktree <id>` | `task-list --ready --json` + filter |
| TodoWrite for 5+ step plans | `task-create` chain |
| Forget `task-update --status completed` | Update on finish; `--ready` won't promote successor otherwise |

### Workflow

```
writing-plans → plan.md
              → for each step: task-create --spec "TICKET: <step>" --deps '[<prev>]'
executing-plans → task-list --ready --json
                → execute next ready task
                → task-update --id <id> --status completed
                → loop
```

---

## Bridge 4 — Lifecycle review coordination

**SUPERVISION CONTRACT — read first.**

Use orchestration only for **supervised** coordination (the user said "supervise / monitor / wait / review / coordinate a DAG"). Default for "hand off / handover" = FULL HANDOFF (no lifecycle obligations — use `orca-cli`, NOT this bridge).

### Preferred path: `worker-start` (official supervised worker loop)

`worker-start` composes worktree + terminal + readiness + dispatch into one call and returns a `dispatchId`. It replaces the old manual `terminal create` + `dispatch --inject` + `check --terminal` chain (which left reviewers unable to emit `worker_done`). Verified 2026-08-01 via `orca skills get orchestration`.

```bash
# 1. Create a Run once (namespace + coordinator inbox), then the review task scoped to it
RUN=$(orca orchestration run-create --objective "review <feature>" --json \
      | jq -r '.result.run.id')
TASK=$(orca orchestration task-create \
        --spec "Review-only: <scope>. Report findings via worker_done; do NOT edit." \
        --run "$RUN" --json | jq -r '.result.task.id')

# 2. Spawn the reviewer worker (composes checkout+terminal+readiness+dispatch)
DISPATCH=$(orca orchestration worker-start \
            --task "$TASK" --worktree current --agent claude --json \
          | jq -r '.result.dispatch.id')
# worktree current = fresh agent terminal in the current worktree, no setup rerun.
# Use --worktree new-child / new-top-level + --name + --setup run for an isolated checkout.
# Inspect progress without consuming mail:
#   orca orchestration worker-show --dispatch "$DISPATCH" --json
#   orca orchestration worker-read --dispatch "$DISPATCH" --limit 50 --json

# 3. Block until the reviewer reports (no polling loop)
orca orchestration check \
  --wait --types worker_done,escalation,question \
  --timeout-ms 900000 --json
# Process the whole Delivery, then atomically ack + keep waiting until every
# expected dispatch settles:
#   orca orchestration check --ack <delivery_id> --wait --types worker_done,escalation,question ...
```

> **Verified flags (2026-08-01):** `run-create` = `--objective` (+`--from`). `task-create` = `--spec` (+`--task-title --display-name --deps --parent --run --from`). `worker-start` = `--task`, `--worktree <current|selector|new-child|new-top-level>`, (`--agent <agent>` | `--terminal <handle>`), + optional `--on --name --repo --base-branch --display-name --comment --setup --retry-of --timeout-ms --run --from`. `check` = scope by `--terminal <handle>` OR `--run <runId>` + `--wait --types --timeout-ms --ack/--peek/--all`.

**Reviewer contract: REVIEW-ONLY.** A review-only `worker_done` reports findings; it does NOT authorize the coordinator to edit. After review, synthesize findings and dispatch a separate fix task (or hand off to the named owner) — don't conflate "review" with "fix".

**When you cannot use `worker-start`** (e.g. dispatching to an already-running bare shell the user owns): fall back to the low-level path `orchestration dispatch --task <id> --to <handle> --inject --json`, then `check --wait`. Prefer `worker-start` whenever you are creating the worker yourself.

| ❌ Don't | ✅ Do |
|---|---|
| Native `Agent` tool when user asked to supervise | `run-create` + `task-create` + `worker-start` + `check --wait` |
| `dispatch --inject` on "hand off" requests | `orca-cli` handoff path (no inject, no check-wait) |
| Reviewer edits files | Review-only `worker_done`; coordinator dispatches a fix task |
| Poll `check` in a tight loop | `--wait` blocks until a message arrives or timeout |
| Stop a worker just because no `worker_done` yet | Heartbeats/activity mean alive — keep waiting (15–60 min tasks are normal) |

`check --wait` returns one bounded Delivery per call. N concurrent workers → process/ack and keep waiting until every expected dispatch settles. A timeout or `{count:0}` is a checkpoint, not a failure.

---

## Bridge 5 — Linear status sync

### When

- Spec approved by user (post-`brainstorming`) → create Linear issue + mark "In Progress"
- Any `gate-resolve --resolution <X>` → reflect in Linear status
- Final verification gate approved → mark Linear "Done"
- User says "sync linear" / "update issue status" / "linear status"

### Workflow state map (team `MY`, verified 2026-07-05)

| Superpowers / Bridge event | Linear state |
|---|---|
| Spec approved, worktree created (Bridge 1) | `In Progress` |
| Plan written, executing starts | `In Progress` (no change) |
| Per-task gate resolved `approved` | `In Progress` (no change) — task-level only |
| Review gate resolved `approved` (Bridge 4 stage done) | `In Review` |
| Review gate resolved `changes_requested` | `In Progress` + label `Improvement` |
| Final gate resolved `approved` (feature done) | `Done` |
| Final gate resolved `rejected` | `Backlog` |
| User cancels feature | `Canceled` |

### Real commands (verified 2026-07-09)

<!-- MAINTENANCE: This Linear command block is mirrored in the dogfood
     consumer at docs/superpowers/conventions.md (Bridge 5 "Real commands").
     Keep both in sync. Verify flag syntax by running the live `orca` CLI —
     don't trust --help for multi-value flags (the `--label` variadic
     notation is misleading; repeat the flag instead). -->

```bash
# Issue lifecycle
orca linear create --title "<feature>" --team MY --project "orca" --json
# → MY-X

# UPDATE an issue (create-or-update). Verified 2026-08-01: `save-issue` CAN edit
# title/description/state/labels/etc. after creation — the old claim that the
# description was not editable via CLI was WRONG. Prefer --current so Orca uses
# the issue linked to the active worktree (no ID to track).
orca linear save-issue --current --description "<full body>" --json
orca linear save-issue --current --body-file plan.md --json        # body from file/stdin
orca linear save-issue MY-X --state "In Progress" --json           # explicit id also works

# Status changes (workflow states: Backlog, Todo, In Progress, Done, Canceled, Duplicate)
# --to <state> is REQUIRED; the state is NOT positional. --current avoids the id.
orca linear status set --current --to "In Progress" --json
orca linear status set --current --to "In Review" --json
orca linear status set --current --to "Done" --json
# (explicit form: `status set MY-X --to "Done" --json`)

# Assignee (--me or --to-id <userId>; no positional email/member form)
orca linear assignee set --current --me --json
orca linear assignee set --current --to-id <userId> --json
orca linear assignee clear --current --json

# Labels (--label flag required; REPEAT the flag for multiple values, do not
# space-separate — `--label Feature Improvement` errors "Unknown command").
orca linear label add --current --label Feature --json
orca linear label remove --current --label Improvement --json
orca linear label set --current --label Feature --label Improvement --json    # replaces all

# Priority (--to <level>; names, not 0-3: none|low|medium|high|urgent)
orca linear priority set --current --to medium --json
orca linear priority clear --current --json

# Read state for verification
orca linear issue --current --full --json

# Comments / attachments (also accept --current)
orca linear comment add --current --body-file - < findings.md --json   # stdin preferred over --body "$arg"
orca linear attach --current --url <pr-url> --title "PR link" --json
```

### Don't / Do

| ❌ Don't | ✅ Do |
|---|---|
| Track `MY-X` everywhere by hand | Use `--current` (resolves the worktree's linked issue) |
| Believe description is uneditable via CLI | `save-issue --current --description "<body>"` (create-or-update) |
| `status set MY-X "Done"` (positional state) | `status set --current --to "Done" --json` |
| `label add MY-X Feature` (positional label) | `label add --current --label Feature --json` |
| `priority set MY-X 2` (numeric, doesn't exist) | `priority set --current --to medium --json` |
| `assignee set MY-X <email>` (no positional) | `assignee set --current --me` or `--to-id <userId>` |
| `label set MY-X --label A B` (space-separate multi) | `label set --current --label A --label B` (repeat flag; space-sep errors "Unknown command") |
| `comment add MY-X --body "$arg"` (shell-escape breaks) | `comment add --current --body-file -` (stdin) |
| Guess state name | Verify with `orca linear team states --team MY --json` first |
| Use `status-move` (doesn't exist) | `status set --current --to <state-name>` |
| Try `linear label create` (doesn't exist in CLI) | Create labels via Linear UI; then `label add --label` |
| Auto-set "Done" without final gate approval | Wait for gate-resolve `approved` first |
| Use `In Review` for task-level gates | `In Review` = peer review done (after Bridge 4) |

### Recommended label set (create via UI once)

If team doesn't have these, create via Linear UI (CLI can't create labels):
- `has-spec` — spec written
- `has-plan` — plan written
- `needs-changes` — review returned changes_requested
- `review-approved` — review passed

Use existing `Feature` / `Bug` / `Improvement` for type categorization.

### Example flow (after spec approved)

```bash
# Bridge 5: create + start (create needs an explicit id; capture it once)
ISSUE=$(orca linear create \
  --title "Share portfolio via URL" \
  --team MY --project "orca" \
  --json | jq -r '.result.issue.identifier')
# → MY-80

orca linear status set "$ISSUE" --to "In Progress" --json
orca linear label add "$ISSUE" --label Feature --json

# Bridge 1 links the issue to the worktree:
#   orca worktree create --name share-portfolio --linear-issue "$ISSUE" --no-parent --json
# From here on, prefer --current (resolves the active worktree's linked issue):
#   orca linear save-issue --current --body-file docs/superpowers/plans/<plan>.md --json

# (Bridges 2, 3, 4 happen during execution)
# (Final gate approved)
orca linear status set --current --to "Done" --json
```

---

## Worker-side lifecycle (when YOU are the dispatched worker)

The bridges above are **coordinator-side** (you spawn/supervise others). This section is the mirror image: when **this skill is running inside an Orca dispatch** — i.e. a coordinator started you via `worker-start` or `dispatch --inject` — you are a *worker* and must speak the lifecycle protocol. This is what makes the autonomous pipeline actually close (a `worker-start` reviewer/executor can report back instead of timing out).

### Detect: am I a worker?

You are a worker when ANY of these hold:
- `orca orchestration dispatch-show --task <taskId> --json` returns an active dispatch bound to this terminal, OR
- the prompt you received carries an injected lifecycle preamble (mentions `worker_done`, a `taskId`/`dispatchId`, "report back"), OR
- you were spawned by `worktree create --agent ... --prompt ...` / `worker-start`.

If none hold, you are NOT in a dispatch — run normally (no lifecycle messages).

### Classify the request first (do not create false obligations)

| Signal | Classification | Action |
|---|---|---|
| Preamble + `taskId`/`dispatchId`, user said "supervise/wait/review/DAG" | **Coordinated subtask** | Follow preamble: emit `worker_done`/`heartbeat`/`ask` |
| "hand off / handover / give to another agent" (no supervision words) | **Full handoff** | Do NOT emit lifecycle mail; just do the work under the new owner |

### Report completion: `worker_done` (the critical step)

When your dispatched task is done (or failed), emit exactly one `worker_done`. It must carry the task + dispatch ids and an explicit outcome:

```bash
orca orchestration send --type worker_done \
  --subject "<one-line status>" \
  --body "<what changed, findings, what remains>" \
  --task-id <taskId> --dispatch-id <dispatchId> \
  --outcome succeeded \
  --files-modified "path/a,path/b" --json
# On failure use --outcome failed (never encode failure only in prose).
```

- A valid `worker_done` for the active `taskId`+`dispatchId` **auto-marks the task and dispatch completed**. Do NOT follow it with `task-update --status completed` — reserve manual updates for explicit recovery/overrides.
- **Review-only workers**: `worker_done` reports findings; it does NOT authorize you to keep editing. Stop after reporting; the coordinator decides on fixes.
- Use `--files-modified` (csv) so the coordinator sees the blast radius without reading your terminal.

### Ask the coordinator (blocking) when blocked

```bash
# Worker asks; defaults to the owning Run
orca orchestration ask --question "Should I also migrate the legacy callers?" \
  --options "yes,no" --timeout-ms 600000 --json
# If it timed out / disconnected, RESUME by message id — do not ask again:
orca orchestration ask --resume <message_id> --timeout-ms 600000 --json
# Coordinator answers:
orca orchestration reply --id <message_id> --body "yes" --json
```

### Heartbeat for long tasks

Long tasks (15–60 min) are normal. Keep the coordinator informed so it does not assume you died:

```bash
# Dispatch-scoped: include both ids, omit --to so Orca uses the owning Run
orca orchestration send --type heartbeat \
  --task-id <taskId> --dispatch-id <dispatchId> \
  --subject "still working" --body "<progress>" --json
```

Heartbeat = alive, not done. Conversely, as a coordinator, heartbeats/terminal activity mean the worker is alive — do NOT stop it for lacking a `worker_done` yet.

### Worker cheat-sheet

| ❌ Don't (as a worker) | ✅ Do |
|---|---|
| Finish silently and stop | Emit one `worker_done` with `--outcome` + both ids |
| `task-update --status completed` yourself | Let `worker_done` mark it; only override for recovery |
| Re-`ask` the same question after a timeout | `ask --resume <message_id>` |
| Emit lifecycle mail on a "hand off" | Just do the work; no `worker_done`/`check --wait` |
| Edit files after a review-only `worker_done` | Stop; coordinator dispatches a fix task |

---

## Scope and limitations

- **Project scope:** install in any Orca-managed project. Conventions live in this skill (global), not per-project.
- **No upstream modification:** this skill does not modify Orca or superpowers. Survives updates to both.
- **Linear attach needs git remote:** `orca linear attach --url <pr>` requires a PR URL. If no git remote, Linear sync is create-issue-only — surface this to the user.
- **Bridge 4 needs real Orca runtime:** the lifecycle pattern (`worker-start` + `check --wait`) only works when Claude is running inside an Orca-managed terminal with orchestration enabled. It cannot be exercised from a non-Orca Claude session.

---

## Cross-references

- **`bridge-router`** — the routing skill. If unsure which bridge fits, start there.
- `superpowers:using-git-worktrees` → Bridge 1
- `superpowers:verification-before-completion` → Bridge 2
- `superpowers:writing-plans`, `superpowers:executing-plans` → Bridge 3
- `superpowers:subagent-driven-development`, `superpowers:requesting-code-review` → Bridge 4 (now via `worker-start`)
- **Worker-side lifecycle** → emits `worker_done`/`ask`/`heartbeat` (see section above)
- Orca CLI: `~/.claude/skills/orchestration/SKILL.md` — discovery stub; run `orca skills get orchestration` for the full version-matched reference (do not memorize flags).
