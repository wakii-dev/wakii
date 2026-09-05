<h1 align="center">
  ⚡ Wakii
</h1>

<p align="center">
  <strong>The agentic IDE with a built-in superpowers team.</strong><br/>
  A <a href="https://github.com/stablyai/orca">Orca</a>-based development environment
  where a crew of nine specialist agents plans, builds, reviews and ships —
  with gates keeping them honest.
</p>

<p align="center">
  🌐 <a href="https://wakii.dev"><b>wakii.dev</b></a> ·
  <a href="https://github.com/wakii-dev/wakii-site">wakii-site</a> ·
  <a href="https://github.com/stablyai/orca">upstream: stablyai/orca</a>
</p>

---

## What is Wakii?

Wakii is a fork of [Orca](https://github.com/stablyai/orca) (MIT) — the AI
orchestrator that runs Codex, Claude Code, OpenCode, Pi and any other CLI
agent side-by-side, each in its own git worktree.

On top of that base, Wakii ships a complete **agentic workflow kit** that
installs itself on first run:

| What                        | Details                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| 🤖 **The 9-agent story team** | impact-analyst · spec-critic · plan-critic · task-executor · code-reviewer · verifier · security-audit · rollback-fixer · designer — adversarial by design, so self-approval never counts as a gate |
| 🧠 **20 bundled skills**      | brainstorming, writing/executing plans, code review, story management, design pipelines, machine-control platform skills — loaded on demand |
| 🛠️ **24 `story-*` CLIs**      | `story-verify` (gate checks), `story-watchdog` (stall detection), `story-preflight`, `story-test` and the rest of the story-ops toolbox |
| 🎨 **HoiVu branding**         | rebranded UI, fork-local full plugin access                                                 |

Learn how the team works: [agents & kit](https://wakii.dev/docs/agents-and-kit/) ·
[story workflow](https://wakii.dev/docs/story-workflow/) ·
[skills catalog](https://wakii.dev/skills/)

## What Orca gives Wakii (kept intact)

- **Parallel worktrees** — fan one prompt across agents, each isolated, merge the winner
- **Terminal splits** — every agent gets a real terminal
- **GitHub & Linear, native** — issues, PRs and story tracking built in
- **SSH worktrees · design mode · AI-diff annotation · drag-files-to-agents**
- **Mobile companion** — steer agents from your phone

Full feature wall and screenshots: [upstream README](https://github.com/stablyai/orca#features).

## Branches

| Branch      | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| `wakii-dev` | **default — Wakii development happens here**                     |
| `main`      | mirrors `stablyai/orca` main, auto-synced daily by GitHub Action |

## Developing

```bash
pnpm install
pnpm dev        # desktop dev build
```

Want the full guide? See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).
The mobile↔desktop relay lives in [`cloud/`](cloud/README.md) with its own
setup guide.

## License

MIT — same as upstream Orca. The bundled story-team kit originates from the
open-source [superpowers](https://github.com/obra/superpowers) project
(MIT) by Jesse Vincent.

## Contributors

- **HoiVu** — author / product owner
- **Claude** (Anthropic) — AI coding agent
- **Kiro** (AWS) — AI coding agent
- Upstream: [stablyai/orca](https://github.com/stablyai/orca) contributors
