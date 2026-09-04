# Context Packs — per SF (analyze-once materialized thành files)

Mỗi SF có MỘT context pack: `docs/superpowers/contexts/sf-<n>.md`, viết lúc
CREATE (sau spec-critic, trước bracket), nằm trong repo chính để mọi SF
worktree thấy sau khi fork. Đây là cách "analyze once, inherit many" trở thành
vật thể — SF agent đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.

## Format (4 sections, đúng thứ tự — STRICT)

```markdown
# SF-N Context Pack — <tên SF>
> Đọc file này THAY VÌ tự tổng hợp... Epic spec: <path>. Bracket: <path>.
## Spec slice (chỉ phần SF-N chịu trách nhiệm)
   — numbered items trích từ epic spec, đủ chi tiết code được KHÔNG đọc lại epic
   — frame Figma nào thuộc SF-N: trỏ ĐƯỜNG DẪN capture
   `docs/superpowers/figma/<story-slug>/<frame-id>-*.md|png` (không chỉ node-id)
## Touch map (files SF-N tạo/sở hữu)
   — cây thư mục; files người khác sở hữu ghi rõ READ-ONLY
## ACCEPTANCE (user-visible)
   — 3-5 dòng ngôn ngữ NGƯỜI DÙNG: thấy gì, làm được gì. Viết từ epic success
   criteria. Đây là thứ verifier Phase 5 kiểm — KHÔNG phải chỉ process-pass.
   (VD: "Coordinator lọc đơn theo trạng thái + ngày, tạo phiếu soạn từ selection,
   popup xác nhận hiện tổng khối lượng dự kiến.")
## Boundary (KHÔNG làm)
   — gì thuộc SF khác / tier sau, đụng tới = flag không code
```

(learned 2026-08-28 FI-187-review: context packs tồn tại trong thực tế FI-187
nhưng format chưa được formalize trong skill — tri thức dễ mất khi install
kit sang máy khác; ACCEPTANCE section là gap #8 — DoD từng chỉ kiểm process.)
