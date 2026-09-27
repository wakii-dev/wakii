# Design: `mindmap.wakii` — file bản đồ story + Wakii Viewer

- Ngày: 2026-09-27
- Trạng thái: spec chờ duyệt (brainstorm xong, trước writing-plans)
- Nguồn: hội thoại brainstorm 27/09 — 4 quyết định đã chốt với user (mục 2)

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
- `state` cho sf/task: `pending | in-progress | done | blocked`; epic thêm `complete`.
- Node `kind`: `epic | sf | task | step | area | file`. Node `step`/`file` không có
  `state` (chỉ tiến độ có state; logic/impact là cấu trúc).
- `edge rel`: `contains | depends-on | flows-to | impacts | writes`. Trong đó
  `contains`/`depends-on` = tiến độ, `flows-to` = logic, `impacts`/`writes` = impact.
- File node BÓNG GIỚI HẠN: chỉ từ touch map trong context pack (curated) + area-level
  từ `story-impact` (computed) — không quét toàn cây src (hàng nghìn file).
- Decoder phải **drop unknown field an toàn** (thêm field sau này không vỡ viewer cũ —
  nguyên tắc remote-wire-compat của repo); đổi `rel`/`kind`/`state` hợp lệ phải bump schema.
- Node id duy nhất trong file; `parent` trên node `task`/`step` (cha là sf).

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
- **Trigger gắn lifecycle có sẵn của kit** (không daemon mới):
  1. `story-launch` — gọi sau khi tạo worktree thành công (sinh/cập nhật file)
  2. sau `story-verify` pass 1 SF (cập nhật state SF đó)
  3. `story-close` — snapshot chốt trước khi dọn worktree
- Ghi atomic (temp cùng dir + rename), idempotent (nội dung không đổi → không ghi).
- Fail-open: sinh file lỗi KHÔNG chặn story chạy — log + report, story tiếp tục.

## 5. App mở `.wakii` — main process

Mở rộng vòng xử lý có sẵn trong `src/main/index.ts`:

- `open-file` (dòng 93) hiện capture markdown qua `state.osOpenedMarkdownFiles`.
  Thêm capture `.wakii`: `state.osOpenedWakiiFiles` — cùng cơ chế capture argv
  trước `ready` + publish khi renderer lên (pattern markdown đã giải xong bài
  toán cold-start, ăn theo nguyên văn).
- IPC publish + command mở viewer tab: mỗi path mở 1 tab viewer (dedupe theo
  path + generatedAt — mở lại file mới hơn thì refresh tab cũ, không mở 2 tab
  cùng file).
- Đuôi lạ ngoài `.md`/`.wakii` → không claim, trả lại HĐH (giữ nguyên hành vi).

## 6. File association 3 OS — clone pattern markdown

Mẫu `.md` đã có đầy đủ trong `config/electron-builder.config.cjs` — `.wakii` làm
tựa đấy, khác đúng một chỗ: `.wakii` là format của Wakii nên **claim Owner**.

| OS | Cách | Ghi chú ràng buộc |
|---|---|---|
| mac | `fileAssociations` entry `.wakii`, `rank: 'Owner'` | mac build x64+arm64 — nhớ `pnpm install:release` trước packaging (AGENTS.md) |
| Windows | NSIS hook additive trong `nsis/orca-installer-hooks.nsh` (KHÔNG `fileAssociations` — lý do "steal default" ghi tại config:465) | tuân thủ `docs/reference/windows-edr-posture.md`; uninstall phải gỡ registration sạch |
| Linux | `mimeTypes: ['application/vnd.wakii-mindmap']` + glob override | MIME mới, không đụng mimeapps.list của user |

## 7. Viewer — tab mindmap trong renderer

- Tab type mới: canvas đồ thị với **2 chế độ xem** (toggle trên toolbar):
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

## 9. Verify strategy

- Kit: unit test schema (valid/invalid/version-mismatch), idempotent ghi,
  fail-open trigger; fixture (bracket + context pack có touch map) → file
  `.wakii` vàng so khớp — gồm cả steps (`flows-to`) lẫn area/file impact;
  trường hợp context pack thiếu touch map → story chỉ có lớp tiến độ, không vỡ.
- App: main-process capture `.wakii` trước/sau ready; renderer decode
  schema-mismatch → error tab; packaging: association entry xuất hiện ở
  artifact 3 OS (kiểm Info.plist / NSIS registry / desktop entry sau build).
- Round-trip E2E: `story-launch` → file tồn tại đúng schema (3 lớp) →
  `open-file` → tab viewer render đúng node/edge/state ở CẢ 2 chế độ xem.

## 10. Tách story (4 SF, đi story-workflow)

| SF | Nội dung | Tier |
|---|---|---|
| SF-1 | Schema `.wakii` 3 lớp (tiến độ + logic + impact) + bin `story-mindmap` (đọc bracket/context pack/story-impact) + 3 trigger lifecycle + test | 0 |
| SF-2 | Main process open-file `.wakii` + association mac/Windows/Linux + packaging gate | 1 |
| SF-3 | Viewer tab renderer (2 chế độ xem + panel chi tiết + IPC glue) | 1 |
| SF-4 | Convergence: round-trip E2E 3 lớp + fixtures + docs reference `.wakii` format | 2 |

SF-2 và SF-3 song song được sau SF-1 (đỌc chung schema, không chạm nhau);
SF-4 cần cả hai.
