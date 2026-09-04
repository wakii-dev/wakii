---
name: bridge-router
description: >-
  Route a superpowers workflow moment to the right Orca bridge. The single entry
  point when you're unsure whether to reach for worktree+Linear (Bridge 1),
  decision gate (Bridge 2), task DAG (Bridge 3), lifecycle review coordination
  (Bridge 4), or Linear status sync (Bridge 5). Use when a superpowers skill is
  running AND the right Orca mapping isn't obvious.
---

# Bridge Router

## Overview

This is the **master routing skill** for the Orca + superpowers bridges. Instead of memorizing 5 bridges, start here. Identify the superpowers moment and the user's intent, and this skill points you to the right bridge. Think of it as the "which Orca capability fits?" guide.

**Core Principle:** Don't memorize bridges — memorize how to find the right one. Superpowers moment + User intent → Bridge.

## Short-Circuit: Skip the Router

**If you already know the right bridge, invoke `orca-bridge` directly — don't route.** This skill is for when you're *unsure* which bridge fits. If the moment obviously maps (e.g., user just typed "create worktree" → Bridge 1; user says "wait for the reviewer to finish" → Bridge 4), go straight to it. Routing is overhead you only pay when the match isn't obvious. Likewise, if no Orca capability clearly helps, just run superpowers natively — don't force a bridge.

## Quick Router

### Step 1: What's the superpowers moment?

| Moment | You're in the middle of... |
|--------|---------------------------|
| **Worktree creation** | `using-git-worktrees` skill, or about to type `git worktree add` |
| **Checkpoint / approval** | `verification-before-completion`, or about to type "approve?" |
| **Plan execution** | `writing-plans` just produced a plan, or `executing-plans` is iterating |
| **Review coordination** | `subagent-driven-development`, `requesting-code-review`, or user said "supervise" |
| **Status reflection** | Spec just approved, gate just resolved, feature done |
| **Worker reporting** | YOU were dispatched (`worker-start` / `worktree --agent` / injected preamble) — report back |

### Step 2: What's the user's intent?

| Intent | You need to... |
|--------|----------------|
| **Track lineage** | Persist worktree + Linear link across instances |
| **Block / enforce** | Make a checkpoint merge-blocking and auditable |
| **Remember** | Survive context compaction with task state |
| **Supervise** | Stay in the loop while another agent works |
| **Reflect** | Mirror workflow state into Linear |

---

## Moment → Bridge Maps

### 🌳 Worktree creation

```
TRIGGER                          → BRIDGE
─────────────────────────────────────────────────────
`git worktree add` about to run  → Bridge 1
Need Linear link on a branch     → Bridge 1
Stacked work on existing branch  → Bridge 1 (--parent-worktree active)
Top-level feature                → Bridge 1 (--no-parent)
```

**Default:** Bridge 1 (`orca worktree create --no-parent --json`). Fall back to raw git only if not in an Orca-managed project.

---

### 🛑 Checkpoint / approval

```
TRIGGER                          → BRIDGE
─────────────────────────────────────────────────────
"approve?" about to be typed     → Bridge 2 (if taskId exists)
verification-before-completion   → Bridge 2 (if taskId exists)
Per-task checkpoint              → Bridge 2 (attach to verification task)
No taskId, lightweight check     → Chat approval (no gate — don't force)
```

**Default:** If a `taskId` exists → Bridge 2 (`gate-create` + `gate-resolve`). If not → chat approval. Gates require a task; don't create orphan gates.

---

### 📋 Plan execution

```
TRIGGER                          → BRIDGE
─────────────────────────────────────────────────────
Plan with 5+ steps               → Bridge 3
Compaction expected mid-execution→ Bridge 3
Plan with 1-4 steps, no risk     → TodoWrite (no bridge needed)
Need cross-instance recovery     → Bridge 3 (task-list --ready)
```

**Default:** 5+ steps or compaction risk → Bridge 3 (`task-create` chain with `--deps`). Otherwise TodoWrite is fine.

---

### 👁️ Review coordination

```
TRIGGER                          → BRIDGE
─────────────────────────────────────────────────────
"supervise / monitor / coordinate" → Bridge 4
"wait for worker_done"           → Bridge 4
"DAG / decision gate / ask-reply"→ Bridge 4
"hand off / handover / give to"  → NO bridge (full handoff, no --inject)
Ambiguous supervision vs handoff → ASK user, don't guess
```

**Default:** Explicit supervision words → Bridge 4 via **`worker-start`** (`run-create` + `task-create` + `worker-start --worktree current --agent <a>` + `check --wait`). This is the official supervised path; do NOT use the old `terminal create` + `dispatch --inject` chain. "Hand off" without supervision words → full handoff path (`orca-cli`), NOT Bridge 4.

---

### 🧑‍🔧 Worker reporting (you are the dispatched agent)

```
TRIGGER                          → ACTION
─────────────────────────────────────────────────────
Injected preamble / taskId+dispatchId → Worker lifecycle (orca-bridge §Worker-side)
Task finished (success/fail)     → emit `send --type worker_done --outcome …`
Blocked, need a decision         → `orchestration ask --question …`
Long task, stay alive            → `send --type heartbeat …`
"hand off / handover" (no supervise) → NO lifecycle mail — just do the work
```

**Default:** If you detect an active dispatch (`dispatch-show` returns one, or the prompt carries a preamble), follow the Worker-side lifecycle in `orca-bridge`. Otherwise run normally.

---

### 🔄 Status reflection

```
TRIGGER                          → BRIDGE
─────────────────────────────────────────────────────
Spec approved                    → Bridge 5 (create issue + "In Progress")
Gate resolved `approved`/`rejected` → Bridge 5 (mirror to Linear state)
Final feature done               → Bridge 5 ("Done")
User says "sync linear"          → Bridge 5
```

**Default:** Gate resolution drives Linear state, not the reverse. Wait for gate-resolve before setting "Done".

---

## Don't / Do

| ❌ Don't | ✅ Do | Why |
|---|---|---|
| Force a bridge when superpowers runs fine natively | Route only at the 5 high-leverage moments | Wrapping everything = overhead, no value |
| Use `dispatch --inject` on "hand off" | Route to full-handoff path (no bridge) | `--inject` creates false lifecycle mail |
| Spawn Bridge 4 reviewer via `terminal create` + `dispatch` | Use `worker-start` (official path) | Old chain leaves the reviewer unable to emit `worker_done` |
| Finish a dispatched task silently | Emit `worker_done` with `--outcome` + both ids | Coordinator is blocked waiting; silence = timeout |
| Force Bridge 2 gate with no taskId | Fall back to chat approval | Gates require a task to attach to |
| Use TodoWrite for 5+ step plans | Route to Bridge 3 | TodoWrite is lost on compaction |
| Auto-set Linear "Done" without gate | Wait for gate-resolve `approved` → Bridge 5 | Gate is authority; Linear follows |

---

## When NOT to route

- **No Orca context:** If Claude isn't running inside an Orca-managed project, bridges can't exercise Orca CLI. Skip routing; use raw git/TodoWrite/Agent-tool.
- **Trivial work:** 1-2 step plans, no checkpoints, no review — superpowers native is enough.
- **User didn't ask for supervision:** "Hand off" / "handover" = full handoff, not Bridge 4.

---

## Cross-references

- Full bridge details: `orca-bridge` skill (the implementation skill, not this router)
- Project conventions: `docs/superpowers/conventions.md` in the active project
- Orca lifecycle contract: `~/.claude/skills/orchestration/SKILL.md`
