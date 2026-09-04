---
name: figma-orientation
description: Router skill for working with Figma. Maps user intent to the right official Figma skill (figma-implement-design, figma-use, figma-generate-*, figma-code-connect, etc.) and to direct MCP tool calls. Load this BEFORE guessing which Figma skill to use — prevents calling use_figma without figma-use (common hard-to-debug failure) and routes design-to-code vs code-to-design correctly. Project-agnostic.
disable-model-invocation: false
---

# Figma Orientation — Intent → Skill Router

This is a **router**. It does NOT duplicate the official Figma skills' content — it maps your intent to the right skill or direct MCP tool call. Always load this first when a Figma task appears, then load the routed skill.

## Auth prerequisite

Figma MCP is authenticated via the running session (verified `mcp__figma__whoami`). If a Figma tool returns auth/permission error, call `mcp__figma__whoami` to re-check which plan/seat you have. Two plans seen: personal starter + FRT DX PMO pro.

## Decision tree — pick the skill

### Q1: Is the task a Figma CANVAS WRITE (create/edit/delete nodes, tokens, components, auto-layout)?
- **YES → MUST load `figma-use` FIRST**, then call `use_figma`. NEVER call `use_figma` directly without `figma-use` loaded — this is a documented hard-to-debug failure mode.
- Sub-router:
  - Translating an app page/view/multi-section layout INTO Figma from code or description → also load `figma-generate-design` (it teaches WHAT sections to build; figma-use teaches HOW to call the API).
  - Building/updating a design system in Figma (variables, tokens, component library, light/dark theming) → also load `figma-generate-library`.
  - FigJam canvas (boards, stickies, shapes, connectors) → also load `figma-use-figjam`.

### Q2: Is the task FIGMA → CODE (implement a design)?
- **YES → `figma-implement-design`**. Translates Figma files to production code with 1:1 visual fidelity. Triggers: "implement design", "generate code", "build component matching Figma", or a Figma URL.
- Project-specific: also load `image-to-code` for elite-quality component code (pixel-accurate, reusable).

### Q3: Is the task CODE → FIGMA (push existing code/UI into Figma)?
- **YES → `figma-generate-design`** (alongside `figma-use`). Discovers design-system components from Code Connect files + existing screens + library search, then assembles views section-by-section using design tokens instead of hardcoded values.

### Q4: Is the task a DIAGRAM (architecture, ERD, flowchart, sequence, gantt, state, workflow)?
- **YES → MUST load `figma-generate-diagram` FIRST**, then call `generate_diagram`. It routes to type-specific guidance and tells you when a different diagram type fits better (or when the tool isn't the right fit).

### Q5: Is the task CODE CONNECT (map Figma components ↔ code components)?
- **YES → `figma-code-connect`**. Creates/updates `.figma.ts`/`.figma.js` mapping files. Use for design-to-code translation setup, design system reconciliation, component library binding.

### Q6: Need a NEW BLANK FILE before doing anything?
- **YES → `figma-create-new-file`** (`/figma-create-new-file [design|figjam] [fileName]`). Handles plan resolution via whoami. Required before `use_figma` if no target file exists.

### Q7: Project-specific design rules / conventions for Figma-to-code?
- **YES → `figma-create-design-system-rules`**. Generates custom design-system rules for the user's codebase (project-specific conventions).

### Q8: SwiftUI / iOS translation?
- **YES → `figma-swiftui`** (Figma ↔ SwiftUI).

### Q9: Motion / animation translation?
- **YES → `figma-implement-motion`** (Figma motion specs → code animations).

### Q10: Slides?
- **YES → `figma-use-slides`** (Figma Slides context).

## Direct MCP tool calls (no skill needed)

These READ operations can be called directly without loading a skill — they are safe (no `use_figma` write-path trap):

| Tool | Use for |
|------|---------|
| `mcp__figma__whoami` | Re-check auth / plan / seat |
| `mcp__figma__get_metadata` | Top-level page list or node tree metadata (IDs, types, names, positions, sizes) |
| `mcp__figma__get_design_context` | Full context of one node (layers, components, tokens, layout) — **primary design-read tool** |
| `mcp__figma__get_screenshot` | Screenshot a node (PNG/JPEG) for visual reference |
| `mcp__figma__get_variable_defs` | Design tokens (colors, spacing, typography) → CSS variables |
| `mcp__figma__get_libraries` | List design-system libraries available |
| `mcp__figma__get_figjam` | Read FigJam board content |
| `mcp__figma__list_file_components_for_code_connect` | List components (Code Connect setup prep) |
| `mcp__figma__get_code_connect_map` | Read existing Code Connect mappings |
| `mcp__figma__get_code_connect_suggestions` | Suggestions for Code Connect mapping |
| `mcp__figma__list_shader_effects` / `list_shader_fills` | Shader resources |

## Hard rules (do not violate)

1. **`use_figma` REQUIRES `figma-use` loaded first.** No exceptions. This is the #1 Figma failure mode.
2. **`generate_diagram` REQUIRES `figma-generate-diagram` loaded first.** Routes to type-specific guidance.
3. **Do NOT call write tools (use_figma, create_new_file, upload_assets) without confirming target file + scope with the user** — writes are visible to teammates and hard to undo silently.
4. **If a Figma URL contains a node-id** (`?node-id=1-2`), extract it and pass as `nodeId` (format `1:2`) to metadata/design-context calls for scoped reads.
5. **`design` URL path only** — these tools do NOT support `/board/` (FigJam) or `/slides/` paths. Use `get_figjam` for FigJam.

## Common confusions (resolved)

| Wrong intuition | Correct route |
|-----------------|---------------|
| "I'll just call use_figma to read this node" | Use `get_design_context` or `get_metadata` directly — no skill needed for reads |
| "figma-implement-design vs figma-design-to-code — what's the diff?" | `figma-implement-design` is the current canonical name; both translate Figma→code. Use `figma-implement-design`. |
| "I want to push my React component to Figma" | That's CODE→FIGMA → `figma-generate-design` (+ `figma-use`), NOT `figma-implement-design` (that's the other direction). |
| "Build a design system" | `figma-generate-library` (WHAT to build) + `figma-use` (HOW to call API). Load both. |
| "Map my Button.tsx to Figma Button" | `figma-code-connect` (creates `.figma.ts` mapping). |

## Quick reference card

```
READ Figma         → get_metadata / get_design_context / get_screenshot  (no skill)
WRITE Figma canvas → figma-use  (MANDATORY)  [+ figma-generate-* for composed tasks]
FIGMA → CODE       → figma-implement-design  [+ image-to-code for elite quality]
CODE → FIGMA       → figma-generate-design  + figma-use
DIAGRAM            → figma-generate-diagram  (MANDATORY before generate_diagram)
CODE CONNECT       → figma-code-connect
NEW FILE           → figma-create-new-file
DESIGN RULES       → figma-create-design-system-rules
SWIFTUI            → figma-swiftui
MOTION             → figma-implement-motion
SLIDES             → figma-use-slides
FIGJAM canvas      → figma-use-figjam  (+ figma-use foundation)
```

## When this router is wrong

If your task genuinely doesn't fit any branch above, OR an official skill's description has changed (Figma plugin updates frequently), read the actual SKILL.md:
```
find ~/.claude/plugins/cache/claude-plugins-official/figma -name "SKILL.md" | xargs grep -l "<keyword>"
```
Then update this router to match. Do NOT guess — load the actual skill and follow its contract.
