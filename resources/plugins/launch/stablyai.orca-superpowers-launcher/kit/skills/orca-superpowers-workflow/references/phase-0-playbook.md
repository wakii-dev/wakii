# Phase 0 — Impact Analysis Playbook

> Tách từ orca-superpowers-workflow/SKILL.md: template 5-section + design-fidelity fork + subagent option + briefing cho phase0-impact-analyst.

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

