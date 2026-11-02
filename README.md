<h1 align="center">
  <a href="#"><img src="resources/build/icon.png" alt="Wakii" width="64" valign="middle" /></a> Wakii
</h1>

<p align="center">
  <strong>The IDE you rent a team for.</strong><br/>
  A multi-agent desktop IDE where a captain and six specialist workers take a feature
  from impact analysis to merged code — in parallel worktrees, with verify gates between every stage.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
</p>

---

Wakii is a fork of [Orca](https://github.com/stablyai/orca) rebranded and extended with a
**team workflow**: instead of one agent chatting in a sidebar, you hire a crew. A **captain**
takes your feature idea, runs it through a gated pipeline with specialist workers, and only
code that passes the verify gate reaches your integration branch.

## Pipeline

Every feature moves through the same five-stage pipeline. Each stage ends in a gate — work
that fails the gate does not advance.

| Stage           | What happens                                                                         | Gate                                                     |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Impact**      | Phase-0 analysis: problem framing, touch map, second-order effects, blast radius     | Direction reviewed before any code                       |
| **Mindmap**     | The feature is structured as an epic bracket with sub-features (SF) and dependencies | Plan approved by captain                                 |
| **Design**      | UI direction becomes a design-spec mapped to the design system (tokens, primitives)  | Design approved                                          |
| **Spec + Test** | Spec slices per sub-feature; acceptance tests written against real baselines         | Spec + tests reviewed                                    |
| **Build**       | Workers implement in isolated worktrees, committing atomically                       | Verify gate: typecheck, tests, verify script — all green |

## Roster

The crew is six specialist workers coordinated by one captain. Workers never talk to you
directly — the captain triages, dispatches, and reports.

| Role        | Job                                                              |
| ----------- | ---------------------------------------------------------------- |
| **captain** | Receives your feature, runs the pipeline, owns gates and reviews |
| **smith**   | Backend / systems implementation                                 |
| **weaver**  | Frontend implementation against the design system                |
| **forge**   | DevOps, CI/CD, packaging, release engineering                    |
| **mason**   | Tests first: characterization tests, fixtures, acceptance gates  |
| **scout**   | Research: codebase exploration, external landscape scans         |
| **warden**  | Review and verification — the independent gate before merge      |

## Kit

The team ships with a versioned kit of reusable capability:

- **9 skills** — workflow skills (story workflow, brainstorming, planning, design prototyping, …)
- **19 agents** — the roster above plus support agents, each with a narrow tool surface
- **70 bins** — executable helpers: verify gates, watchdogs, dispatch tooling

Kit contents are counted from the live manifest (`kit.json`, 98 provides total) — the same
numbers the runtime enforces.

## Quickstart

```sh
git clone https://github.com/wakii-dev/wakii
cd wakii
pnpm install
pnpm dev
```

Run your first team session: open the chat panel, describe a feature for the captain, and
approve the plan it brings back. The captain dispatches workers, you approve at gates, and
merged code lands in your integration branch with the full verify battery behind it.

For development on Wakii itself: `pnpm test` runs the unit suite (native rebuild included),
`pnpm tc` typechecks, and `pnpm run check:code-quality:changed` lints your diff.

## Tiếng Việt (tóm tắt)

**Wakii** là IDE desktop đa-agent: bạn "thuê một team" thay vì chat với một agent. Một
**captain** nhận feature của bạn và chạy qua **pipeline 5 stage** — impact → mindmap →
design → spec+test → build — mỗi stage đóng bằng một **gate duyệt**; code không qua gate
không bao giờ tới nhánh tích hợp. Đội hình gồm 6 worker chuyên trách (**smith** backend,
**weaver** frontend, **forge** DevOps/release, **mason** test-first, **scout** research,
**warden** review độc lập) do captain điều phối. Team đi kèm **kit**: 9 skills, 19 agents,
70 bins. Cài nhanh: clone repo → `pnpm install` → `pnpm dev`, mở chat panel, mô tả feature
cho captain và duyệt plan.

## License

MIT — inherited from the upstream [Orca](https://github.com/stablyai/orca) project.
