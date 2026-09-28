# The `.wakii` mindmap file format (schema v1)

A `.wakii` file is a JSON snapshot of a story's graph: progress (epic → SF → task),
logic (steps chained by `flows-to`), and impact (areas/files an SF touches). The kit
bin `story-mindmap` generates it from sources that already exist — the story bracket,
the SF context packs, the orchestration task list, and `story-impact` — and the Wakii
app renders it read-only in the floating-workspace viewer tab. Everything an external
agent needs to parse or produce one is in this document; reading app code is not
required.

## Two different things named "wakii"

- **A `*.wakii` file** — the mindmap snapshot described here. It lives under
  `docs/superpowers/mindmaps/` and is committed next to the bracket as an audit trail
  on the story's destination branch.
- **The `/.wakii/` directory** at a repo root — the session-memory store written by
  `story-checkpoint` (gitignored; see `.gitignore`). Same name, unrelated concept:
  never read story mindmaps from it and never write mindmaps into it.

## File naming and location

- Canonical output path: `docs/superpowers/mindmaps/<story-slug>.wakii`, where
  `<story-slug>` is the last path segment of the story's `Destination:` line
  (e.g. `Destination: story/vu-14-mindmap-viewer` → `vu-14-mindmap-viewer.wakii`).
- The kit bin accepts an explicit `--out <path>`, but story tooling should keep the
  canonical name so consumers can derive the path from the bracket alone.

## Single-writer topology

`story-mindmap` (kit bin) is the **only** writer. The app is read-only: its viewer
decodes and renders, it never saves, re-generates, or edits (spec §8 non-goals).
Regeneration is idempotent — same inputs produce a byte-identical file, and the bin
skips the write when the payload is unchanged. Human edits to structure/knowledge
nodes are allowed on the destination branch (the next regen overwrites them; per-field
ownership lands with the `.wakii`-canonical milestone, story VU-14 SF-5).

## Schema v1

```jsonc
{
  "wakiiMindmap": 1,                  // magic + schema version, must be exactly 1
  "meta": {
    "story": "VU-14 — mindmap.wakii …",  // required, non-empty
    "generatedAt": "2026-09-27T13:00:00Z", // required, non-empty (ISO-8601)
    "generator": "story-mindmap 1.0.0",    // required, non-empty
    "epic": "VU-14", "linear": "VU-14", "dest": "story/…",
    "summary": "…", "phases": ["…"]
  },
  "nodes": [ /* see below; ≥1 node with kind "epic" required */ ],
  "edges": [ { "from": "epic", "to": "sf-1", "rel": "contains" } ],
  "evidence": [ { "node": "sf-1", "summary": "…", "ref": "path/or/pointer" } ],
  "decodeWarnings": ["…"]             // produced by the generator's fail-open passes
}
```

Node kinds and their fields (`id`, `kind`, `title` are required on every node):

| kind | meaning | typical extra fields |
|---|---|---|
| `epic` | the story's central disc; id is expected to be `epic` | `state` |
| `sf` | a sub-feature | `tier` (orbit ring, 0 = innermost), `linear`, `state` |
| `task` | one plan task under an SF | `parent`, `state` |
| `step` | one mechanism sentence from the Spec slice | `parent`, `detail` |
| `area` | reverse-import impact area (computed) | `computed: true` |
| `file` | a touched file; `title` is the repo-relative path | `path`, `computed` |

`state` ∈ `pending | in-progress | done | blocked | complete` (`complete` is the
decoder's derived epic state). Edge `rel` ∈ `contains | depends-on | flows-to |
impacts | writes`. `parent` is a convenience pointer; the `contains` edge wins on
conflict.

## Decoder rules (the contract every consumer implements)

Input is untrusted: cap the file at 5 MB **before** reading, then plain `JSON.parse`.

INVALID — reject the whole file (surface `error.code = "schema"`, never a partial
render):

- magic missing or `wakiiMindmap !== 1`, or any required `meta` field missing/empty
- any node missing `id`/`kind`/`title`, any edge missing `from`/`to`/`rel`
- duplicate node id, edge endpoints pointing at ids that never existed (dangling),
  self-loop edges

DROP + append to `decodeWarnings` — forward-compat, the rest of the file stays valid:

- unknown enum values (`kind`/`rel`/`state`) → drop that node or edge
- edges/`parent` pointing at a dropped node → drop them along with it
- dangling `parent` that never matched any id is INVALID; a `parent` that only
  disagrees with the `contains` edge is NOT invalid — the edge is the truth

The app's own open path (`src/main/ipc/wakii-documents.ts`) performs only the
required-field table above before pushing the payload to the renderer; enum values
and graph references degrade inside the viewer (unknown kinds fall out of the kind
filter, dangling edges fall out of visibility). A file that fails any required-field
check reaches the renderer as `{ path, error: { code: 'io' | 'schema' | 'too-large',
message } }` and renders the viewer's error card — never a half-drawn graph.

## How the app opens one

The OS hands the file over (double-click via the file association, or "Open With"):
main reads + caps + validates it, keeps the dedupe map of `path → content hash`, and
pushes the decoded payload to the renderer over `ui:openWakiiFile` (batch pull via
`ui:consumePendingWakiiFileOpens` for cold starts). Re-opening the same path with
identical content is a no-op; changed content refreshes the existing tab.

## Platform association notes

- **mac dmg**: a `fileAssociations` entry for the `.wakii` extension with
  `rank: Owner` — a brand-new format, so Wakii is the default handler from first
  install.
- **Windows NSIS**: `Orca.WakiiMindmap` ProgID written to `Software\Classes\.wakii`
  (set-default is deliberate for a new format, unlike the additive `.md` handling),
  symmetric register/unregister macros + `SHChangeNotify`.
- **Linux deb/rpm**: new MIME type `application/vnd.wakii-mindmap` + glob override
  registered by `after-install.sh` (`update-mime-database`); the desktop entry alone
  cannot reference an unregistered type.
- **Linux AppImage limitation**: no post-install script runs, so no system MIME
  registration happens. Open `.wakii` files by dragging the file onto the app or via
  the app's own open flow; double-click association does not exist for AppImage.
