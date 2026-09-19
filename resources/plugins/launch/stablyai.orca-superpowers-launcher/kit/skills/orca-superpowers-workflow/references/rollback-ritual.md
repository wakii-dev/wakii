# Rollback Ritual + Fallback Behavior

> Tách từ orca-superpowers-workflow/SKILL.md — chạy khi workflow vỡ giữa chừng.

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
- **Figma Principle 8 skills (image-to-code/design-taste-frontend) unavailable:** these are conditional (only fire on figma.com URL). Skip the affected step, inform the user which verification step was skipped, and proceed — the workflow can complete without UX polish, just flag the gap in the audit log.

General rule: a MANDATORY skill going missing is a STOP + ask (Phase 2, Phase 3); a CONDITIONAL skill going missing is a skip + flag (Figma steps, executing-plans when not the only option).

This skill wraps the standard superpowers skills (brainstorming, writing-plans-linear) + Orca orchestration (execute via inline or `worker-start`, gate via `gate-create`) — adding bridge invocations at transitions and speaking the worker-side lifecycle when dispatched. No modifications to superpowers required.
