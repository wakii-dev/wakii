---
name: execute-plan
description: >-
  Execute an implementation plan dispatched via orca orchestration.
  Follows superpowers executing-plans pattern + orca-bridge integration.
  Used by executor agents spawned from the automation coordinator.
---

# /execute-plan — Executor Agent Workflow

You are an executor agent. You received a task via `orca orchestration dispatch --inject`.
You have a `taskId`, `dispatchId`, and coordinator handle from the preamble.

## Flow

```
Receive dispatch (preamble has taskId + coordinator handle)
    ↓
1. Read plan from Linear issue
2. Execute tasks sequentially (task-list --ready → implement → task-update)
3. If blocked → ask coordinator
4. All done → send worker_done
```

## Steps

### 1. Load plan

```bash
# Get Linear issue linked to this worktree
orca linear issue --current --full --json
```

Extract tasks from description. Understand the full plan before starting.

### 2. Execute task loop

```bash
# Get next ready task
orca orchestration task-list --ready --json
```

For each ready task:

**a) Read task spec** — understand what to do

**b) Implement** — follow plan steps exactly:
- Read relevant files first (codegraph explore/node if needed)
- Write code matching plan snippets
- DO NOT deviate from plan without asking coordinator

**c) Verify** — run the verify step from plan:
- Check expected result
- If verification fails → ask coordinator:
  ```bash
  orca orchestration ask --to <coordinator_handle> --question "Task N verification failed: <details>. How to proceed?" --json
  ```
  Wait for reply. Follow instruction.

**d) Commit**
```bash
git add <files>
git commit -m "<message from plan>"
```

**e) Mark completed**
```bash
orca orchestration task-update --id <taskId> --status completed --json
```

**f) Comment progress on Linear**
```bash
echo "✅ Task N done: <title>" | orca linear comment add --current --body-file -
```

**g) Loop** — go back to task-list --ready for next task.

### 3. When blocked

If you cannot proceed (missing dependency, unclear instruction, test fails repeatedly):

```bash
orca orchestration ask --to <coordinator_handle> \
  --question "<clear description of the blocker>" \
  --json
```

This blocks until coordinator replies. Follow the reply.

If fundamentally stuck (3+ retries failed):
```bash
orca orchestration send --to <coordinator_handle> \
  --type escalation \
  --subject "Blocked on MY-X task N" \
  --body "<what happened, what was tried>" \
  --json
```

### 4. All tasks done — send worker_done

After all tasks in task-list are completed:

```bash
orca orchestration send --to <coordinator_handle> \
  --type worker_done \
  --subject "MY-X implementation complete" \
  --body "All tasks implemented and verified. Files modified: <list>. Ready for review." \
  --payload '{"taskId":"<task_id>","dispatchId":"<dispatch_id>","filesModified":["<paths>"]}' \
  --json
```

## Rules

1. **Follow plan exactly** — do not improvise or add features
2. **Read code before writing** — verify file structure, function names exist
3. **Verify before marking done** — run the verify step from plan
4. **Ask when blocked** — do not guess, use `orchestration ask`
5. **One worker_done** — send exactly once when ALL tasks complete
6. **Do not set Linear status** — coordinator handles that after worker_done
7. **Commit after each task** — small, atomic commits
8. **Comment progress** — Linear comment after each task done
