# Context pack — FI-380 SF-2: Installer validation + negative tests + mirror

Source spec: `docs/superpowers/specs/2026-09-08-kit-manifest.md` (rev 2 — section 2.3/2.4/2.5/2.6 + 6. Plan notes + 5. ACCEPTANCE). SF-1 đã có: provides[] 49 entries + schema + version 2.2.0 (upstream + vendored synced).

## Spec slice (chỉ phần SF-2)
1. `installKit` refactor (additive): named export `installKit` + injectable root dir (default `~/.claude`).
2. Pre-flight validator — placement **sau JSON.parse, TRƯỚC marker early-return** (validate MỖI activate): (a) schema check tay zero-dep (mọi provides entry đủ field: name/type ∈ skill|agent|bin/inputs array/outputs string/owner; bin chỉ name/type/description), (b) two-way cross-check provides ↔ đĩa (predicate: skills/ = dir có SKILL.md; agents/ = *.md; bin/ = file thường; loại dotfiles + bracket-template.md).
3. Fail path: **notify + block-all** — `notifications:show` fire-and-forget `.catch(() => orca.log(fallback))` + return KHÔNG copy KHÔNG ghi marker (spawn sau retry). Malformed kit.json → notify + block. kit.json không tồn tại → silent no-op (giữ nguyên). KHÔNG throw trong activate.
4. Negative harness `tests/kit-manifest-negative-tests.mjs`: mock orca (capture notifications.show/log) + temp root — 6 cases: thiếu field / entry ảo / xóa file thật / marker cũ + kit mới / malformed JSON / missing kit.json. **KHÔNG BAO GIỜ ghi HOME thật.**
5. Mirror + re-bundle (CUỐI SF-2): mirror main.mjs + README.md + tests/ về launcher repo → chạy bundle-into-orca.sh (rehash bundled-plugins.json) → verify build.
6. `README.md` plugin: sync-kit path đúng + flow source-of-truth.

## Touch map
- `resources/plugins/launch/stablyai.orca-superpowers-launcher/main.mjs` — W (installKit refactor + validator) — CÁC TASK CÙNG FILE CHẠY TUẦN TỰ
- `resources/plugins/launch/stablyai.orca-superpowers-launcher/tests/kit-manifest-negative-tests.mjs` — W (mới)
- `README.md` (plugin) — W nhỏ
- **Launcher repo** (~/Desktop/projects/local.superpowers-launcher): mirror main.mjs + README + tests/ + chạy bundle-into-orca.sh
- KHÔNG đụng: kit.json nội dung (SF-1 owns), orca-plugin.json, panel.html, directives.json

## ACCEPTANCE (tất cả qua harness + temp root)
1. Manifest thiếu field → notify + KHÔNG copy + marker không đổi.
2. Entry ảo → block; xóa file thật (temp copy) → block.
3. Marker 2.1.1 + kit 2.2.0 → re-validate + copy chạy.
4. Malformed JSON → notify + block; missing kit.json → silent no-op.
5. `pnpm build` (bundle) pass sau mirror; installKit named export tồn tại.
6. Real smoke: bản dev build + temp HOME + activate thật → notifications hiển thị trong UI (probe throw behavior ghi evidence).

## Boundary
- KHÔNG throw trong activate. KHÔNG đụng kit.json nội dung. KHÔNG đổi packaging/ thêm npm deps.
- KHÔNG set FI-342... (nhầm story) — KHÔNG set FI-382 Done khi harness chưa xanh 6/6.
