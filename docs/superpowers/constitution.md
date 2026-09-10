# Wakii Constitution

> Nguyên tắc bất biến cấp dự án — mọi story/spec/plan/review đối chiếu tại đây.
> Version: 1.1.0 | Ratified: 2026-09-08 | Last Amended: 2026-09-10

## Core Principles

### I. Evidence-first (NON-NEGOTIABLE)
NO EVIDENCE = NO CLAIM. Mọi verdict/tiến độ/quyết định phải có command output, grep dist, hoặc browser check đi kèm. Idle ≠ chết — kiểm tra 3 tầng trước khi kết luận.

### II. Analyze once, inherit many
Phase 0-2 (impact → spec → critique) chạy MỘT lần ở epic level với strictness tối đa; SF kế thừa qua context pack — không re-analyze, không hỏi lại.

### III. Supervised autonomy
Agent tự chạy nhưng decision gate là bắt buộc; merge là human gate. Tự động hóa tối đa trong khuôn gate — không gate nào bị bỏ.

### IV. Fail loud, never silent
Lỗi install/validate/drift → notify + block (retry khi đã sửa). Cấm catch-all nuốt lỗi. Silent failure = defect.

### V. Reuse before reimplement
Trước khi viết mới: kiểm implementation có sẵn (kit, plugins, utils, scripts). Everything-is-a-plugin — mỗi capability self-contained (definition + input contract + verdict format).

### VI. Contracts PINNED — bounded rewrite
Spec §-contract, wire-compat, slug/URL công khai, frontmatter schema — đã PIN thì không đổi shape. Đổi surface công khai không bị cấm — bị chặn trong khuôn doctrine **bounded rewrite** (GH-30):

1. **Rename đòi đủ 3 vật chứng**: alias declaration + migration guide + expiry date. Thiếu một → `story-surface-lint <base-ref>` FAIL, chặn merge.
2. **Alias chỉ trỏ** — single source of truth ở surface mới. Alias không mang logic, không nhận feature mới (maintenance mode). Convention lint-only: kit `alias_of` trên binEntry là metadata (runtime resolve hoãn đến khi làm install shim); docs `redirect_to:` là frontmatter convention (redirect thật hoãn đến `redirects()` implementation).
3. **Cấm shim vô hạn** — dịch hành vi cũ mãi mãi là nợ không kỳ hạn. Alias có hạn dùng; hết hạn → lint FAIL nhắc xoá.
4. **Expiry một nguồn duy nhất**: frontmatter `expires: YYYY-MM-DD` của migration guide (template: `kit/migration-guide-template.md`). Người rename đặt; thiếu → default today+90d khi merge (lint WARN mỗi lần chạy, không tự ghi file).
5. **Case mẫu**: drift wakii-mcp-server (GH-27) — bin có từ ce5acc0bee nhưng thiếu entry `provides` trong kit.json → installKit block-all toàn cục, fix trong 590fa7e. Học: surface và declaration phải ship cùng nhau. Lưu ý sử liệu: KHÔNG cite "GH-27 kit renames" — git history chỉ thêm entries, chưa xoá name nào.

### VII. Simplicity over scaffolding
Không tạo route/artifact/dependency khi chưa đau. Pattern WATCH list — chỉ hiện thực khi đủ chín.

## Governance

- Constitution supersede mọi practice khác khi xung đột.
- Amendment: đề xuất qua spec-critic → owner approval → bump version + ghi Last Amended.
- Mọi story plan có mục **Constitution Check** đối chiếu từng principle.

## Nguồn nguyên tắc (learned-log)

I-IV: FI-305/FI-339/FI-380 runs (silent installs, dead agents, verify nhầm). V-VI: FI-380 kit manifest + FI-305 contracts PINNED. VII: #7 WATCH list + #9 spec-kit comparison (2026-09-08). VI bounded-rewrite: #23 AutoGen pattern + drift wakii-mcp-server (GH-27) (2026-09-10).
