# Design: `mindmap.wakii` — file bản đồ story + Wakii Viewer

- Ngày: 2026-09-27
- Trạng thái: spec chờ duyệt (brainstorm xong, trước writing-plans)
- Nguồn: hội thoại brainstorm 27/09 — 4 quyết định đã chốt với user (mục 2)

## 0. IDEA-BRIEF (8 chiều — story-workflow CREATE)

- **Task**: khi story chạy → sinh file `.wakii`; app Wakii mở được file →
  hiển thị mindmap tương tác của story
- **Output**: bin kit `story-mindmap` + format `.wakii` (JSON schema v1) +
  feature app desktop (open-file capture + viewer tab) trên mac/Win/Linux
- **Users**: PM/coordinator (người vận hành story) + agents đọc cùng dữ liệu
- **Constraints**: schema versioned (wire-compat); association clone pattern
  markdown hiện có (NSIS additive + EDR posture trên Windows); màu dùng token
  hệ design; kit bins zero-dep; sinh file fail-open (không chặn story)
- **Input**: spec này + dữ liệu có sẵn (bracket, orchestration, Linear,
  context pack, `story-impact --json`)
- **Context**: kit 2.20.0; app đã có vòng `open-file` cho markdown
  (`src/main/index.ts`, `src/main/startup/`); story mới có nhánh đích riêng
- **Success criteria**: round-trip E2E — `story-launch` → file tồn tại đủ
  3 lớp → double-click `.wakii` → viewer tab render đúng cả 2 chế độ xem
- **Out-of-scope**: edit/save từ viewer; real-time; bản đồ tri thức dự án /
  graph memory; phân tích code ngoài import graph của `story-impact`

## 1. Vấn đề & mục tiêu

Story đang chạy chỉ nhìn được qua 3 kênh văn bản: bracket (markdown), Linear
(danh sách issue), orchestration CLI (JSON). Không có cách nào nhìn toàn cảnh
epic → SF → task kèm trạng thái bằng một cái nhìn đồ thị.

Mục tiêu: mỗi story chạy sinh ra **1 file `.wakii`** (snapshot đồ thị story),
và **app Wakii mở được file này** (double-click từ HĐH) hiển thị dạng mindmap
tương tác — click node đọc được ngữ cảnh (evidence, linear, file đụng).

Yêu cầu bổ sung (27/09, lúc duyệt spec): mindmap phải thể hiện được **toàn bộ
logic và impact của story** — 3 lớp nội dung:

1. **Tiến độ** — epic → SF → task + trạng thái (phần gốc)
2. **Logic** — cơ chế story vận hành: các bước trong SF, luồng data/control
   giữa chúng (edge `flows-to`)
3. **Impact** — story đụng đâu: feature area bị ảnh hưởng, file touch map,
   impact thực đo từ reverse-import graph (`story-impact`)

Ranh giới "toàn bộ": mọi thứ workflow **đã ghi có cấu trúc** — context pack
(touch map + boundary), plan (task DAG), `story-impact --json` (computed).
Kit không đoán logic không ai viết; đổi lại workflow bắt buộc có 3 nguồn này
trước khi SF chạy nên không mất thông tin thực tế.

Không phải bản đồ tri thức dự án (phương án từng cân nhắc rồi bỏ — dữ liệu
graph memory/KB hiện rỗng); đây là **bản đồ runtime của story**.

## 2. Quyết định đã chốt với user (vết brainstorm)

| Câu hỏi | Chốt |
|---|---|
| Mindmap chứa cái gì? | Bản đồ **story đang chạy** (epic → SF → task, trạng thái, file đụng) |
| Ai dùng, sống ở đâu? | Feature của app Wakii (bỏ phương án tool HTML nội bộ) |
| Orca mở bằng cách nào? | **File association HĐH đủ 3 OS** (mac/Windows/Linux) |
| Viewer mức nào? | **Viewer tab** vẽ mindmap tương tác khi mở file — không phải ảnh tĩnh |
| (mặc định, không phản đối) | `.wakii` claim `rank: Owner` — double-click mặc định mở Wakii |

## 3. File format `.wakii` (schema v1)

JSON, UTF-8, một story một file, đặt tại `docs/superpowers/mindmaps/<epic-id>-<slug>.wakii`
(commit kèm bracket — force-add nếu gitignore, brackets đã có tiền lệ tracked).

```jsonc
{
  "wakiiMindmap": 1,                // magic + schema version — bắt buộc, decoder từ chối khi thiếu/không nhận
  "meta": {
    "story": "VI-1 — Hỗ trợ tiếng Việt",
    "epic": "VI-1",
    "linear": "VI-1",               // issue id của epic
    "dest": "story/vi-1-vietnamese-i18n",
    "generatedAt": "2026-09-27T13:00:00Z",
    "generator": "story-mindmap 1.0.0"
  },
  "nodes": [
    // — lớp tiến độ —
    { "id": "epic", "kind": "epic", "title": "…", "state": "in-progress" },
    { "id": "sf-1", "kind": "sf", "title": "Registry + wiring", "state": "done",
      "linear": "VI-1-1", "tier": 0 },
    { "id": "t-1.1", "kind": "task", "title": "…", "state": "pending", "parent": "sf-1" },
    // — lớp logic: bước cơ chế trong SF (từ context pack/plan) —
    { "id": "s-1.1", "kind": "step", "title": "i18n registry load vi.json",
      "parent": "sf-1", "detail": "…1 câu cơ chế…" },
    // — lớp impact: feature area + file touch map —
    { "id": "area-terminal", "kind": "area", "title": "Terminal" },
    { "id": "f-src-main-pty", "kind": "file", "path": "src/main/pty.ts",
      "computed": true }            // computed=true: từ story-impact, không phải touch map tay
  ],
  "edges": [
    { "from": "epic", "to": "sf-1", "rel": "contains" },
    { "from": "sf-2", "to": "sf-1", "rel": "depends-on" },
    // logic: luồng data/control giữa steps
    { "from": "s-1.1", "to": "s-1.2", "rel": "flows-to" },
    // impact: SF đụng area/file
    { "from": "sf-1", "to": "area-terminal", "rel": "impacts" },
    { "from": "sf-1", "to": "f-src-main-pty", "rel": "writes" }
  ],
  "evidence": [
    { "node": "sf-1", "summary": "merge 4a40af67 + suite xanh", "ref": "…commit/linear-comment…" },
    { "node": "f-src-main-pty", "summary": "reverse-import 7 module đụng", "ref": "story-impact --json" }
  ]
}
```

Quy ước:
- `state` cho sf/task: `pending | in-progress | done | blocked`; epic: bin **derive**
  `complete` khi mọi SF `done`, ngược lại `in-progress` — không ai tay.
- Node `kind`: `epic | sf | task | step | area | file`. Node `step`/`file` không có
  `state` (chỉ tiến độ có state; logic/impact là cấu trúc).
- `edge rel`: `contains | depends-on | flows-to | impacts | writes`. Trong đó
  `contains`/`depends-on` = tiến độ, `flows-to` = logic, `impacts`/`writes` = impact.
- File node BÓNG GIỚI HẠN: chỉ từ touch map trong context pack (curated) + area-level
  từ `story-impact` (computed) — không quét toàn cây src (hàng nghìn file).
- **Bảng bắt buộc/tùy chọn**: bắt buộc = `wakiiMindmap`, `meta.story`, `meta.generatedAt`,
  `meta.generator`, ≥1 node epic, mọi node có `id`+`kind`+`title`, mọi edge có
  `from`+`to`+`rel`; tùy chọn = mọi trường còn lại (`linear`, `tier`, `parent`,
  `evidence[]`, `computed`, `detail`).
- **Luật structural validation** (vi phạm → file INVALID, error tab, không render nửa vời):
  duplicate `id`; edge/`parent` trỏ id không tồn tại (dangling); edge self-loop.
  `parent` và edge `contains` mâu thuẫn → **edge `contains` là nguồn sự thật**,
  `parent` chỉ convenience — lệch không invalidate.
- **Unknown enum value** (`kind`/`rel`/`state` lạ): decoder cũ **drop node/edge đó,
  giữ phần còn lại**, gắn `decodeWarnings[]` vào kết quả decode (không error-tab —
  đúng nguyên tắc drop-unknown-field; thêm enum mới KHÔNG cần bump schema, thêm
  field bắt buộc mới cần).
- **Slug tên file**: lấy từ nhánh đích `story/<epic-id>-<slug>` → `<epic-id>-<slug>.wakii`
  — 1 nguồn duy nhất, không 2 writer đặt tên khác nhau.
- **`generatedAt` chỉ bump khi payload đổi**: so sánh nội dung loại trừ trường
  `generatedAt`; giống nhau → KHÔNG ghi lại (idempotent thật, không refresh ảo).
- **Input không tin cậy**: cap 5MB; decode = `JSON.parse` thuần (không eval/Function).

## 4. Sinh file khi story chạy — bin `story-mindmap` (kit)

- Nguồn dữ liệu có sẵn, không tạo kho mới:
  - **Tiến độ**: bracket (epic/SF/`Depends on`/tier) + `orca orchestration
    task-list --json` (task + trạng thái) + Linear (state SF)
  - **Logic**: context pack `docs/superpowers/contexts/<prefix>-sf-N.md`
    (mục spec slice/boundary — hợp nhất thành steps + edge `flows-to` theo
    thứ tự mục) + plan task DAG
  - **Impact**: mục touch map trong context pack (curated) + `story-impact
    --json` khi có git base (computed — importer ngược theo feature area)
- CLI: `story-mindmap --bracket <file> [--out <path>]` — mặc định out theo quy ước
  mục 3; đọc được cả bracket lẫn orchestration để hợp nhất node/state.
- **Write topology (single-writer)**: file `.wakii` canonical sống ở checkout
  nhánh đích (coordinator worktree). SF worker KHÔNG BAO GIỜ ghi file — SF
  worktree fork từ đích TRƯỚC khi file tồn tại, 2 SF cùng ghi 1 file = merge
  conflict chắc chắn. `story-mindmap` chỉ chạy nơi có bracket canonical.
- **Trigger gắn lifecycle** — attach qua **wrapper pattern có sẵn của kit**
  (nuốt missing-bin, exit 0 im lặng), KHÔNG sửa 3 bin lõi (`story-verify` giữ
  thuần-đọc — exit code + stdout `--json` là hợp đồng panel đang consume):
  1. sau `story-launch` tạo worktree thành công (coordinator gọi; dry-run
     exit trước create → không ghi)
  2. vòng sweep `story-coordinator-pass` / `story-watchdog` — thấy state SF
     đổi (Linear) → regen; đọc state qua `orca` CLI host-level nên chạy được
     từ checkout đích
  3. `story-close` — snapshot chốt + **commit force-add** trước khi dọn
     worktree (file sống trên nhánh đích như audit trail, tiền lệ bracket)
- **Full-regen** từ nguồn mỗi lần (trigger chỉ là re-invoke — không incremental
  state merge). Timeout budget 30s quanh `story-impact` + orca CLI; quá giờ →
  bỏ lớp impact, giữ tiến độ+logic, ghi `decodeWarnings` nguồn.
- Ghi atomic (temp cùng dir + rename); idempotent theo luật `generatedAt` (§3).
- Fail-open: sinh file lỗi KHÔNG chặn story chạy — log + report, story tiếp tục.

## 5. App mở `.wakii` — main process + IPC contract (pin cho SF-2/SF-3 song song)

Mở rộng vòng xử lý có sẵn trong `src/main/index.ts` + `src/main/startup/`:

- **State**: `OsOpenedWakiiFileState` — clone pattern `OsOpenedMarkdownFileState`
  (`capture/consume/restore`, cap 32, `authorizeExternalPath` bắt buộc cho path
  từ OS). Capture từ 3 nguồn như markdown: argv trước `ready`, event `open-file`
  (chỉ claim `.wakii`, đuôi lạ trả lại HĐH), second-instance.
- **IPC pull**: `ui:consumePendingWakiiFileOpens` — renderer gọi 1 lần khi
  listener mount (pattern `ui:consumePendingMarkdownFileOpens`, restore-on-failure).
- **IPC push**: `ui:openWakiiFile` — payload **đã decode từ main**:
  `{path, mindmap}` hoặc `{path, error: {code: 'io'|'schema'|'too-large', message}}`.
  Main đọc file (JSON.parse thuần, cap 5MB) — renderer không đọc fs lại.
- **Dedupe/refresh owner = main process**: map `path → contentHash`; open-file
  cùng path, hash khác → push refresh vào tab có sẵn; hash giống → focus tab.
  Cold-start race (argv + event cùng path) → dedupe ở tầng capture theo
  path+hash (pattern markdown đã có).
- **Preload bridge**: `os-wakii-file-open-bridge` theo mẫu
  `os-markdown-file-open-bridge` (register qua `app-lifetime-ipc-bridge`);
  latch `wakiiFileOpenListenerReady` reset khi reload (`main-window-controller`).

## 6. File association 3 OS — clone pattern markdown, scope theo packaging target

Mẫu `.md` đã có đầy đủ trong `config/electron-builder.config.cjs` + NSIS hooks —
`.wakii` làm tựa đấy. `.wakii` là format mới không có incumbent → mac claim
`rank: 'Owner'`; **Windows claim default luôn** (user ruling 27/09 — format mới
không ai giữ default, set default không phải steal; lệch với rule additive của
`.md` là CỐ Ý, ghi chú ở header NSIS hook).

| OS | Target | Cách | Ghi chú |
|---|---|---|---|
| mac | dmg (x64+arm64) | `fileAssociations` entry `.wakii`, `rank: 'Owner'` | `pnpm install:release` trước packaging (AGENTS.md) |
| Windows | NSIS installer | ProgID mới + **set default** (`Software\Classes\.wakii` → ProgID) + macro register/unregister **cặp đối xứng** + `SHChangeNotify`, KHÔNG `fileAssociations` (config:465) | EDR posture: chỉ reg-write, không spawn mới; KHÔNG đụng khối `${isUpdated}` daemon sweep |
| Linux | deb/rpm | MIME XML mới `application/vnd.wakii-mindmap` + glob override + `update-mime-database` qua after-install (pattern có sẵn) | desktop entry `MimeType=` chỉ tham chiếu được type ĐÃ đăng ký — bài học `.mdx` (config:566) |
| Linux | AppImage | **limitation**: không có postinst → không đăng ký MIME hệ thống được | mở bằng drag-drop / Open With thủ công; ghi rõ docs + release notes |

Đồng bộ 4 chỗ khi thêm extension (rule 4-place của markdown): `wakii-documents.ts`
↔ NSIS ProgID ↔ electron-builder config ↔ main capture — lệch 1 chỗ = association
chết im lặng.

## 7. Viewer — editor tab floating workspace (A1, user chốt 27/09)

- **Bề mặt**: file `.wakii` mở như một file trong floating workspace editor —
  đúng nơi markdown OS-open đang đổ vào (`EditorFilesSlice.openFile` mode
  preview, bridge pattern có sẵn). KHÔNG tạo tab type mới trong tab strip
  terminal (kiến trúc non-terminal tab chưa từng có — loại A2).
- Canvas đồ thị với **2 chế độ xem** (toggle trên toolbar):
  - **Tiến độ** (mặc định): epic → SF (tầng tier) → task, màu theo state;
    edge `depends-on` vẽ đường phụ.
  - **Logic & Impact**: steps nối nhau bằng `flows-to` trong từng SF
    (cơ chế đọc theo dòng chảy); riêng impact bật lớp `impacts`/`writes`
    → area/file toả ra từ SF, file `computed` tô khác file curated;
    hover SF → sáng toàn bộ vùng impact của nó.
- Màu node theo state + style edge theo rel — dùng token màu hệ design
  (`main.css`), không màu mới (STYLEGUIDE.md).
- **Lớp hiểu cặn kẽ** (mục tiêu user): click node → side panel chi tiết
  (title, state, link Linear nếu có, evidence summary + ref; node file →
  danh sách SF đụng nó); hover → highlight node + hàng xóm trực tiếp.
- Pan/zoom; filter theo kind khi node nhiều.
- Thư viện vẽ: ưu tiên reuse cái renderer đã có (mermaid cho bản tĩnh là
  không đủ tương tác — nếu cần canvas lib thì vendored 1 file, chốt ở bước
  plan sau khi đo node count thực tế ~15-60 node/story).

## 8. Non-goals (YAGNI)

- Không edit/save từ viewer — file sinh bởi kit, viewer chỉ đọc.
- Không real-time (refresh = story lifecycle trigger re-sinh file, mở lại tab).
- Không reverse-engineer ngữ nghĩa code tự động — logic lấy từ context pack/plan
  (curated), impact lấy từ touch map + reverse-import computed; không phân tích
  code vượt quá import graph của `story-impact`.
- Không bản đồ tri thức dự án / graph memory trong scope này (chờ data có thật).
- Không orphan-viewer: file `.wakii` hỏng schema → tab hiện lỗi rõ ràng + path,
  không render nửa vời.

## 9. Verify strategy — tách automated vs manual (repo không có CI test ngoài release chain)

**Automated (chạy được trong story):**
- Kit: unit test schema (valid/invalid/version-mismatch/unknown-enum/dangling/
  duplicate-id), idempotent ghi (payload same → không ghi), fail-open trigger
  (nguồn hỏng → exit 0 + report), timeout budget; fixture (bracket + context
  pack có touch map) → file `.wakii` vàng so khớp 3 lớp; case pack thiếu touch
  map → chỉ lớp tiến độ, không vỡ.
- App main: wiring test capture `.wakii` trước/sau ready + restore-on-failure
  (pattern `os-opened-markdown-wiring.test.ts` — đọc source-text pin cấu trúc).
- Renderer: decode schema-mismatch → error tab; render fixture vàng qua
  Playwright `_electron` (pattern real-smoke plugin).
- Packaging: assert mới trong `electron-builder-config.test.mjs` (entry
  association xuất hiện trong config sau build — kiểm Info.plist key / NSIS
  macro cặp đối xứng / desktop entry + mime XML theo target).

**Manual checklist (chỉ chạy khi release build — ghi trong SF-4):**
- Double-click `.wakii` thật trên mac dmg + Windows NSIS + Linux deb/rpm
  (AppImage: drag-drop path).
- Claim/steal default: kiểm app khác (.md handler hiện có) không bị đụng.

## 10. Tách story (4 SF, đi story-workflow)

| SF | Nội dung | Tier |
|---|---|---|
| SF-1 | Schema `.wakii` 3 lớp + bin `story-mindmap` (bracket/context pack/story-impact; output phụ `--mermaid-md` chi phí ~0) + 3 trigger wrapper + **kit chore bắt buộc**: provides[] kit.json + kitHash rehash + fingerprint bundled + lockstep test qua `pnpm test` + `.gitignore` allowlist `docs/superpowers/mindmaps/` | 0 |
| SF-2 | Main process open-file `.wakii` (state/IPC/latch theo §5) + association theo target (§6) + assert `electron-builder-config.test.mjs` | 1 |
| SF-3 | Viewer renderer (2 chế độ xem + panel chi tiết + preload bridge + dedupe glue) — **bề mặt chốt trước dispatch** | 1 |
| SF-4 | Convergence: round-trip E2E 3 lớp (automated) + manual checklist 3 OS + fixtures + docs reference `.wakii` format (kể cả limitation AppImage) | 2 |

**Lưu ý đặt tên**: thư mục runtime `/.wakii/` (session-memory, gitignore:90) đã
tồn tại — file map là `*.wakii` trong `docs/superpowers/mindmaps/`; 2 khái niệm
trùng tên "wakii", docs phải phân biệt rõ.

**Nhợ trước review cuối**: touch map ~28 file đã đo bằng `story-impact --targets`
(chi tiết trong context packs); các area importer xuất hiện thêm mà không có ở
đó = tràn ranh giới — review đo lại trên cùng thước.

SF-2 và SF-3 song song được sau SF-1 (đỌc chung schema, không chạm nhau);
SF-4 cần cả hai.
