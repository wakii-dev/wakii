# Plan Templates (referenced by SKILL.md Phase 3)

Phase 3 MUST Read this file to pick + populate a template. Pick 7-section (default) or Epic per the Phase 2 Template-pick heuristic (counting rules + ambiguity fallback in SKILL.md). Write the populated plan to `docs/superpowers/plans/<date>-<feature>-plan.md` + Linear issue body.

---

**Plan Template** (output structure after Phase 0-2, written to `docs/superpowers/plans/<date>-<feature>-plan.md` + Linear body):

```markdown
# Plan: <feature name>
Date: YYYY-MM-DD | Linear: <ISSUE_ID> | Worktree: <slug>

## 0. Root cause analysis (WHY — before "what")
### Root cause
<why the problem exists — deep cause, not symptom; use 5 Whys if needed>
### Current state (before feature)
<how user/process works today; specific pain points; frequency/impact>
### Expected outcome (what the feature solves)
<new behavior enabled; metric improved / pain removed>
### Constraints & hardships
<technical/business/time obstacles; limits to accept>
### High-level strategy
<approach at strategy level — automation vs manual, split vs big-bang, wrap vs rewrite — NOT the detailed solution (that's section 4)>

## 1. Problem (intent, NOT solution)
<1-2 sentences; who/when affected>

## 2. Scope
- In scope: <list>
- Out of scope: <list>
- Success criteria (observable): <list>

## 3. Touch map
- Files modify: <list with paths>
- Consumers/regression candidates: <list>
- Shared surfaces (API/DB/config/events): <which>

## 4. Design
- Approach chosen: <A/B + reason>
- Alternatives considered: <list + why dismissed>
- Edge cases / second-order effects: <list>
- Non-functional: <perf/security/a11y/i18n — relevant ones>

## 5. Implementation outline
- Tasks (ordered): <list>
- File structure (where new files go, per codebase conventions): <list>
- Testing strategy: <unit/integration/manual + what>

## 6. Risks & unknowns
- Must verify (probes/reads): <list>
- Unverified assumptions: <list>
```

**Epic Plan Template** (for large features — multiple sub-features / many designs / many steps; use when feature decomposes into >3 sub-features OR >10 tasks OR user picks "Epic Plan" action). The Epic plan is a **parent** — each sub-feature then runs its own 7-section plan as a child workflow.

```markdown
# Epic Plan: <feature name>
Date: YYYY-MM-DD | Linear: <ISSUE_ID> | Worktree: <slug>

## 0. Root cause analysis (WHY)
<same 5 sub-parts as feature plan: root cause / current state / outcome / constraints / high-level strategy>

## Epic scope
- In scope (epic-level): <list>
- Out of scope: <list>
- Epic success criteria: <observable>

## Sub-feature decomposition
For each sub-feature: name + 1-line purpose + dependencies + which 7-section plan covers it.
| Sub-feature | Purpose | Depends on | Plan path |
|-------------|---------|------------|-----------|
| <name> | <what> | <deps> | docs/superpowers/plans/<date>-<name>-plan.md |

## Execution order (graph, not linear — depth-first per sub-feature)
Per the user's preferred graph-loop topology (explore graph once → loop each sub-feature depth-first to completion), not a linear batch. Encode deps as Orca task DAG edges.
- Tier 1 (no deps): <sub-features runnable in parallel, cap 4 concurrent>
- Tier 2 (deps on Tier 1): ...
- etc.

## Cross-cutting concerns
<shared infra touched by multiple sub-features: API/DB schema, design system, config, types — list + which sub-features depend on each>

## Epic risks
<risks spanning sub-features: integration, migration, perf at scale>

## Milestones (optional)
<M1: foundation; M2: core; M3: polish — only if phases meaningful>
```

**Brainstorm for epic:** must ask, in addition to feature-level questions: (a) should this be decomposed? (b) what are the sub-features + their boundaries? (c) what's the dep graph between them? (d) what's cross-cutting? Surface these — decomposition wrong = entire epic wastes effort.
