# Principle 8: Figma Pipeline (F1–F9)

> Tách từ orca-superpowers-workflow/SKILL.md — auto-triggers khi description chứa figma.com URL. Không có URL → bỏ qua nguyên principle.

## Principle 8: Figma Pipeline (auto-triggers khi description chứa figma.com URL)

**Quy tắc lõi: mọi giao tiếp với Figma đi qua MỐT pipeline F1-F13 dưới đây —
một nguồn (repo captures), một format (5 sections), một đường verify.**
Không tự chế biến thể. (Thống nhất 2026-08-28 sau FI-187: 7 mảnh rải rác —
P8 cũ, bracket Design:, captures /tmp mồ côi, URL chết theo session, review
bằng mắt agent, diff số liệu mù, launch prompt text-only — gây app khớp
text-spec mà SAI design: thiếu sidebar 48px + header + row 80px.)

**Kích hoạt:** description có `figma.com/(design|file|proto|board)/` URL
HOẶC bracket ghi `Design: figma`. Bắt đầu bằng `figma-orientation` (router).

### Tầng NGUỒN (chống mất — bài học 12 ngày mất URL)

- **F1. FIGMA-INDEX.md** tại `docs/superpowers/figma/<story-slug>/` — ghi
  file key + mọi node-id dùng trong story + trạng thái capture. URL Figma
  KHÔNG BAO GIỜ chỉ sống trong chat/session — vào index, commit, dùng mãi.
- **F2. Capture + DEEP-DIVE mọi frame spec nhắc** ngay ở Phase 0/CREATE,
  per frame-id (Figma là input trọng yếu — phân tích cạn =garbage in,
  garbage out toàn story; FI-187 trả giá: khớp text-spec, sai design):
  - `.png` — screenshot ĐẦY ĐỦ phân giải (fidelity target; KHÔNG dùng
    Orca artifacts — link hết hạn)
  - `.md` — **8 sections, đủ mới gọi là phân tích xong**:
    1. `Intent (why)` — màn này phục vụ nhịp làm việc nào; quyết định
       density/spacing/biến có mặt là vì gì
    2. `Layout logic` — auto-layout → CSS CONSTRAINT (w fixed vs fill,
       h chuẩn, gap, padding) — KHÔNG tọa độ tuyệt đối
    3. `Component inventory` — MỖI component trong frame được phân loại:
       REUSE (có sẵn /packages/ui) · EXTEND · NEW + vị trí đề xuất
    4. `States matrix` — từng element tương tác × hover/focus/disabled/
       selected/loading/empty (Figma thường chỉ vẽ default — thiếu state
       nào liệt kê thành câu hỏi, không bịa)
    5. `Tokens (đo được)` — màu/type/radius/spacing ĐO từ design context
       (không nhớ nhớ) + đối chiếu tokens package hiện có
    6. `Interactions & flows` — gì mở gì (nút → popup nào), ESC/F4,
       keyboard, polling — từ prototype connections + convention
    7. `Data shapes inferred` — frame ngụ ý API fields gì (cột bảng =
       fields của DTO; chip = enum) → feeds contracts
    8. `Open questions` — mọi điều frame KHÔNG trả lời được → thành
       REQUIREMENT-GAP ngay ở CREATE, không chờ SF gặp
  - `.json` — node-id · size · lastModified · capturedAt
  - **F2b. Design-critic round (bắt buộc ở CREATE)** — một đầu khác đọc
    capture .md SO VỚI raw design context, checklist:
    [ ] đủ 8 sections, không section rỗng không lý do
    [ ] component inventory phủ MỌI element nhìn thấy trong ảnh
    [ ] states matrix có ≥1 hàng cho mọi element tương tác
    [ ] tokens khớp màu đo được (spot-check 3)
    [ ] open questions không chứa câu mà frame thật sự đã trả lời
    Fail → bổ sung capture TRƯỚC khi CREATE commit. (Capture là spec
    của design — nó xứng đáng critic như spec-critic với spec.)
- **F3. Commit cùng story CREATE** → mọi SF kế thừa qua git (cơ chế
  context packs). Idempotent: frame-id có sẵn → reuse, không re-fetch.

### Tầng SF (kế thừa — không re-analyze)

- **F4. Launch prompt** trỏ ĐƯỜNG DẪN capture (.md + .png), không chỉ
  node-id (story-launch template đã gắn sẵn).
- **F5. Drift guard**: SF Phase 0-mini so `lastModified` capture vs Figma
  live → khác = REQUIREMENT-GAP ("Figma đổi sau duyệt — bản nào?"), không
  tự implement bản mới. Frame CHƯA capture → pull + commit trên nhánh SF.
- **F6. Code theo Intent + Layout logic + States + Tokens** — KHÔNG code
  từ ảnh suông, KHÔNG từ text-spec (text không ghi sidebar/row-height —
  FI-187 chứng minh). Tokens-only: hex cứng ngoài tokens package = P1.
  Component mới: `image-to-code` với capture làm fidelity target.

### Tầng REVIEW + VERIFY (đo được — không tin mắt dev)

- **F7. BROWSER WALKTHROUGH (bắt buộc TRƯỚC khi nói "xong")** —
  (bài học UAT 30/8: "150/150 tests xanh" ≠ "người dùng đăng nhập được".
  Agents code mù — không mở browser, không thấy màn hình, không đi trọn
  flow → user gặp lỗi ngay lần đầu. Tests unit kiểm MẢNH RIÊNG, không
  kiểm CHUỖI LIỀN. Browser walkthrough là CỔNG DUY NHẤT phát hiện:
  cookie cross-origin chết · React state không navigate · UI render sai
  · luồng người dùng đứt chỗ mà code "đúng")

  **KHI NÀO MỞ BROWSER (7 thời điểm — không được bỏ):**
  | Thời điểm | Tại sao | Làm gì |
  |---|---|---|
  | Sau MỖI task có UI | Component render đúng? | tab create → snapshot → thấy đúng → commit |
  | Sau auth/session/routing change | Cookie sống? Navigate? | Login → navigate → thấy màn |
  | Sau MỖI merge vào đích | Merge không vỡ? | Mở app → flow chính → screenshots |
  | Trước nói "task xong" | Rule 0 | Đi trọn flow → chụp → so design |
  | Khi user báo lỗi | Tái hiện bằng mắt | Làm đúng bước user → thấy lỗi |
  | Sau FIX bug | Fix có work? | Mở browser → làm lại → PASS |
  | Trước STORY-COMPLETE | F9 sweep | Mọi screen → chụp → so → sạch |

  **Trình tự F7 (agent tự làm, KHÔNG giao user):**
  ```bash
  # 1. Mở app trong browser
  orca tab create --url http://localhost:<port>

  # 2. Đi trọn luồng user bằng tay (KHÔNG curl API — phải qua UI):
  #    login → navigate → thao tác chính → logout
  #    (từng bước: fill form → click → chờ → snapshot → check kết quả)

  # 3. Nếu có auth: đăng nhập THẬT qua UI (không bypass bằng header)
  #    → verify cookie sống → verify navigate sau login

  # 4. Chụp screenshot mỗi màn (fidelity + audit trail)
  orca screenshot --format png

  # 5. Snapshot structure để audit: đủ phần tử? đúng vị trí? đúng text?
  orca snapshot

  # 6. Chỉ khi MỌI bước qua → mới được báo "UI hoạt động"
  ```

  **Fallback plugin Electron (khi app-build vỡ/stale — learned 2026-09-14 FI-461):** panel.html thật
  trong Chromium (headless) + bridge `page.exposeBinding` gọi op THẬT từ main.mjs (named exports có
  seams) + kit bin thật trên máy — chỉ transport Electron bị mock. Shape-mismatch panel↔worker
  (vd worker trả `{config:{...}}` lồng, panel đọc top-level) KHÔNG unit test nào bắt được — walkthrough
  op-thật là gate bắt loại bug này. Còn app-build sống → ưu tiên e2e fixture chuẩn.

  **Checklist F7 (phải PASS từng dòng):**
  - [ ] App mở không lỗi console (F12 network tab sạch)
  - [ ] Login → chuyển trang đúng (nếu có auth)
  - [ ] Cookie/session sống qua nhiều request (nếu cross-origin: SameSite đúng)
  - [ ] Mọi nút/form thao tác được (click thật, không chỉ inspect code)
  - [ ] Điều hướng giữa screens hoạt động
  - [ ] Chụp screenshot SO VỚI Figma capture → liệt kê gap từng mục
  - [ ] Thoát/logout → quay về màn login → back button không vào lại được

  **PHÁT HIỆN SỚM — UI audit checklist (rà từ F7 screenshot, so với design):**
  | Kiểm tra | Cách phát hiện |
  |---|---|
  | Shell: sidebar / header / footer | So ảnh — có đường phân cách dọc/ngang không? |
  | Density: row height / spacing | Đếm pixel từ screenshot (PIL) |
  | Vị trí: buttons / filters / pagination | Design ghi PHẢI → actual ở đâu? |
  | States: hover / disabled / focus / empty | Click thử + screenshot từng state |
  | Đủ phần tử: thiếu cột / thiếu nút / thiếu hint | Snapshot tree so với design tree |
  | Format: ngày / số / tiền tệ | So text từng cell với design |
  | Cross-origin cookie chết | Login xong navigate → quay về login = cookie rớt |
  | React state không update | Fill form → submit → thấy alert lỗi gì? |

- **F7b. Visual diff (sau khi walkthrough pass):** đặt CẠNH capture chuẩn
  → liệt kê từng khác biệt (vị trí + design + actual). Pixel-diff cho SỐ
  (chú ý: diff đều ≠ khớp — có thể lệch style toàn cục; diff cục bộ vọt
  = sai vùng đó). Verdict có dẫn chứng ảnh.

- **F8. UX review (P8.6)** — 3 lớp chạy như TASK trong plan (không phải
  gợi ý), so implementation lại Intent:
  · `web-design-guidelines` — 105 rules cụ thể trên CODE (a11y/focus/
    forms/animation/keyboard) — bắt lỗi ảnh không thấy được
  · `design-taste-frontend` — thẩm mỹ + anti-slop
  · `frontend-design` — chủ đích: signature, copy-as-design, calibration
    chống 3 "AI default looks"
- **F9. Story-level visual sweep** (convergence SF): mọi key screen chụp
  lại → so capture chuẩn → gap-list repair → re-chụp tới sạch.

### Quy tắc vàng (ngắn)

1. Nguồn duy nhất = repo captures + FIGMA-INDEX. Figma MCP chỉ để
   CAPTURE/lần đầu, không re-read mỗi phase.
2. **"Xong" = F7 browser walkthrough PASS + ảnh hai bên cạnh nhau.**
   Tests xanh ≠ người dùng dùng được. KHÔNG được nói "UI hoạt động"
   nếu chưa tự mở browser + đi trọn flow + chụp screenshot.
3. Thiếu capture = KHÔNG code frame đó (pull trước — 5 phút).
4. **Browser walkthrough TRƯỚC khi merge**, không phải sau. Bắt lỗi
   cookie / navigate / render ở tầng dev rẻ hơn ở tầng user 100 lần.

*(Phase 0 six-step cũ: VERIFY → DIFF vs codebase → COMPONENT MAP → FILE
STRUCTURE → IMAGE-TO-CODE → UX REVIEW vẫn đúng thứ tự bên trong — giờ
được tổ chức thành F1-F9 với storage + verify tường minh.)*

