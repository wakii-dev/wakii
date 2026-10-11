<div align="center">
  <img src=".github/assets/wakii-banner.svg" width="100%" alt="Wakii — the agentic IDE with a built-in superpowers team" />
</div>

<p align="center">
  <a href="https://wakii.xyz"><img src="https://img.shields.io/badge/web-wakii.xyz-45E0A8?logo=safari&logoColor=45E0A8" alt="wakii.xyz" /></a>
  <img src="https://img.shields.io/badge/10-agents-C026D3?style=flat" alt="10 agents" />
  <img src="https://img.shields.io/badge/14-public%20skills-8b5cf6?style=flat" alt="14 public skills" />
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="macOS, Windows, Linux" />
</p>

<p align="center">
  <a href="https://wakii.xyz"><b>Website</b></a> ·
  <a href="https://wakii.xyz/docs/getting-started/">Docs</a> ·
  <a href="https://wakii.xyz/skills/">Skills</a> ·
  <a href="https://wakii.xyz/roadmap/">Roadmap</a> ·
  <a href="https://github.com/wakii-dev/wakii/releases">Download</a> ·
  <a href="https://github.com/stablyai/orca">Upstream: stablyai/orca</a>
</p>

---

Wakii is a fork of [Orca](https://github.com/stablyai/orca) (MIT) — the AI
orchestrator that runs Codex, Claude Code, OpenCode, Pi and **any other CLI
agent** side-by-side, each in its own isolated git worktree.

On top of that base, Wakii ships a complete **agentic workflow kit** that
installs itself on first run — no setup, enabled by default.

## 🖼️ The product

<picture>
  <source srcset="docs/assets/feature-wall/mobile-companion-app-showcase.gif" type="image/gif">
  <img src="docs/assets/feature-wall/mobile-companion-app-showcase.jpg" alt="Wakii — desktop agents steered from mobile" width="100%" />
</picture>

**One prompt in, a reviewed PR out** — agents run in parallel worktrees while you
watch, steer, and merge from the app or your phone.

### At a glance

| | Feature | One-liner | Docs |
| - | ------- | --------- | ---- |
| 🪟 | **Parallel worktrees** | fan one prompt across five agents, merge the winner | [→](https://wakii.xyz/docs/worktrees) |
| ⌨️ | **Terminal splits** | Ghostty-class, WebGL, scrollback survives restarts | [→](https://wakii.xyz/docs/terminal) |
| 🎨 | **Design mode** | click any UI element → HTML, CSS + screenshot into the prompt | [→](https://wakii.xyz/docs/design-mode) |
| 🔀 | **GitHub & Linear** | PRs, issues, boards — open a worktree from any task | [→](https://wakii.xyz/docs/linear) |
| 🌐 | **SSH worktrees** | agents on a beefy remote, auto-reconnect included | [→](https://wakii.xyz/docs/ssh) |
| 💬 | **Annotate AI diffs** | comment any diff line, ship back to the agent | [→](https://wakii.xyz/docs/annotate-ai-diff) |
| 📎 | **Drag files to agents** | drag files or images straight into a prompt | [→](https://wakii.xyz/docs/file-explorer) |
| 📱 | **Mobile companion** | monitor and steer from your phone | [→](https://wakii.xyz/docs/mobile) |
| ⚡ | **Orca CLI** | script every workflow — worktree, snapshot, click, fill | [→](https://wakii.xyz/docs/cli) |

### In motion

<table>
<tr>
<td width="50%">
  <a href="https://wakii.xyz/docs/worktrees"><picture><source srcset="docs/site/public/docs/tab-split.gif" type="image/gif"><img src="docs/site/public/docs/posters/tab-split.jpg" alt="Parallel worktree orchestration" width="100%" /></picture></a>
  <p align="center"><sub><b>Parallel worktrees</b> — five agents, one prompt, merge the winner</sub></p>
</td>
<td width="50%">
  <a href="https://wakii.xyz/docs/design-mode"><picture><source srcset="docs/site/public/docs/orca-design-mode.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-05.poster.jpg" alt="Design mode" width="100%" /></picture></a>
  <p align="center"><sub><b>Design mode</b> — click UI, ship context to the agent</sub></p>
</td>
</tr>
<tr>
<td width="50%">
  <a href="https://wakii.xyz/docs/annotate-ai-diff"><picture><source srcset="docs/site/public/docs/annotate-ai-diff.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-08.poster.jpg" alt="Annotate AI diffs" width="100%" /></picture></a>
  <p align="center"><sub><b>Annotate diffs</b> — comment lines, agent fixes</sub></p>
</td>
<td width="50%">
  <a href="https://wakii.xyz/docs/terminal"><picture><source srcset="resources/onboarding/feature-wall/tile-02.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-02.poster.jpg" alt="Terminal splits" width="100%" /></picture></a>
  <p align="center"><sub><b>Terminal splits</b> — WebGL, infinite, survives restarts</sub></p>
</td>
</tr>
</table>

<details>
<summary><b>More — SSH, drag-files, CLI, mobile</b></summary>

<table>
<tr>
<td width="50%" valign="middle">

### SSH Worktrees

Agents on a beefy remote box — full editing, git, terminals, auto-reconnect.

[Docs →](https://wakii.xyz/docs/ssh)

</td>
<td width="50%">
  <a href="https://wakii.xyz/docs/ssh"><picture><source srcset="resources/onboarding/feature-wall/tile-06.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-06.poster.jpg" alt="SSH worktrees" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Drag Files to Agents

VS Code-class editor, autosave everywhere — drag files or images into a prompt.

[Docs →](https://wakii.xyz/docs/file-explorer)

</td>
<td width="50%">
  <a href="https://wakii.xyz/docs/file-explorer"><picture><source srcset="resources/onboarding/feature-wall/tile-07.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-07.poster.jpg" alt="Drag files to agents" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Orca CLI

Agents drive Orca too — script every workflow.

[Docs →](https://wakii.xyz/docs/cli)

</td>
<td width="50%">
  <a href="https://wakii.xyz/docs/cli"><picture><source srcset="resources/onboarding/feature-wall/tile-09.gif" type="image/gif"><img src="resources/onboarding/feature-wall/tile-09.poster.jpg" alt="Orca CLI" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Mobile Companion

Monitor and steer from your phone — notified when agents finish.

[iOS App Store](https://apps.apple.com/us/app/orca-ide/id6766130217) · [Android APK](https://github.com/wakii-dev/wakii/releases/latest)

</td>
<td width="50%">
  <picture><source srcset="docs/assets/feature-wall/mobile-companion-app-showcase.gif" type="image/gif"><img src="docs/assets/feature-wall/mobile-companion-app-showcase.jpg" alt="Mobile companion" width="100%" /></picture>
</td>
</tr>
</table>

</details>

## ⚙️ How the crew ships

<div align="center">
  <img src=".github/assets/pipeline.svg" width="100%" alt="idea → impact → plan → bracket → parallel SFs → gates → PR" />
</div>

**One specialist per stage — and the checker is never the builder.** The
impact-analyst maps the blast radius before code exists; the spec-critic and
plan-critic attack the spec and the task DAG; task-executors implement
independent sub-features in parallel worktrees; the code-reviewer and
verifier hold the gates (self-reports don't count); the watchdog auto-resumes
anything that stalls.

<details>
<summary><b>The gates (B0–B5) &amp; verdicts</b></summary>

| Gate | Checks |
| ---- | ------ |
| **B0** | Browser test — the agent actually opened the app and walked the flow |
| **B1** | Code + tests pass |
| **B2** | Plan checkboxes ticked |
| **B3** | Independent review done |
| **B4** | Branch merged to the story branch |
| **B5** | Linear issue set to Done |

Verifier verdicts: `COMPLETE` · `READY-TO-DONE` · `INCOMPLETE` ·
`VIOLATION` · `NOT-LAUNCHED`.

</details>

## 🧠 How skills work

Skills are **packaged instruction sets** loaded on demand — progressive
disclosure instead of a bloated system prompt: name and one-line description
stay cheap in context; the **full instructions load only when your task
matches**. Skills compose — the story workflow is itself built from the
planning and review skills below.

<div align="center">
  <img src=".github/assets/skills-chips.svg" width="100%" alt="14 public skills — /command chips by category" />
</div>

<details>
<summary><b>Full catalog — command, what it does, how it works</b></summary>

**Workflow — the idea-to-PR spine**

| Command | What it does | How it works |
| ------- | ------------ | ------------ |
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
| `/computer-use` | Drives a real computer — screen, keyboard, mouse | Grounds the agent in what is actually on screen before acting; screenshots over DOM guesses |
| `/linear-tickets` | Linear ticket ops without the API sprawl | Reads teams, issues and states, creates and updates tickets — the right call per task |
| `/orca-cli` | Drives the Orca IDE from the command line | Worktrees, terminals, browser, notifications — the full surface as composable commands |
| `/orca-emulator` · `/orca-emulator-android` | iOS and Android emulators, scripted | Boots, installs, drives and tears down emulator sessions for mobile verification |
| `/orca-per-workspace-env` | Per-workspace environment setup | Isolates env/config per Orca workspace so agents never share state |

</details>

## ⚡ What the kit adds on top of Orca

| ✨ | Highlight |
| -- | --------- |
| 🤖 | **10-agent story team** — adversarial specialists with checks-and-balances; self-approval never counts as a gate |
| 🧠 | **20 bundled skills** — planning, review, design pipelines, machine-control platform skills |
| 🛠️ | **48 `story-*` CLIs** — gate checks, stall watchdog, preflight, story tests |
| 🔐 | **Permission model** — agents spawn `acceptEdits` (zero bypass), deny-list blocks force-push and protected pushes |
| 👁️ | **Pane-watch HITL relay** — agent approval requests reach you, not the void |
| 🪝 | **Rehash fence** — pre-commit blocks kit commits with stale hashes |
| 🎨 | **HoiVu branding** — rebranded UI, fork-local full plugin access |

## 🔀 Inherited from Orca (kept intact)

<details>
<summary><b>Feature wall</b></summary>

- **Parallel worktrees** — fan one prompt across agents, merge the winner
- **Terminal splits** — every agent gets a real terminal
- **GitHub & Linear, native** — issues, PRs and story tracking built in
- **SSH worktrees · design mode · AI-diff annotation · drag-files-to-agents**
- **Mobile companion** — steer agents from your phone

Full wall with screenshots:
[upstream README](https://github.com/stablyai/orca#features).

</details>

## 🌿 Branches

| Branch      | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `wakii-dev` | **default — Wakii development happens here**                            |
| `main`      | mirrors `stablyai/orca` main, auto-synced daily by GitHub Action        |

## 📦 Download

Builds ship on [GitHub Releases](https://github.com/wakii-dev/wakii/releases)
— unsigned, so right-click → **Open** on first launch (or allow it in
System Settings → Privacy & Security):

| Machine       | Asset                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Apple Silicon | [Wakii-1.4.222-arm64.dmg](https://github.com/wakii-dev/wakii/releases/download/v1.4.222/Wakii-1.4.222-arm64.dmg)                  |
| Intel         | [Wakii-1.4.222-x64.dmg](https://github.com/wakii-dev/wakii/releases/download/v1.4.222/Wakii-1.4.222-x64.dmg)                      |
| Android       | [app-release.apk](https://github.com/wakii-dev/wakii/releases/download/v1.4.222/app-release.apk)                    |
| Windows       | [orca-windows-setup.exe](https://github.com/wakii-dev/wakii/releases/download/v1.4.222/orca-windows-setup.exe)                     |

Build from source ([guide](#-developing)) works everywhere.

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

<div align="center">
  <img src=".github/assets/contributors.svg" width="100%" alt="Contributors: HoiVu — author; Claude (Anthropic) — AI coding agent; Kiro (AWS) — AI coding agent; stablyai/orca — upstream" />
</div>
