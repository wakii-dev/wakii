<div align="center">
  <img src=".github/assets/wakii-banner.svg" width="100%" alt="Wakii — the agentic IDE with a built-in superpowers team" />
</div>

<p align="center">
  <a href="https://wakii.dev"><img src="https://img.shields.io/badge/web-wakii.dev-45E0A8?logo=safari&logoColor=45E0A8" alt="wakii.dev" /></a>
  <img src="https://img.shields.io/badge/9-agents-C026D3?style=flat" alt="9 agents" />
  <img src="https://img.shields.io/badge/20-skills-8b5cf6?style=flat" alt="20 skills" />
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="macOS, Windows, Linux" />
</p>

<p align="center">
  <a href="https://wakii.dev"><b>Website</b></a> ·
  <a href="https://wakii.dev/docs/getting-started/">Docs</a> ·
  <a href="https://wakii.dev/skills/">Skills</a> ·
  <a href="https://wakii.dev/roadmap/">Roadmap</a> ·
  <a href="https://github.com/stablyai/orca">Upstream: stablyai/orca</a>
</p>

---

Wakii is a fork of [Orca](https://github.com/stablyai/orca) (MIT) — the AI
orchestrator that runs Codex, Claude Code, OpenCode, Pi and **any other CLI
agent** side-by-side, each in its own isolated git worktree.

On top of that base, Wakii ships a complete **agentic workflow kit** that
installs itself on first run — no setup, enabled by default.

## 🤖 How the agents work

Wakii turns a one-line feature idea into merged, verified code through a
**seven-stage pipeline**. Each stage is owned by a specialist agent, and the
checks between stages are adversarial — a different agent attacks the work
than the one who produced it.

```
idea → impact → plan → epic + SF bracket → parallel SFs → gates → 1 PR per story
```

| # | Stage | Agent on duty | What happens |
| - | ----- | ------------- | ------------ |
| 1 | **Impact analysis** | `phase0-impact-analyst` | Before any code exists, it maps the blast radius: which files are touched, second-order effects across dimensions, and the realistic alternatives — so you approve a direction, not a guess. |
| 2 | **Spec review** | `spec-critic` | Attacks the spec like an adversary: ambiguity, missing edge cases, unverifiable criteria. A spec survives only when the critic runs out of objections. |
| 3 | **Plan + bracket** | `plan-critic` | Breaks the plan into bite-sized tasks (file, code, how to test — written for an engineer with zero context) and reviews the dependency graph between them. Large features become an **epic with sub-features** drawn as a live bracket canvas. |
| 4 | **Parallel execution** | `task-executor` | Independent sub-features run **in parallel**, each in its own isolated worktree and branch. The executor implements tasks and commits atomically. |
| 5 | **Code review** | `code-reviewer` | Reviews every diff for bugs, security issues and scope creep — P0 findings block the merge. |
| 6 | **Verification** | `verifier` | Independent pass/fail on the finished work — **self-reports don't count**. Verdicts: `COMPLETE` · `READY-TO-DONE` · `INCOMPLETE` · `VIOLATION` · `NOT-LAUNCHED`. |
| 7 | **One PR per story** | — | When every sub-feature's gates pass and the story verifies `COMPLETE`, everything collapses into a single clean PR. |

### 🚦 The gates (B0–B5)

Every sub-feature must clear all six gates — the checks are adversarial by
design:

| Gate | Checks |
| ---- | ------ |
| **B0** | Browser test — the agent actually opened the app and walked the flow |
| **B1** | Code + tests pass |
| **B2** | Plan checkboxes ticked |
| **B3** | Independent review done |
| **B4** | Branch merged to the story branch |
| **B5** | Linear issue set to Done |

### 🐕 The watchdog

Stories stall — an agent hits a dead end, a review loops, a merge conflicts.
The **watchdog** detects stalled sub-features and auto-resumes them from the
last good state, so a long story never needs a babysitter.

## 🧠 How skills work

Skills are **packaged instruction sets** the agents load on demand —
progressive disclosure instead of a bloated system prompt:

1. Every skill is a `SKILL.md` file with frontmatter — its **name** and
   **one-line description** are always visible to the agent (cheap).
2. When the current task matches a description, the agent pulls the skill's
   **full instructions into context** and follows them (accurate).
3. Skills compose: the story workflow is itself built from the planning and
   review skills below.

### The catalog — 13 public skills

**Workflow — the idea-to-PR spine**

| Command | What it does | How it works |
| ------- | ------------ | ------------ |
| `/brainstorm` | Turns a rough idea into a validated spec + implementation plan | Explores intent through clarifying questions, challenges assumptions, then produces the spec — optionally publishing the plan to Linear and isolating a worktree |
| `/writing-plans-linear` | Plans detailed enough for an engineer with zero context | Decomposes the spec into bite-sized tasks (files, code, how to test) and publishes to Linear for team visibility |
| `/story-workflow` | Runs large features as epic + sub-feature brackets | Analyzes once at epic level, writes a bracket file with dependencies, launches each sub-feature as an isolated workflow |
| `/orca-superpowers-workflow` | The end-to-end pipeline in one command | Impact analysis → Linear issue → spec → plan → task DAG → gated execution → verification, auto-activating the Orca bridges at every transition |

**Design — from brief to shipped UI**

| Command | What it does | How it works |
| ------- | ------------ | ------------ |
| `/frontend-design` | UI that reads as intentional, never templated | Approaches each brief like a design lead — grounds the design in the subject before writing a line |
| `/gpt-taste` | Breaks the statistical biases of AI-generated design | Enforces layout randomization, AIDA structure, editorial typography, gapless bento grids, strict GSAP ScrollTriggers |
| `/design-taste-frontend` | Anti-slop review of UI that is already built | Audit-first pass: reads the brief, infers intent, checks the built UI against taste rules contextually |
| `/image-to-code` | One reference image → a real component | Reads the image like an art director (hierarchy, spacing, tokens), then produces code against it as a fidelity target |
| `/mock-prototype` | Three HTML design directions to pick from | Drafts 3 directions, hosts each on an unlisted link, waits for your pick, polishes the chosen one |
| `/web-design-guidelines` | 105 concrete web interface rules, enforced in code | Heuristic engine (vendored from vercel-labs, MIT) covering accessibility, focus, forms, animation, layout |

**Reference & tooling**

| Command | What it does | How it works |
| ------- | ------------ | ------------ |
| `/figma-orientation` | Routes any Figma task to the right skill or MCP call | Loads first on Figma work, reads what you actually want, then routes — before you guess wrong |
| `/graph-engineering` | Knowledge graphs + agent orchestration, taught with examples | Ontology design, entity extraction, GraphRAG, parallel fan-out, verifier separation, the stop rule |
| `/prompt-master` | One production-ready prompt for the tool you name | Extracts real intent, identifies the target tool, outputs a single optimized prompt with zero wasted tokens |

## 🔀 Inherited from Orca (kept intact)

- **Parallel worktrees** — fan one prompt across agents, merge the winner
- **Terminal splits** — every agent gets a real terminal
- **GitHub & Linear, native** — issues, PRs and story tracking built in
- **SSH worktrees · design mode · AI-diff annotation · drag-files-to-agents**
- **Mobile companion** — steer agents from your phone

Full feature wall: [upstream README](https://github.com/stablyai/orca#features).

## 🌿 Branches

| Branch      | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `wakii-dev` | **default — Wakii development happens here**                            |
| `main`      | mirrors `stablyai/orca` main, auto-synced daily by GitHub Action        |

## 🖼️ The product

<table>
<tr>
<td width="50%"><img src=".github/assets/hero.png" alt="Wakii landing page" width="100%" /><p align="center"><sub><b>Landing</b> — wakii.dev</sub></p></td>
<td width="50%"><img src=".github/assets/skills.png" alt="Wakii skills catalog" width="100%" /><p align="center"><sub><b>Skills catalog</b> — cell by cell</sub></p></td>
</tr>
</table>

## 🚀 Developing

```bash
pnpm install
pnpm dev        # desktop dev build
```

Full guide: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). The
mobile↔desktop relay lives in [`cloud/`](cloud/README.md) with its own setup
guide.

## 📄 License

MIT — same as upstream Orca. The bundled story-team kit originates from
[superpowers](https://github.com/obra/superpowers) (MIT) by Jesse Vincent.

## 👥 Contributors

- **HoiVu** — author / product owner
- **Claude** (Anthropic) — AI coding agent
- **Kiro** (AWS) — AI coding agent
- Upstream: [stablyai/orca](https://github.com/stablyai/orca/graphs/contributors) contributors
