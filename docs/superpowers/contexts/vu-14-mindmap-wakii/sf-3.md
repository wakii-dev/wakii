# Context pack SF-3 — Viewer mindmap tương tác

## Spec slice
1. Bề mặt: file `.wakii` mở trong **editor tab floating workspace** (A1 — user chốt 27/09): nơi markdown OS-open đổ vào (`EditorFilesSlice.openFile` mode preview) — KHÔNG tạo tab type mới trong tab strip terminal.
2. 2 chế độ xem toggle trên toolbar: **Tiến độ** (mặc định: epic → SF tầng tier → task, màu theo state, edge depends-on đường phụ) / **Logic & Impact** (steps nối `flows-to` trong SF; bật lớp `impacts`/`writes` → area/file toả từ SF; file `computed:true` tô khác curated; hover SF → sáng vùng impact).
3. Node state: done / in-progress / pending / blocked (+ epic complete). **Chỉ token màu `main.css`** — không màu mới (STYLEGUIDE + lint gate `check:code-quality:changed`).
4. Click node → side panel: title, kind, state, linear link (nếu có), evidence summary + ref; node file → danh sách SF đụng nó. Hover → highlight node + hàng xóm bậc 1.
5. Pan/zoom; filter theo kind khi node nhiều (budget ~15-60 node/story).
6. Decode fail (payload error từ SF-2: io/schema/too-large) → **error state rõ ràng** trong bề mặt + path, không render nửa vời; `decodeWarnings[]` → hiện badge warning, vẫn render phần còn lại.
7. Data vào viewer = payload decoded sẵn từ main (`ui:openWakiiFile`) — renderer không đọc fs, không JSON.parse lại.
8. Canvas lib: **chốt trước dispatch dev** (SF-4 golden phụ thuộc) — mermaid ^11.17.2 có sẵn nhưng không đủ tương tác (click-node/panel/hover); nếu cần lib thì vendored 1 file + tie vào quyết định ở plan. Tiêu chí: layout hierarchy + click/hover events + pan/zoom + bundle ≤ ~300KB vendored.

## Touch map
- Sở hữu: viewer component mới (renderer, cạnh editor slices) · mermaid-fallback renderer (`--mermaid-md` output của SF-1, nếu đi tiếp MermaidBlock) · golden render tests (Playwright `_electron` — pattern real-smoke plugin).
- Append-only: `src/renderer/src/store/slices/editor/` (recognize đuôi `.wakii` → preview mode viewer) · bridge consumer (nối `os-wakii-file-open-bridge` từ SF-2) · `src/renderer/src/assets/main.css` (CHỈ nếu thiếu token — báo PM trước khi thêm).
- Read-only: `src/renderer/src/components/sidebar/MermaidBlock.tsx` + `mermaid-config.test.ts` (kiểm securityLevel nếu dùng mermaid) · `open-markdown-in-floating-workspace.ts` (flow mở file — 3 importers) · hook bridge SF-2.
- Cấm: palette/màu mới ngoài token · sửa tab strip chính / AppWorkspaceShell (loại A2) · fs access từ renderer · render HTML từ node title không qua escape (React JSX tự escape — cấm dangerouslySetInnerHTML).

## ACCEPTANCE
- Fixture vàng 3 lớp → render đúng node/edge/state cả 2 chế độ (golden test _electron).
- Click từng kind node → panel hiển thị đúng trường (linear link chỉ khi có).
- Hover SF → đúng hàng xóm bậc 1 (impacts/writes/contains/depends-on).
- Payload error → error state + path; payload có decodeWarnings → render + badge.
- Lint design-system + `check:code-quality:changed` sạch (token-only colors).
- Node title chứa ký tự đặc biệt/HTML → escape đúng (test với `<script>` trong title).

## Boundary
- KHÔNG edit/save file từ viewer (read-only tuyệt đối).
- KHÔNG real-time polling (refresh = mở lại file / push mới từ main).
- KHÔNG tự thêm dependency npm mới (vendored file nếu lib cần — quyết ở plan).
- KHÔNG đụng schema decode (việc SF-2 main-side).
- KHÔNG đổi UI khác của editor tab (markdown flow giữ nguyên).
