# Context pack SF-1 — Schema + sinh file .wakii

## Spec slice
1. Schema `.wakii` v1 (JSON): magic `wakiiMindmap: 1` + `meta{story,epic,linear,dest,generatedAt,generator}` + `nodes[]` (kind: epic|sf|task|step|area|file; state chỉ trên epic/sf/task) + `edges[]` (rel: contains|depends-on|flows-to|impacts|writes) + `evidence[]`.
2. Luật decoder: bắt buộc = wakiiMindmap + meta.story + meta.generatedAt + meta.generator + ≥1 epic node + node có id/kind/title + edge có from/to/rel. INVALID → reject cả file: duplicate id, dangling edge/parent, self-loop. `parent` mâu thuẫn edge `contains` → edge thắng (không invalidate). Unknown enum → drop node/edge + `decodeWarnings[]`.
3. `generatedAt` chỉ bump khi payload (loại trừ timestamp) đổi — idempotent thật; ghi atomic temp+rename.
4. Bin `story-mindmap` zero-dep node (mẫu `story-impact`, 175 dòng, chỉ builtins): đọc bracket (epic/SF/Tier/Depends on) + context pack (steps từ mục Spec slice đánh số, flows-to theo thứ tự — best-effort GHI RÕ trong output; touch map: Sở hữu/Append-only → `writes`, Read-only → `impacts`, tc-batched bỏ) + `story-impact --json` khi có base (area-level, node `computed: true`). **Tự-chứa tri thức (27/09)**: đổ thêm vào SF node các trường optional từ pack — `summary`, `acceptance[]` (mục ACCEPTANCE), `tests[]` (lưới test trong ACCEPTANCE/plan), `notes[]` (mục Boundary), `filesTouched[]` (từ touch map Sở hữu+Append-only); `meta.summary` 1 câu; `evidence[]` ≥1 dòng/SF done (nguồn: commit hash + tên test). Mục tiêu: đọc .wakii hiểu toàn bộ story không cần mở bracket.
5. Single-writer: chỉ chạy ở checkout chứa bracket canonical; SF worker không ghi. Full-regen mỗi lần.
6. 3 trigger dạng wrapper ăn-theo kit (nuốt missing-bin, exit 0 im lặng, timeout 30s): (a) sau story-launch worktree create thật (dry-run exit trước create — không ghi), (b) vòng sweep story-coordinator-pass/story-watchdog thấy state đổi, (c) story-close snapshot + commit force-add. KHÔNG sửa story-verify (giữ thuần-đọc — exit/stdout là hợp đồng panel).
7. Output phụ `--mermaid-md`: cùng dữ liệu render mermaid fence .md (chi phí ~0, mở bằng pipeline markdown).
8. Kit chore bắt buộc: entry provides[] kit.json (type bin, category hợp lệ) + kitHash rehash (`node --input-type=module -e "import {computeKitHash} from './main.mjs'"` trong plugin dir) + rehash fingerprint bundled-plugins.json + `plugin-tree-hash-lockstep.test.mjs` chạy qua `pnpm test` (node trực tiếp chết) + `.gitignore` allowlist `docs/superpowers/mindmaps/` (mẫu negate dòng 105-106).

## Touch map
- Sở hữu (SF-1 tạo): `resources/plugins/launch/stablyai.orca-superpowers-launcher/kit/bin/story-mindmap` (mới) · wrapper trigger files (pattern hook-* bins) · `docs/superpowers/mindmaps/*.wakii` (output) · fixture golden tests.
- Append-only: `kit/kit.json` (thêm entry provides, KHÔNG đụng field version) · `.gitignore` (allowlist negate) · `bundled-plugins.json` (rehash giá trị hash).
- Read-only: `kit/bin/story-launch` (chèn 1 lời gọi wrapper sau create thành công — append 3-5 dòng) · `kit/bin/story-close` (như trên, trước cleanup) · `story-impact` (đọc shape --json, không sửa).
- Cấm: sửa `story-verify` · sửa logic 2 hash impl (verify-packaged-plugin-resources.cjs / plugin-content-hash.ts) · đụng `/.wakii/` runtime dir (session-memory, gitignore:90 — trùng tên, khác khái niệm) · đụng khối `version` kit.json.

## ACCEPTANCE
- Fixture bracket + context pack → file .wakii vàng so khớp byte (trừ generatedAt), đủ 3 lớp.
- Nguồn không đổi chạy 2 lần → lần 2 không ghi (mtime không đổi).
- Duplicate-id / dangling edge / unknown-enum fixture → decoder verdict đúng luật (reject / drop+warning).
- story-impact chết / timeout → file vẫn ra 2 lớp + decodeWarnings, exit 0.
- Wrapper thiếu bin / bin throw → exit 0 im lặng, story-launch flow không đổi.
- `node tests/kit-verify-manifest.mjs` 30/30 + lockstep qua `pnpm test` xanh + `verify-packaged-plugin-resources` EXIT 0.
- Suite kit 35 files (36 sau khi thêm test mới) exit 0.

## Boundary
- KHÔNG tự ý bump `version` kit.json (chỉ rehash kitHash — fence 22/09).
- KHÔNG incremental state merge giữa các lần chạy (full-regen).
- KHÔNG quét toàn cây src cho file node (chỉ touch map + area computed).
- KHÔNG đọc Linear trong bin (state qua orchestration/bracket — offline-safe; Linear state là việc sweep coordinator cấp nguồn).
- KHÔNG sửa story-verify vì bất kỳ lý do gì.
