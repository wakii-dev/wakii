# VU-14 SF-4 — Manual checklist (run at RELEASE BUILD time only)

Not a story gate. Every step below needs a real packaged build — installer or dmg —
because file associations live in the packaging layer, not in dev runs. Fixtures: any
valid `*.wakii` (regenerate with `story-mindmap --bracket <file> --out <path>`), plus
one corrupt file (e.g. truncate a valid one mid-JSON) and one >5 MB file.

## macOS (dmg, x64 + arm64)

| # | Step | Expected |
|---|---|---|
| M1 | Install the dmg, double-click a valid `.wakii` in Finder | Wakii opens (default handler — format has no incumbent, `rank: Owner`) with the mindmap tab in the floating workspace |
| M2 | In Finder: Get Info → "Open with" on the `.wakii` | Wakii listed as default; other apps still offered under "Open With" |
| M3 | Double-click the corrupt `.wakii` | Error card in the viewer tab (`error.code = schema`) + failure toast; no half render |
| M4 | Double-click the >5 MB `.wakii` | Error card (`error.code = too-large`); app stays responsive |
| M5 | Double-click any `.md` file | The user's existing `.md` handler opens it — Wakii must NOT have become the `.md` default (steal check; markdown claims `rank: Alternate`) |
| M6 | Double-click the same valid `.wakii` twice | Second open focuses/keeps the existing tab (content-hash dedupe), no duplicate tab |

## Windows (NSIS)

| # | Step | Expected |
|---|---|---|
| W1 | Install, double-click a valid `.wakii` in Explorer | Wakii opens as default handler (`Software\Classes\.wakii` → `Orca.WakiiMindmap`; set-default is deliberate for a new format) |
| W2 | Explorer → right-click `.wakii` → Open with | `Orca.WakiiMindmap` offered; choosing "Always" keeps Wakii |
| W3 | Double-click the corrupt / >5 MB fixtures | Same error-card surfaces as M3/M4 |
| W4 | Double-click an `.md` file | Existing `.md` association untouched (markdown registration is additive "Open with" only) |
| W5 | Uninstall the app | `Software\Classes\.wakii` key + ProgID removed (symmetric unregister macro); `SHChangeNotify` fired so Explorer refreshes without a reboot |
| W6 | Upgrade-install over a previous version | Association still resolves (customInstall rewrites; the daemon-sweep `${isUpdated}` block is not disturbed) |

## Linux deb/rpm

| # | Step | Expected |
|---|---|---|
| L1 | Install the deb (or rpm), double-click a valid `.wakii` in the file manager | Wakii opens as handler for `application/vnd.wakii-mindmap` (type + glob registered by `after-install.sh`, `update-mime-database` refreshed) |
| L2 | `xdg-mime query default application/vnd.wakii-mindmap` | Returns the Wakii desktop entry (`orca-ide`) |
| L3 | Double-click `.md` | Default text/markdown handler unchanged (Wakii joins "Open With" via the shared `text/markdown` type, never claims the default) |
| L4 | Uninstall | MIME type + glob registration removed with the package |

## Linux AppImage (limitation — documented, not fixable)

| # | Step | Expected |
|---|---|---|
| A1 | Run the AppImage; drag a `.wakii` file onto the app window | File opens in the viewer (drag-drop path) |
| A2 | Double-click a `.wakii` in the file manager | No association exists — AppImage has no post-install step, so no MIME registration (docs/reference/wakii-mindmap-format.md "Platform association notes"); "Open With" pointing at the AppImage binary is the manual workaround |
