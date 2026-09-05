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

## ⚡ What the kit adds

<table>
<tr>
<td width="50%" valign="top">

### 🤖 The 9-agent story team

Every story run is staffed by nine specialists with adversarial
checks-and-balances — **self-approval never counts as a gate**:

`impact-analyst` → `spec-critic` → `plan-critic` →
`task-executor` → `code-reviewer` → `verifier` →
`security-audit` · `rollback-fixer` · `designer`

[Meet the crew →](https://wakii.dev/docs/agents-and-kit/)

</td>
<td width="50%" valign="top">

### 🧠 20 bundled skills

The skills agents load on demand: brainstorming, writing & executing plans,
code review, story management, design pipelines — plus platform skills that
control your machine and tools.

[Skills catalog →](https://wakii.dev/skills/)

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛠️ 24 `story-*` CLIs

`story-verify` (gate checks) · `story-watchdog` (stall detection) ·
`story-preflight` · `story-test` — the whole story-ops toolbox, installed to
`~/.claude/bin/`.

</td>
<td width="50%" valign="top">

### 🎨 HoiVu branding

Rebranded UI with fork-local full plugin access — every capability of the
upstream app, wired for the Wakii workflow.

</td>
</tr>
</table>

## 🖼️ The product

<table>
<tr>
<td width="50%"><img src=".github/assets/hero.png" alt="Wakii landing page" width="100%" /><p align="center"><sub><b>Landing</b> — wakii.dev</sub></p></td>
<td width="50%"><img src=".github/assets/skills.png" alt="Wakii skills catalog" width="100%" /><p align="center"><sub><b>Skills catalog</b> — 21 skills, cell by cell</sub></p></td>
</tr>
</table>

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
