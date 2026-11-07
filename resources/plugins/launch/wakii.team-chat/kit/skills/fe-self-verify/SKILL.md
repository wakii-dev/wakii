---
name: fe-self-verify
description: >-
  Vòng tự kiểm UI cho FE worker — mở dev server trong tab browser của Wakii,
  chụp screenshot bằng orca CLI, ĐỌC ảnh bằng mắt agent, tự đánh giá so ý định
  thiết kế, sửa code, chụp lại — TRƯỚC khi báo DONE.
  Use khi: "verify UI", "tự kiểm UI", "screenshot", "trước khi DONE UI",
  task FE có phần visual sắp xong, hoặc CEO yêu cầu evidence ảnh kèm DONE.
  Chỉ cho WEB UI (MF dev server / Storybook); app Electron renderer dùng
  pattern CDP riêng (xem mục Bẫy thật).
---

# fe-self-verify — FE worker tự nhìn UI mình viết trước khi DONE

Nguyên tắc: **đưa ra claim "UI xong" mà chưa nhìn thấy UI = claim vô căn cứ**.
Agent đọc được ảnh — screenshot là bằng chứng rẻ nhất, nhanh nhất, CEO nhìn
live được trên tab trong Wakii. Ảnh before/after hover-blame 06-07/11 là
evidence quyết định giúp CEO duyệt mà không phải tự chạy lại.

## 1. Vòng fe-self-verify (4 bước, lặp cho tới khi đạt)

### Bước 1 — Dev server: DÙNG CHUNG per worktree
- Kiểm server đã chạy trước khi bật: `curl -s -o /dev/null -w "%{http_code}" localhost:<port>`
  (2xx/3xx = đang sống; chết/không phản hồi mới khởi động).
- Chết → khởi động lại: `pnpm --filter shell dev` (MF), hoặc lệnh dev tương ứng repo.
- **CẤM bật server thứ 2 cùng port** — cổng bị chiếm sẽ khởi động nửa vời hoặc
  ghi đè phiên của worker khác trong cùng worktree. Server là tài nguyên chung
  per worktree, không phải của riêng task này.

### Bước 2 — Mở UI trong tab browser của Wakii
```sh
orca tab list --json                  # tab đã có cùng URL → orca tab switch (đừng tạo trùng)
orca tab create --url localhost:<port>
```
Tab nằm trong browser của Wakii — **CEO nhìn live được** từ panel, đây là lý
do dùng tab Orca thay vì mở trình duyệt ngoài.

### Bước 3 — Chụp + ĐỌC + tự đánh giá
```sh
orca screenshot                       # in ra đường dẫn file ảnh
# nếu chỉ muốn ảnh khi trang thực sự đổi (tránh trùng file qua các vòng):
orca screenshot --if-changed
```
- **ĐỌC file ảnh bằng tool Read** (agent đọc được ảnh) — không chụp cho có.
- Tự đánh giá so với: (a) ý định thiết kế của task, (b) mockup đã duyệt nếu có.
- Sửa code → chạy lại Bước 3. Vòng dừng khi ảnh khớp tiêu chí mục 3, không
  phải khi "chắc chắn ổn".

### Bước 4 — Gắn evidence vào DONE
Lưu ảnh chụp cuối (và before/after nếu có sửa) kèm báo cáo DONE — xem chuẩn
DONE mục 4.

## 2. Chụp cái gì

- **Viewport nguyên trang là mặc định** — `orca screenshot` không tham số đã
  đủ cho đa số check layout/trạng thái trang.
- Cần cô lập 1 component (đúng trạng thái, đúng prop, không bị trang che) →
  **Storybook :6006**: bật storybook dev server, `orca tab create --url localhost:6006`,
  điều hướng tới story cần chụp rồi `orca screenshot`.
- State động (hover, focus, dropdown mở) mà screenshot tĩnh không giữ được →
  dùng `orca computer`/click qua CLI trước khi chụp, hoặc chụp cả hai trạng
  thái before/after rồi so.

## 3. Tiêu chí "đúng"

Ảnh đạt khi ĐỒNG THỜI:
1. **Khớp mockup đã duyệt** (nếu task có mockup) — layout, spacing, trạng thái.
2. **Đạt chuẩn design skill** đang áp dụng cho task (frontend-design /
   ui-ux-pro-max) — không thiếu trạng thái hover/focus/empty/error.
3. **Không vỡ layout pseudo-locale** — check theo `skills/i18n-ui-layout`
   (pseudo-locale `en-XA` dựng sẵn, pattern width co giãn, truncation có chủ đích).
4. **Tokens đúng** — theo `skills/wakii-tokens-workflow`; anchor dự phòng:
   `docs/STYLEGUIDE.md` + tokens `src/renderer/src/assets/main.css` (cấm
   hard-code hex — quy tắc token mapping BẮT BUỘC trong skill
   figma-implement-design của kit).

**Người đánh giá cuối = CEO trên tab live** — screenshot của bạn là đề xuất
evidence, không phải phê duyệt thay thế.

## 4. Chuẩn DONE

**Task UI chưa có screenshot kèm DONE = chưa DONE.** Báo DONE phải kèm:
- đường dẫn ảnh cuối (và before/after nếu đã sửa theo vòng trên), và
- 1 dòng tự đánh giá so tiêu chí mục 3 (mục nào đạt, mục nào đang chờ CEO).

## Bẫy thật

- **App desktop ≠ web tab**: skill này cho **WEB UI** chạy qua MF dev server /
  Storybook trong tab browser của Wakii. App Electron renderer (Wakii desktop
  chính nó) KHÔNG dùng vòng này — phải chụp qua **pattern CDP riêng** với
  renderer ẩn, `ORCA_BACKGROUND_LAUNCH=1`, không `show()`/focus — xem
  `skills/electron-renderer` và mục Electron UI Validation trong AGENTS.md.
- Không `curl` được port nhưng process đang bật → server nghe interface khác
  (vd. chỉ bind localhost khi bạn curl qua 127.0.0.1 ngược lại) — tra log
  server trước khi bật bản sao thứ 2.
- Ảnh nhìn "ổn" ở viewport hiện tại chưa đủ nếu task đụng layout co giãn —
  thu hẹp cửa sổ/pseudo-locale rồi chụp lại (mục 3.3).

## Nguồn

- Lệnh tab/screenshot: `orca tab create --help`, `orca screenshot --help`,
  `orca tab --help` (orca CLI bản 11/2026 — `--if-changed`, `--format`,
  `--worktree`, `--page`).
- Tinh thần verify nền: `AGENTS.md:5` — Electron UI Validation (nền ẩn, CDP,
  không steal focus; web tab là nhánh nhẹ của cùng nguyên tắc).
- Tiêu chí pseudo-locale: `skills/i18n-ui-layout/SKILL.md` (:65 pseudo-locale
  `en-XA`, :105 nguồn `src/shared/pseudo-localization.ts`).
- Tiêu chí tokens: `skills/wakii-tokens-workflow` (task authoring song song —
  chưa có trong cây thì dùng anchor `docs/STYLEGUIDE.md` +
  `src/renderer/src/assets/main.css` + token mapping trong
  `kit/skills/figma-implement-design/SKILL.md:6`).
- Electron renderer (KHÔNG dùng skill này): `AGENTS.md` Electron UI Validation
  + `skills/electron-renderer` (task authoring song song).
- Bằng chứng quyết định: kinh nghiệm 06-07/11 — ảnh hover-blame before/after
  là evidence giúp CEO duyệt SF-1 blame GitLens mà không chạy lại tay.

## Nâng cao — tận dụng tối đa Orca browser (06/11)
- `orca screenshot --annotate`: gắn nhãn [N] cho mọi element tương tác (ref @eN) — nhìn ảnh biết ngay cái gì bấm được; dùng khi soi a11y/mục tiêu click
- `orca tab create --split`: chia đôi tab — dev server + Storybook hiển thị song song khi chỉnh component
- `orca tab create --worktree <selector> --profile <id>`: gắn tab vào worktree cụ thể + profile cách ly session ngay lúc tạo (nhiều worker cùng test không đè session)
- `orca screenshot --worktree <selector>`: chụp tab của worktree bất kỳ từ xa — Captain giám sát UI nhiều room không cần mở màn hình
