# VU-14 SF-3 — Phase 4 notes (27/09)

## Quyết định kiến trúc
1. **Payload ngoài tab state**: decoded payload sống trong map riêng `wakiiViewerFiles` (keyed
   theo path) thay vì field trên OpenFile — session-restore không mang payload 5MB, tab restore
   không payload → placeholder sạch (không render nửa vời). Precedent checkRunDetails để metadata
   trên tab nhưng metadata nhỏ; payload .wakii cap 5MB.
2. **Preload type OPTIONAL**: `onOpenWakiiFile?` / `consumePendingWakiiFileOpens?` là optional
   members trong `UiCommandEventApi` — desktop preload của SF-2 (song song) chưa merge vẫn
   typecheck-pass; glue dùng optional chaining như markdown bridge. Web api (web-ui-api.ts)
   không phải đụng tới.
3. **Types ở src/shared/wakii-mindmap-types.ts** (file mới ngoài component map): preload type
   file chỉ import được từ src/shared (không renderer); tách file mới = zero conflict với SF-2.
4. **contentType giữ 'editor'** ở tầng unified tab — wakii là editor-family tab (A1); phân biệt
   render hoàn toàn qua `mode === 'wakii-viewer'` trong EditorContent. Không đụng TabContentType.
5. **SF_RING derive tổng quát**: permutation search (n≤8, tie-break lexicographic) maximise
   depends-on kề nhau trên ring — reproduce đúng ring prototype cho golden fixture; n>8 fallback
   tier+id sort.
6. **Camera = ref imperative** (use-wakii-camera): wheel/pointer 60fps ghi thẳng vào
   viewport.style.transform; fit() expose qua ref cho nút Vừa khung + window resize.

## Khác biệt so với prototype c.html (có chủ đích)
- Bỏ #tabbar giả (app đã có editor tab thật — A1).
- Golden fixture nâng cấp đạt schema v1 strict: file node bắt buộc có `title`; thêm
  meta.summary + mảng knowledge ở sf-1 (mục tiêu tự-chứa tri thức 27/09 — pack ACCEPTANCE
  dòng 2 yêu cầu panel có các mảng này).
- Nút "Mô phỏng lỗi" chỉ render ở import.meta.env.DEV; error payload thật → card không nút Đóng
  (đóng = đóng tab).
- Theme không phải state của viewer (theo theme system app); e2e flip class `.dark` trên <html>.

## Bài học / vết
- Fixture file node thiếu `title` là lỗi schema thật mà prototype payload mang theo — tc bắt
  được (TS2741). SF-4 nên rà fixture/.wakii thật qua decoder story-mindmap.
- `check:code-quality:changed` mặc định resolve diff base về commit upstream cũ (841d06a) →
  351 findings branch-wide pre-existing trên story branch; chạy scoped `... 241fed8aed` = PASS.
  Coordinator nên lưu ý khi đọc gate ở branch dài.
- `consistent-type-assertions: never` áp cả file test → test harness cast phải bọc
  oxlint-disable-next-line + SAFETY rationale (protocol AGENTS.md); component test viết
  cast-free bằng querySelector<T> generics.

## Pre-existing red (không thuộc SF-3 — đã report PM trong test-run.txt)
- runtime-required-catalog.test.ts ×2 (drift en-runtime-required.json vs en.json, 118 entry,
  brand Wakii/Orca) — diff en.json của SF-3 = 53 additions thuần.
- MonacoEditor.breadcrumbs.test.tsx ×1 (mock store thiếu getState; không qua EditorContent).

## Gate story-verify (bước 4 checklist) — 27/09
`~/.claude/bin/story-verify sf-3` → [B1:PASS B2:PASS B2b:PASS B3:UNKNOWN B4:FAIL B5:PENDING]
- B4 FAIL = STRUCTURAL PRE-MERGE (HEAD chưa là ancestor của dest) — merge là việc
  COORDINATOR (checklist bước 3 cấm SF worker merge). Tự PASS khi merge.
- B5 PENDING = Linear deferred (ruling 27/09).
- B3 UNKNOWN = Linear-deferred sạch.
Root-cause chain gate-resolve (giống hệt SF-1, WORKTREE-LOCAL + KHÔNG commit —
git checkout -- docs/superpowers/brackets/ khôi phục được):
1. Bracket glob chọn nhầm bracket story khác (fi305 có `## SF-3` + `linear: FI-308`
   alphabet-first) → B3 FAIL ảo → rm worktree-local 7 bracket story khác, giữ vu-14.
2. awk gsub(/.*linear: /) cần "linear: " có space; `linear:` trống → extract thành
   chuỗi "linear:" → bị coi là có Linear → sed worktree-local bỏ dòng `linear:` trống.
→ Lớp kit (story-verify bracket-fallback) nên fix theo metadata dest-match — report PM.

## Review round 1 → fixes (27/09)
Code-reviewer (độc lập): CHANGES-REQUESTED — 0 P0 · 2 P1 · 5 P2. Boundary cấm sạch toàn bộ
(0 dangerouslySetInnerHTML/innerHTML, 0 raw palette, 0 lib mới); i18n 0 mismatch; coverage
table đủ 41 file. Report: /tmp/story/vu-14/code-reviewer-sf-3.md
Fix P1 (kèm meta-test RED→GREEN đúng protocol — test ĐỎ trên code cũ):
1. Panel collapsible không reset theo selectedId (key={section}) → key=`${node.id}:${section}`
   + meta-test: sf-1 mở NOTES → click sf-2 → NOTES(4) collapsed lại (RED trên code cũ ✓).
2. Payload lookup theo tab id trượt khi path bị owner khác chiếm (owned id
   `editor:global-floating-terminal:local:P` ≠ P) → EditorContent lookup theo
   `activeFile.filePath`; meta-test EditorContent.test.tsx (RED cũ ✓; phát hiện kèm:
   zustand v5 SSR snapshot = getInitialState → test phải dùng RTL client render).
P2 đã fix: contract comment id `epic` (types), composite keys chống trùng string
(3 chỗ), e2e import TOGGLE_FLOATING_TERMINAL_EVENT + bỏ mọi `as unknown as` casts.
P2 KHÔNG fix (ghi chú): payload không xoá khi đóng tab (bounded, re-push refresh —
cần đụng thêm store surface, để SF-4 cân nhắc); click-sau-pan đóng panel (giữ nguyên
hành vi prototype, không moved-guard).
Bỗ sung test: +2 (reset-section, owned-id lookup) → viewer suites 42 test.
