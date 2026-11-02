---
name: figma-implement-design
description: >-
  Implement design Figma 1:1 sang code production qua Figma MCP chính chủ — get_design_context
  (không đoán bằng mắt), get_screenshot = source of truth validate, assets chỉ tải từ MCP,
  token mapping BẮT BUỘC sang tokens main.css của project, kết thúc bằng design-system gate
  review BẮT BUỘC trước khi nộp PR. Use khi user đưa Figma URL/node-id, bảo "implement design",
  "code theo Figma", "dựng UI theo mock/design", hoặc cần parity 1:1 với design.
  Yêu cầu Figma MCP đã cài (`claude mcp add figma` — xem Bước 0).
---

# Figma Implement Design — wakii-ized

> Nguồn gốc: aitmpl creative-design/figma-implement-design (CEO chọn phương án "A", 02/11) —
> wakii-ized batch 3: setup MCP theo Claude Code (không phải codex), design-system gate review,
> token mapping main.css, security fence figma.com.

## Doctrine bất di bất dịch (giữ nguyên từ bản gốc)

- **Context-first**: CẤM đoán design bằng mắt — LUÔN `get_design_context` + `get_screenshot` TRƯỚC khi viết dòng code đầu tiên.
- **Screenshot = source of truth** cho validate visual; dữ liệu cấu trúc (layout/typography/tokens) lấy từ `get_design_context`.
- **Assets chỉ từ MCP**: source `localhost` trong payload dùng nguyên bản — CẤM thêm icon package ngoài, CẤM dùng placeholder khi đã có source.
- **Reuse > recreate**: component/primitives/tokens của project ưu tiên trước bản dịch literal từ Figma; có sẵn thì extend, đừng tạo trùng.
- **Document deviations**: lệch design vì a11y hoặc ràng buộc kỹ thuật → ghi comment code nêu lý do.
- **SECURITY fence**: CHỈ dùng MCP chính chủ `https://mcp.figma.com/mcp` (figma.com). CẤM cấu hình Figma MCP qua server khác hay gửi design data đi endpoint nào khác (bài học Context Leakage của bản gốc).

## Quy trình 8 bước — làm đúng thứ tự, không nhảy bước

### Bước 0 — Setup Figma MCP (nếu chưa có)

Nếu MCP call fail vì chưa kết nối → dừng, setup, rồi chạy lại từ đầu:

1. Thêm MCP bằng Claude Code (BẮT BUỘC — bản gốc hướng dẫn `codex mcp add`, SAI cho hệ mình):

   ```sh
   claude mcp add figma --url https://mcp.figma.com/mcp
   ```

2. OAuth login 1 LẦN: `/mcp` trong Claude Code → chọn `figma` → login qua browser. Token lưu trên máy — các session sau không phải login lại.
3. Phương án thay thế cho selection local: cài thêm `figma-desktop` MCP — user chọn node trực tiếp trong Figma desktop app, không cần URL (remote server thì LUÔN cần URL).

Sau khi login xong, bảo user restart session rồi tiếp tục Bước 1.

### Bước 1 — Lấy node (fileKey + nodeId)

**Option A — parse từ Figma URL** (mặc định):

- URL format: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
- `fileKey` = đoạn sau `/design/`; `nodeId` = giá trị `node-id` (ví dụ `42-15`).

**Option B — selection từ Figma desktop** (chỉ khi dùng `figma-desktop` MCP): không cần URL — server tự dùng node đang chọn trong file đang mở; tool call chỉ cần `nodeId`.

### Bước 2 — Fetch design context

```
get_design_context(fileKey=":fileKey", nodeId="1-2")
```

Nhận về: layout (Auto Layout/constraints/sizing), typography, màu + design tokens, cấu trúc component/variants, spacing/padding.

**Response quá lớn hoặc truncated**: `get_metadata(fileKey, nodeId)` lấy node map cấp cao → chọn child node cần thiết → `get_design_context` từng child riêng.

### Bước 3 — Capture visual reference

```
get_screenshot(fileKey=":fileKey", nodeId="1-2")
```

Screenshot này là **source of truth** cho mọi validate phía sau — giữ truy cập được suốt quá trình implement.

### Bước 4 — Tải assets

- Download mọi assets (ảnh/icon/SVG) mà Figma MCP trả về.
- Source `localhost` từ MCP → dùng nguyên bản, KHÔNG sửa tay URL.
- CẤM import/thêm icon package ngoài — toàn bộ assets phải đến từ Figma payload.
- CẤM dùng placeholder khi đã có source.

### Bước 5 — Token mapping (BẮT BUỘC — wakii-ized)

- Màu / spacing / typography PHẢI map sang **tokens `main.css`** của project — CẤM hard-code hex, CẤM giữ nguyên Tailwind utility mặc định từ output Figma.
- Output MCP (thường React + Tailwind) là **mô tả design + behavior**, KHÔNG phải code style cuối.
- Có primitives shadcn / component sẵn tương ứng → dùng hoặc extend; chưa có → tạo mới theo convention project và ghi rõ trong handoff.
- Token Figma lệch token project → ưu tiên token project, chỉ chỉnh spacing/size tối thiểu để giữ fidelity, và document lệch đó.

### Bước 6 — Implement theo convention project

- Component đặt đúng thư mục design system của project, đặt tên theo convention sẵn có.
- Tránh inline style, trừ giá trị thực sự động.
- TypeScript types cho props; component giữ composable, tái sử dụng được.

### Bước 7 — Validate parity 1:1

So UI cuối với screenshot Bước 3 — checklist:

- [ ] Layout khớp (spacing, alignment, sizing)
- [ ] Màu khớp tuyệt đối (đã map token, không còn hex rải rác)
- [ ] Typography khớp (font, size, weight, line-height)
- [ ] Interactive states đúng thiết kế (hover, active, disabled, focus)
- [ ] Responsive theo constraints Figma
- [ ] Assets render đúng
- [ ] WCAG accessibility đạt

Validate sớm và thường xuyên trong lúc làm, đừng đợi cuối cùng.

### Bước 8 — Design-system gate review (BẮT BUỘC trước PR — wakii-ized)

Gọi **design-system agent** review diff theo đủ 3 trục:

1. STYLEGUIDE.md của project
2. tokens `main.css` (quét lại: không sót hard-code)
3. primitives shadcn (đúng component, đúng variant)

Gate này khớp G1.5/handoff-spec của team — **không PASS thì không nộp PR**. FAIL → sửa theo nhận xét rồi review lại. KHÔNG tự đánh dấu PASS thay agent, KHÔNG bỏ qua gate vì "changement nhỏ".

## Lỗi thường gặp

| Triệu chứng | Xử lý |
|---|---|
| `get_design_context` quá lớn/truncated | `get_metadata` → fetch child riêng (Bước 2) |
| UI không khớp sau implement | So song song với screenshot Bước 3; đối chiếu spacing/màu/typography trong design context |
| Assets không load | Dùng nguyên si `localhost` URL từ MCP, không sửa tay; kiểm tra endpoint MCP còn truy cập được |
| Token Figma ≠ token project | Ưu tiên token project (Bước 5), chỉnh tối thiểu, document |
| MCP call fail | Quay lại Bước 0 — kiểm tra `claude mcp list`, OAuth còn hạn |
