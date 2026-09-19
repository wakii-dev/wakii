# Orca Superpowers Launcher

An **Orca app plugin** (`pluginApi` 1) that adds a **Panel + Commands** to drive the `orca-superpowers-workflow` skill from the focused worktree's terminal.

It is a **control deck**: every button types a prompt into the terminal, and the agent there does the real work (runs the skill, prints progress, resolves gates). The plugin itself runs no skill logic and reads no workflow state.

## Identity
- `publisher.id` = `stablyai.orca-superpowers-launcher` (đổi từ `local.superpowers-launcher` khi bundle built-in — bundled plugin bắt buộc identity official `stablyai.orca-*`)
- `version` = `1.6.0`
- `engines.orca` = `>=1.4.0`, `pluginApi` = 1 (EXPERIMENTAL)

## Built-in trong build Wakii (bundle)
Plugin + story-team-kit được đóng gói sẵn vào build Wakii (orca fork):

- `resources/plugins/launch/stablyai.orca-superpowers-launcher/` — plugin + `kit/` vendored
- `resources/plugins/launch/bundled-plugins.json` — index kèm contentHash (`orca-plugin-tree-v1`)
- Khi Wakii khởi động, `bootstrapBundledPlugins` tự cài plugin; worker `installKit()`
  tự chép kit (skills/agents/bin CLIs) vào `~/.claude/` — idempotent theo version
  marker `.story-team-kit-version`, KHÔNG đè skill/CLI ngoài kit.
- Fork bật `pluginSystemEnabled: true` mặc định; consent plugin vẫn duyệt 1 lần.

**Update plugin/kit rồi build lại:**

```bash
./bundle-into-orca.sh [đường-dẫn-orca]   # sync kit → copy → rehash → verify
# sau đó commit repo orca (resources + index) rồi build
```

`sync-kit.sh` riêng chỉ vendor kit từ `../story-team-kit` vào `kit/`.

## Why a control deck (not a dashboard)
The Orca panel→worker bridge is a **closed transport**: a sandboxed panel iframe can only call three host actions — `workspace.readContext`, `terminal.sendText`, `notifications.show` (see Orca's `plugin-host-api.js`, `PLUGIN_PANEL_ACTIONS`). On top of that, the panel shell injects `connect-src 'none'` CSP, so `fetch`/`XHR`/`WebSocket` to any origin is blocked. There is no route from the panel to plugin-registered commands or to the filesystem. All visualization happens **in the terminal via the agent**; this plugin only sends it the right prompts.

## v1.3 architecture: policy in the skill, opt-in in the prompt
To keep composed prompts well under Orca's `terminal.sendText` 4096-byte limit, directives are split by nature:

| Layer | Where it lives | Examples |
|-------|----------------|----------|
| **Policy** (always-on rules) | `orca-superpowers-workflow` SKILL.md as Principles | Linear audit log (Principle 7), Figma Design Verification (Principle 8), Autonomous self-review (Principle 3) |
| **Opt-in** (per-run toggles) | `directives.json` → inlined in prompt | Polish (prompt-master), Simplify, Plan-only, Quick-fix, Subagents |
| **Tokens** (toggle skill-side policy) | short literals in prompt | `audit-log: off`, `Autonomous mode: ON.` |

Result: worst-case prompt went from ~5035 bytes (over limit → `invalid_params`) to ~949 bytes (start) / ~1128 bytes (plan-only), ~75% headroom.

The tokens are the **only wire** between the panel and skill-side Principles. The coupling is documented 2-sided: SKILL.md Principle 3/7 carries an "Activation contract" / "Opt-out" note naming the exact token + json key; `directives.json` carries a `_token_coupling` key naming each Principle. If either end renames, the trail is visible at the point of edit.

## What it contributes
- **Panel** "Superpowers" (activity bar icon `zap`) — 3 intent radios + 6 mode checkboxes + 3 Other actions.
- **Commands** (command palette): Start / Plan / Quick Fix / Continue Plan / Resume / Print Status / Resolve Gate.

### Intent radios (cascade)
| Intent | Field | Behavior |
|--------|-------|----------|
| **New feature** | idea (textarea, markdown) | full Phase 0-5; empty idea → agent auto-loads plan; plan path pasted → continue that plan |
| **Continue work** | hint in idea field | empty → agent lists plans and asks; plan path → continue; prose → resume |
| **Quick fix** | idea (textarea) | skip Phase 0/1/2/3 — no Linear issue, no brainstorm, no plan |

### Mode checkboxes
| Mode | Default | Token / directive |
|------|---------|-------------------|
| Autonomous | OFF | `Autonomous mode: ON.` (activates SKILL Principle 3) |
| Refine idea (prompt-master) | ON | `POLISH_DIRECTIVE` |
| Simplify code | ON | `SIMPLIFY_DIRECTIVE` |
| **Linear audit log** | ON | opt-out emits `audit-log: off` (toggles SKILL Principle 7) |
| Plan only | OFF | `PLAN_ONLY_DIRECTIVE` (STOP at PLAN READY) |
| Subagents (multi-dim analysis) | 1 | `SUBAGENT_DIRECTIVE` (1-10) |

### Other actions
| Action | Field | Prompt |
|--------|-------|--------|
| Show current status | — | LOAD_CONTEXT + `summarize current workflow state` |
| Resolve a gate | gate id + resolution (approved/rejected) | LOAD_CONTEXT + `Resolve gate <id> as <resolution> via: orca orchestration gate-resolve ...` |
| Jump to phase | phase (Init/Spec/Plan/Exec/Done) | LOAD_CONTEXT + resume with `continue from <phase> phase` |

## Figma integration
Auto-detect: any `figma.com/(design|file|proto|board)/` URL in the feature description triggers SKILL.md Principle 8 (Design Verification) — 6 steps: verify content → diff vs codebase → component map → file structure → image-to-code → UX review. No manual checkbox; the URL is the signal.

## Directives baked into the prompts
- **LOAD_CONTEXT** (resume/status/gate/continue): forces the agent to read durable state (`orca orchestration run-current/task-list/gate-list`) before acting, instead of relying on conversation memory that may be empty after a restart or compaction. Includes "If context is incomplete or ambiguous, ask me before proceeding."
- **POLISH_DIRECTIVE** (when Refine idea checked): invoke `prompt-master` to sharpen the raw idea into a feature brief before the workflow.
- **SIMPLIFY_DIRECTIVE** (default ON): after each Phase 4 task, invoke `simplify` on changed code.
- **SUBAGENT_DIRECTIVE** (when subagents > 1): spawn N read-only subagents, one per analysis dimension, synthesized into Phase 0 / Phase 4 gate.

Directive strings are mirrored in `directives.json` (single source of truth), `panel.html` (inlined — CSP blocks fetch), and `main.mjs`. `build-directives.mjs` is the validator: run `node build-directives.mjs` to verify panel.html stays byte-identical to `directives.json`.

## Capabilities (consented at install)
- `workspace:read` — read branch + terminal list of the focused worktree
- `terminal:send` — type the prompt into a specific terminal
- `notifications:show` — desktop toasts

## Install (local folder)
1. In the Orca app, open the plugin/add-on flow.
2. Point it at this folder: `/Users/mac/Documents/local.superpowers-launcher`. **Select the folder itself** — not its parent and not the `orca-plugin.json` file.
3. Consent to the three capabilities above.
4. The "Superpowers" panel appears in the activity bar; the seven commands appear in the command palette.

**Reinstall after any edit.** Orca stores plugin content by content-hash under `~/Library/Application Support/orca/plugins/<id>/`; the install flow re-hashes and updates the `current` pointer. Editing source files does **not** update the running plugin.

## Files
- `orca-plugin.json` — manifest v1 (v1.3.0); 1 panel + 7 commands
- `main.mjs` — worker; host-API-only (no CLI spawn), 7 registered commands, imports directives from `directives.json`
- `panel.html` — sandboxed UI; postMessage bridge, cascade combo, inline directive constants
- `directives.json` — single source of truth for opt-in directives + tokens
- `build-directives.mjs` — validator (panel.html ↔ directives.json byte-equality)
- `README.md` — this file
- `kit/` — story-team-kit vendored bởi `sync-kit.sh` (bundle built-in; `main.mjs` installKit tự chép vào `~/.claude/`)
- `sync-kit.sh` — vendor kit từ `../story-team-kit` vào `kit/`
- `bundle-into-orca.sh` — đóng gói plugin+kit vào `orca/resources/plugins/launch/` (sync → copy → rehash → verify)
- `scripts/hash-plugin.cjs` — content hash `orca-plugin-tree-v1` (cùng thuật toán với verifier của orca)
- `FEATURE-REQUEST-panel-filesystem.md` — deferred request to Orca (loosen panel CSP for loopback); see `## Caveats`

## Caveats
- `pluginApi` 1 is **EXPERIMENTAL**; the plugin may break on future Orca versions. The `engines.orca` gate enforces a minimum.
- The plugin does **not** run skill logic — it types prompts into a terminal. Whether the agent auto-invokes the skill depends on the agent. If it doesn't, switch the prompt to a `/orca-superpowers-workflow` slash invocation (for Claude Code TUI).
- No event handlers in this version (no auto worktree→Linear linking). Can be added later via `contributes.events`.
- The policy Principles (7/8/3) live in the companion skill `orca-superpowers-workflow` at `~/.claude/plugins/marketplaces/orca-superpowers-bridges/.../orca-superpowers-workflow/SKILL.md`. That marketplace is `directory`-source, so SKILL.md edits are persistent and won't be overwritten. If you rename a Principle or change its trigger phrase, update the matching token in `directives.json` (the trail is documented at both ends).
- `FEATURE-REQUEST-panel-filesystem.md` is on hold until Orca loosens the panel CSP (`connect-src 'none'`). Once shipped, a worker-side data layer + panel dropdown could replace the agent-side auto-load pattern.
