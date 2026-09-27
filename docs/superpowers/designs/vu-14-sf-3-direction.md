# VU-14 · SF-3 Design Direction — FINAL (user chọn: C · Quỹ đạo, 27/09)

Prototype: `docs/superpowers/prototypes/vu-14-mindmap/c.html` (tự chứa, fixture VU-14 35 node / 40 cạnh inline, mở trực tiếp được).

Bản chất hướng C: epic là đĩa tròn ở tâm, 4 SF xếp trên 3 vòng tier đồng tâm (0/1/2), task/step/impact toả vệ tinh quanh SF của chúng, mọi edge quay quanh tâm theo cung. Ký hiệu đặc trưng: `SF_RING` sắp thứ tự để mọi depends-on nối 2 node kề nhau trên vòng (không xuyên tâm), và wedge spotlight — quạt nền theo góc SF khi hover ở mode logic.

## Tokens (chính xác từ `src/renderer/src/assets/main.css`)

- Màu dùng nguyên-vẹn qua `var()` — KHÔNG giá trị màu mới:
  - Nền/mặt: `--background` (app), `--editor-surface` (canvas + tab active + file node), `--card` (node card + legend), `--popover` (panel + warnbox + errcard), `--muted` (nbar track, wedge fill, errpath bg, chip on)
  - Chữ: `--foreground`, `--card-foreground`, `--muted-foreground` (tag/meta/edge stroke/hint), `--accent-foreground`
  - Viền/nhấn: `--border`, `--ring` (hover border + selection ring), `--accent` (button/chip hover)
- STATE map (4 màu, duy nhất nguồn sự thật):
  - `done` → `var(--status-success)` · `in-progress` → `var(--workspace-status-progress)` · `pending` → `var(--muted-foreground)` · `blocked` → `var(--destructive)`
  - (`complete` là alias của done trong decoder, legend bỏ qua)
- Biến thể pha bằng `color-mix(in srgb, <token> N%, transparent)` — chip state, selection ring 32%, errbox backdrop 72%, icon error bg 14% — không phát minh màu.
- Hình: `--radius` (0.625rem) cho node/panel/errcard; pill 999px cho step/area/chip; epic node border-radius 50%.
- Chữ: `--font-sans` UI, `--font-mono` cho tag/meta/path/linear/hint/errcode. Cỡ: node title 12.5px/500, meta 10.5px mono, tag 9px mono 600 letter-spacing .08em, panel title 14px/600, section label 10px 600 uppercase letter-spacing .06em.
- Đổ bóng: `--shadow-floating` cho panel/warnbox/errcard.
- Lint lưu ý cho Dev: KHÔNG concat className runtime (repo cấm computed className) — map rel→class tĩnh: `{contains: 'edge-contains', 'depends-on': 'edge-depends-on', ...}`; mọi màu qua `var()`, không palette raw.

## Structure — component map sang React

```
src/renderer/src/viewer/
  wakii-viewer.tsx               Root page: tabbar + toolbar + canvas + overlays. Owner toàn bộ state
                                 (mode, impactOn, kindFilter, selectedId, hoveredId, warnOpen, errorOpen).
                                 Nhận payload ĐÃ DECODE qua IPC prop — không fs, không JSON.parse.
  viewer-toolbar.tsx             Seg 2 mode + 6 kind chips + impact toggle + warn badge + nút mô phỏng
                                 lỗi (chỉ dev) + theme + fit. Stateless, props + callbacks.
  viewer-canvas.tsx              Div overflow:hidden. Chứa camera REF (imperative) + GraphEdges + NodeLayer
                                 + legend/hint/panel/warnbox/errbox as overlays.
  wakii-graph-layout.ts          Thuần hàm, không DOM: (mindmap, mode, impactOn) → { pos: Map<id,rect>,
                                 sfAng }. Port computeLayout / polar / TIER_R / SF_RING / SIZES nguyên
                                 từ prototype. useMemo theo (payload, mode, impactOn).
  wakii-graph-edges.tsx          <svg> 3 layer con: RingGuides (memo tĩnh) → WedgeSpotlight → <g> edge
                                 paths. path d tính từ layout; class + marker từ rel qua REL_CLASS tĩnh.
  wakii-graph-nodes.tsx          NodeLayer: div absolute; ViewerNode memo per node (dot + tag + title +
                                 sf meta/nbar + file path). Mọi text là children text (React tự escape —
                                 CẤM dangerouslySetInnerHTML).
  wakii-side-panel.tsx           Panel TRÁI: kind chip + close, title, state chip, rows (Linear, Nhánh
                                 đích, Đường dẫn, Nguồn, SF đụng, Cơ chế), summary (epic), Evidence,
                                 Acceptance/Tests/Notes (xem mục riêng).
  wakii-panel-list-section.tsx   1 section collapsible tái dùng cho acceptance/tests/notes.
  wakii-legend-overlay.tsx       Legend góc dưới phải theo mode (state dots + rel samples + computed/curated).
  viewer-warnings-popover.tsx    Badge "N cảnh báo decode" + popover list decodeWarnings[].
  wakii-error-overlay.tsx        Overlay toàn canvas khi payload lỗi: code + message + path + hint + Đóng.
```

**State phân bổ — ranh giới React state vs ref:**
- React state (page): `mode`, `impactOn`, `kindFilter: Set`, `selectedId`, `hoveredId`, `warnOpen`, `errorOpen`. Theme KHÔNG tạo state mới — theo theme system có sẵn của app (prototype toggle sun/moon chỉ để demo 2 theme).
- Derived (useMemo, không state): layout + sfAng, visibleNodes/visibleEdges, neighborSet(hoveredId), wedgePath.
- **REF (không React state): camera `{x, y, k}`** — wheel/pointermove chạy 60fps, đưa vào state sẽ re-render cả graph mỗi tick. Port nguyên `makeCamera` thành 1 hook `useCamera(canvasRef, viewportRef, world)` trả `{ fit }` qua ref imperative; `fit()` gọi từ nút Vừa khung + resize listener. Node/edge không biết gì về camera.

## Behavior (giữ nguyên cảm giác prototype; timing/easing ghi rõ)

1. **Mode toggle** (seg "Tiến độ" / "Logic & Impact"): progress = epic+sf+task, cạnh contains (cubic drop) + depends-on (cung +70, dash, marker); logic = ẩn task, hiện step (pill vệ tinh), contains/depends-on hạ `.faint` (opacity .14), flows-to (cung đẩy ra ngoài +46, marker).
2. **Impact toggle** (chỉ hiện ở logic): bật → area (pill dashed, r tier+95) + file (editor-surface, r tier+210) toả quạt quanh SF; skip node đã đặt. Quay về progress → tự reset impactOn=false. File `computed` = dash border; panel ghi Nguồn "story-impact (tính toán)" / "Touch map (curated)".
3. **Hover** (mouseenter/leave node): mọi node không thuộc hàng xóm bậc 1 (union out/in edges + parent + children) → `.dim` opacity .15; edge chạm trực tiếp node → `.hot` opacity 1, stroke foreground; còn lại `.dim` .05. Riêng hover SF ở mode logic → **wedge**: quạt ±24° quanh sfAng, r 60→680, fill `--muted` opacity .45, transition opacity .15s.
4. **Click node** → panel trái trượt hiện (display, không animate layout); click nền canvas → đóng + bỏ `.sel` (ring: border ring + box-shadow color-mix ring 32%).
5. **Filter chips** (6 kind): toggle trong Set; disabled theo mode (progress: step/area/file; logic: task); edge ẩn khi 1 đầu ẩn.
6. **Pan/zoom/fit**: wheel zoom-to-cursor, factor `exp(-deltaY*0.0016)`, clamp 0.3–2.6; drag nền pan (cursor grab/grabbing, bỏ qua pointerdown trên node/panel/errbox); Vừa khung = scale `min(w/W, h/H) * 0.93` căn giữa; window resize → fit.
7. **Error state**: payload lỗi → errbox overlay backdrop-blur, KHÔNG render nửa vời; decodeWarnings[] vẫn render phần còn lại + badge progress màu; popover toggle từ badge.
8. **Panel nội dung** — thứ tự: kind chip (EPIC / SF·T{n} / T / S / A / F) + X; title 14px; state chip (color-mix token); rows: Linear (mono) → epic: Nhánh đích dest → file: Đường dẫn + Nguồn + SF đụng → step: Cơ chế; **meta.summary (epic)**: 1 đoạn 12px `--muted-foreground` ngay dưới state chip, không section; Evidence (border-top, label "BẰNG CHỨNG", summary + ref mono break-all); Acceptance/Tests/Notes (mục dưới).

## Acceptance / Tests / Notes trong panel

3 section collapsible dùng chung `wakii-panel-list-section`, đặt dưới Evidence:

- **Header hàng**: label uppercase kiểu `.p-evh` — "CHẤP NHẬN" / "KIỂM THỬ" / "LƯU Ý" + count mono `--muted-foreground` "(3)" + chevron xoay 180° khi mở. Border-top `--border` phân cách như Evidence.
- **Mặc định**: mảng ≤ 3 item → mở sẵn; > 3 → thu gọn. Trạng thái mở là `useState` cục bộ per section, không persist, reset khi đổi selectedId.
- **Item**: mỗi string 1 dòng, 12px `--foreground`, line-height 1.4, `word-break: break-word`, bullet gạch đầu dòng mono `--muted-foreground` (không icon màu state — 3 mảng này không phải trạng thái). `tests` KHÔNG tô mono cả dòng; ref mono chỉ dành cho evidence.
- Ràng buộc: mảng rỗng → không render section; render thuần text (React children) — không markdown, không dangerouslySetInnerHTML; payload field optional (`acceptance?/tests?/notes?: string[]`) — vắng mặt = mảng rỗng.
- Không thêm hành động khác (không copy, không link hoá) — scope ngoài.

## Out of design scope (Dev tự quyết / CẤM mở rộng)

- **Read-only**: viewer không edit/ghi .wakii — write thuộc bin `story-mindmap`. Không chức năng save trong UI.
- **Không real-time**: không watch file, không live-reload — payload lấy 1 lần qua IPC khi mở; xem lại = mở lại file.
- **Không lib mới**: cấm d3 / react-flow / cytoscape — toàn bộ layout là toán thuần ~80 dòng từ prototype, port nguyên văn.
- **Không decode ở renderer**: payload đến đã qua decoder main (kèm decodeWarnings); renderer chỉ render.
- Không minimap, không search, không keyboard-nav, không virtualization (budget hiển thị ≤ ~60 node; vượt là việc generator sinh gọn, không phải viewer phình).
- Không hover-tooltip riêng ngoài panel (tooltip = panel), không drag node (layout computed, không layout thủ công).
