# Worker Patterns (Phase 4 Delegation Reference)

Loaded by `orca-superpowers-workflow` SKILL.md when Phase 4 dispatches work. Contains: decision table, single-worker pattern, multi-agent topology, worker-side reporting, worker lifecycle cleanup, retry/multi-server, and the `Execute mode:` token contract.

## Delegate a task to a worker (autonomy)

**Pick the right mechanism — do not mix them up:**

| Use this | When | Why |
|----------|------|-----|
| **`orca orchestration worker-start`** | Phase 4 implementation tasks (code writes), Phase 4 review between tasks, parallel tasks with deps | Orca-native coordinator; true concurrency cap; reports via `worker_done` event; gets its own worktree/terminal; can be gated; coordinator survives your session ending. **Preferred for any task that mutates code or needs a real execution context.** |
| **Agent tool (built-in subagent)** | Phase 0 / Phase 4 multi-dimensional **analysis** only (read-only: assess, find risk, propose alternatives) | Same context, lightweight, returns synthesized text to you. Used by `SUBAGENT_DIRECTIVE` (panel toggle 1-10). **No code writes, no Orca state, no concurrency cap — just analysis.** |
| **Inline (you do it)** | Small/single-file task, or task needing full workflow context, or task where you'd spend more tokens briefing a subagent than doing it | Cheapest. Default when in doubt. |

**Decision rule:** if the task writes code or mutates Orca/Linear state → `worker-start`. If it only reads + reasons + returns text → Agent tool. If unsure → inline. Never use Agent tool for code writes (it has no worktree isolation); never use `worker-start` for pure analysis (it's heavyweight and ties up a coordinator slot).

**Execute-mode token contract (panel override):** the Start prompt may carry one of three `Execute mode: <X>` tokens (emitted by the `local.superpowers-launcher` panel's "Execute (Phase 4)" select). They override the decision table above for the entire run:
- `Execute mode: delegate` (default, often not emitted) → apply the table as-is (Orca `worker-start` preferred).
- `Execute mode: inline` → execute all Phase 4 tasks yourself; do NOT use `worker-start`.
- `Execute mode: superpowers` → invoke `superpowers:executing-plans` skill to drive Phase 4 task loop + verification; still use `orca orchestration gate-create` for gates.

If you rename this table or the trigger phrases, update `directives.json` `EXECUTE_INLINE_TOKEN` / `EXECUTE_DELEGATE_TOKEN` / `EXECUTE_SUPERPOWERS_TOKEN` in the launcher plugin to match — these tokens are the only wire between panel and skill.

## Single-worker dispatch

For mechanical/parallel tasks, delegate via `worker-start` (reports back via `worker_done`; you stay coordinator).

```bash
DISPATCH=$(orca orchestration worker-start \
  --task "$TASK_N" --worktree current --agent claude --json \
  | jq -r '.result.dispatch.id')

# Block until it reports (no polling):
orca orchestration check --wait --types worker_done,escalation,question \
  --timeout-ms 900000 --json
# Then ack + continue: orca orchestration check --ack <delivery_id> --wait ...
```

## Multi-agent pattern (parallel tasks via topology tiers)

When the Phase 3 task DAG has independent tasks in the same tier, dispatch them as N `worker-start` calls (one per task) — NOT one call with a count flag (no such flag exists). Cap **4 workers in flight** (concurrency convention; see memories `rsa-dag-parallel-orchestration-proposal`, `concurrency-via-orca-coordinator-not-skill-override`, `epic-plan-mode-for-large-features`). Each worker gets its own worktree/terminal for isolation; `--worktree current` only when tasks genuinely share state.

```bash
# Tier dispatch: fan out up to 4 ready tasks, then block-collect-ack loop.
# `ready` = task deps all completed. `task-list --ready` excludes pending deps;
# if a task should be ready but isn't (deps done, status still `pending`), promote
# it via `task-update --status ready` (valid statuses: pending, ready, dispatched,
# completed, failed, blocked — there is NO `in_progress` for tasks).

# Dispatch tier (example: T1, T2, T3 ready, no inter-deps):
# Worktree selectors must be prefixed: `name:<displayName>`, `branch:<b>`, `id:…`,
# `path:…`, or `active`/`current`. A bare name like `wt-T1` is INVALID.
for TASK_ID in T1 T2 T3; do
  orca orchestration worker-start --task "$TASK_ID" \
    --worktree "name:wt-$TASK_ID" --agent claude --json \
    | jq -r '.result.dispatch.id' >> dispatches.txt
done

# Block until each reports; ack + continue loop (no polling):
while [ -s dispatches.txt ]; do
  MSG=$(orca orchestration check --wait \
    --types worker_done,escalation,question \
    --timeout-ms 900000 --json | jq 'select(._keepalive|not)')
  DELIVERY=$(echo "$MSG" | jq -r '.delivery_id')
  orca orchestration check --ack "$DELIVERY" --json >/dev/null
  # Handle outcome: succeeded → drop from dispatches; failed/escalation → retry-of or STOP+ask
  break  # re-check ready list for next tier (deps may now be satisfied)
done
```

**Retry a failed worker:** `--retry-of <dispatch_id>` links the replacement attempt (does NOT inherit placement — repeat `--worktree` and `--agent`). After 2 fails same root cause → STOP + ask user (loop cap, see SKILL.md Rollback section).

**Multi-server:** `--on <saved-environment>` dispatches a worker to a remote Orca server; the Run + coordinator stay on the current server. Use when a tier needs to run across hosts (e.g. CI-bound tasks).

For **review** between tasks, spawn a review-only worker the same way (reports, doesn't edit); dispatch a separate fix task if needed. This is Bridge 4 via the official `worker-start` path — not the old `terminal create` + `dispatch --inject` chain.

## When YOU are the dispatched worker

If this workflow runs inside an Orca dispatch (coordinator started you via `worker-start` / `worktree create --agent` / `dispatch --inject`), report back instead of stopping silently:

```bash
# Feature done:
orca orchestration send --type worker_done \
  --subject "feature <name> done" --body "<what changed, what remains>" \
  --task-id <taskId> --dispatch-id <dispatchId> \
  --outcome succeeded --files-modified "a,b" --json

# Need a decision:
orca orchestration ask --question "..." --options "yes,no" --timeout-ms 600000 --json
```

A valid `worker_done` auto-marks the task/dispatch completed — do not also call `task-update --status completed`. See `orca-bridge` §"Worker-side lifecycle" for the full protocol.

## Worker lifecycle (coordinator-side cleanup — avoid zombie workers)

Every `worker-start` returns a `dispatch.id`. Each dispatch holds a supervised agent terminal + worktree resources. The coordinator MUST close settled/failed workers explicitly — there is no auto-GC, and leaking them ties up coordinator slots (cap 4 in flight) and leaves orphan worktrees/terminals.

| Command | When | Effect |
|----------|------|--------|
| `worker-release --dispatch <id>` | Worker reported `worker_done` (settled) and you've collected its output | Releases the terminal for reuse; default post-success action |
| `worker-retain --dispatch <id>` | Worker settled but you want to inspect its terminal/output for debugging | Keeps the terminal live (debugging) instead of releasing |
| `worker-stop --dispatch <id>` | Worker is running but you need to cancel it (e.g. task diverged, retry-of decided) | Fences + stops the agent terminal; claimed process stopped |
| `worker-abandon --dispatch <id>` | Worker/process state unknown (crashed, host lost, can't confirm stopped) | Fences the worker WITHOUT claiming its process stopped — use when `worker-stop` can't confirm termination |

```bash
# Typical success path:
orca orchestration worker-release --dispatch "$DISPATCH_ID" --json

# Diverged/cancel mid-run:
orca orchestration worker-stop --dispatch "$DISPATCH_ID" --json
# Then: --retry-of to dispatch a replacement (does NOT inherit placement).

# Process unknown / crashed host:
orca orchestration worker-abandon --dispatch "$DISPATCH_ID" --json

# Inspect before deciding (read-only, bounded):
orca orchestration worker-show --dispatch "$DISPATCH_ID" --json
orca orchestration worker-read --dispatch "$DISPATCH_ID" --json
```

**Rule:** for every dispatch you `worker-start`, exactly one of `worker-release` / `worker-stop` / `worker-abandon` MUST eventually be called. Unmatched starts = zombie workers + orphan worktrees.
