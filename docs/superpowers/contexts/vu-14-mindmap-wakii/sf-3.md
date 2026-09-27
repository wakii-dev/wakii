# Context pack SF-3 — Viewer mindmap tương tác (direction C · Quỹ đạo — user chọn 27/09)

## Spec slice
1. **Direction C**: epic node TRÒN ở tâm, SF toả trên 3 vòng tier (200/385/500), task/step vệ tinh toả theo góc; `SF_RING` sắp thứ tự để mọi depends-on nối node kề nhau (không xuyên tâm); **wedge spotlight** ±24° quanh SF khi hover ở mode Logic; **panel float TRÁI**; ring guide + nhãn tier. Prototype tham chiếu: `docs/superpowers/prototypes/vu-14-mindmap/c.html` (vanilla DOM/SVG — port sang React GIỮ architecture, KHÔNG copy-paste mù).
2. Bề mặt: file `.wakii` mở trong **editor tab floating workspace** (A1 — user chốt 27/09) — `EditorFilesSlice.openFile` nhận diện `.wakii` → viewer mode preview. KHÔNG tạo tab type mới trong tab strip terminal.
3. 2 chế độ xem (toggle toolbar): **Tiến độ** (mặc định: epic→SF tầng tier→task, màu state, depends-on cung quỹ đạo) / **Logic & Impact** (steps flows-to; toggle "Lớp impact" → area/file toả từ SF, file `computed` viền đứt khác curated; hover SF → wedge sáng quạt vùng đụng).
4. **Tự-chứa tri thức (user 27/09)**: SF node mang `summary`/`acceptance[]`/`tests[]`/`notes[]`/`filesTouched[]` — panel hiển thị các mảng này dạng collapsible section dưới evidence; `meta.summary` hiện ở panel epic. Mục tiêu: đọc map hiểu toàn bộ story không cần mở bracket.
5. Màu: chỉ token `main.css` (status-success / workspace-status-progress / muted-foreground / destructive / border / ring...) light+dark. Không palette mới (STYLEGUIDE + lint gate).
6. Payload vào viewer = đã decode từ main (`ui:openWakiiFile`): renderer không fs, không JSON.parse lại. Error payload → error card (code/message/path); `decodeWarnings[]` → badge đếm + box.
7. Camera pan/zoom/fit; filter kind chips disable theo mode; theme toggle chỉ đổi token class.
8. Không lib mới — tư duy vanilla DOM/SVG của C giữ nguyên, implement React component (canvas div + SVG edges + nodelayer absolute; camera = transform trong ref, không re-render React trên mỗi pan).

## Touch map
- Sở hữu: `src/renderer/src/components/wakii-mindmap/` (viewer mới: MindmapCanvas + MindmapNode + MindmapEdge + MindmapPanel + useMindmapCamera) · golden render tests mới (Playwright `_electron` — pattern real-smoke plugin).
- Append-only: `src/renderer/src/store/slices/editor/` (nhận diện `.wakii` → viewer mode) · consumer bridge `os-wakii-file-open-bridge` (SF-2 giao) đăng ký qua `app-lifetime-ipc-bridge` (2 importers hiện tại) · `src/renderer/src/assets/main.css` CHỈ khi thiếu token (báo PM trước khi thêm).
- Read-only: `open-markdown-in-floating-workspace.ts` (3 importers — không đổi hành vi markdown) · hook bridge SF-2 · prototype `c.html` (tham chiếu cấu trúc + layout constants).
- Cấm: `dangerouslySetInnerHTML` (title fixture chứa `<script>` — JSX tự escape là đủ) · palette/màu mới · đụng tab strip chính / AppWorkspaceShell · fs từ renderer · sửa markdown flow · dependency npm mới.

## ACCEPTANCE
- Golden render fixture 3 lớp: progress 16 node/37 cạnh đúng vị trí tier; logic mode steps + flows-to; bật impact → area/file, computed ≠ curated rõ ràng.
- Click từng kind → panel đúng trường + mảng acceptance/tests/notes render collapsible; epic panel có meta.summary.
- Hover SF mode logic → wedge đúng quạt; hàng xóm bậc 1 sáng, còn lại dim.
- Title `<script>alert(1)</script>` render thuần text (không thực thi, không innerHTML).
- Payload error → error card; decodeWarnings → badge + box, phần hợp lệ vẫn render.
- Theme light/dark chỉ đổi token; `lint:design-system` + `check:code-quality:changed` sạch.
- Regression markdown: mở .md đúng như trước — test hiện có của editor slice vẫn xanh.

## Test case lưới (map vào tests[])
1. Golden progress render — node/edge count + vị trí tier + màu theo token class.
2. Golden logic+impact — steps, flows-to, computed vs curated styling.
3. Panel click per-kind — state chip, linear, evidence, 3 mảng collapsible, meta.summary ở epic.
4. Hover neighbor dim/hot + wedge chỉ SF/logic mode.
5. Escape title `<script>` → textContent thuần (fixture chính là t-3.3).
6. Error payload → error card; warnings → badge đếm đúng.
7. Mode toggle — ẩn/hiện kind đúng + chips disable đúng mode.
8. Camera — wheel zoom + pan + fit thay đổi transform.
9. Theme toggle light/dark.
10. Editor slice — `.wakii` → viewer, `.md` → markdown (regression).

## Boundary
- KHÔNG edit/save từ viewer; KHÔNG real-time polling (refresh = push mới từ main / mở lại).
- KHÔNG đụng schema decode (việc SF-2 main-side); KHÔNG sửa markdown flow.
- KHÔNG lib mới; KHÔNG màu mới ngoài token.
- KHÔNG render > 60 node thiếu filter (budget spec §7) — fixture phình thì báo PM.
- Bug thuộc SF-1/2 tìm thấy → report PM, không tự sửa ngoài touch map.
