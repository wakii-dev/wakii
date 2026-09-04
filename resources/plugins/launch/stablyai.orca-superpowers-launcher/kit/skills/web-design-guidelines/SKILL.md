---
name: web-design-guidelines
description: >-
  Review UI code against 105 concrete Web Interface Guidelines rules (a11y,
  focus, forms, animation, layout, content). Use when reviewer/P8.6 audits UI:
  "review my UI", "check accessibility", "audit design", "check UX", hoặc khi
  F7/F8 trong Figma Pipeline cần heuristic engine cụ thể. Rules vendored trong
  resources/ (offline-safe) — fetch-latest chỉ khi online và muốn cập nhật.
  Nguồn: vercel-labs/web-interface-guidelines (MIT).
---

# Web Interface Guidelines — UI review engine (105 rules)

Đây là lớp HEURISTICS cụ thể cho review UI: mỗi rule kiểm được bằng code,
không cần cảm nhận. Dùng cùng (không thay thế) capture chuẩn + ảnh đối chiếu.

## Khi nào chạy

- **F7 visual review** (code-reviewer): sau khi so ảnh 2 bên, chạy rules
  này trên code của screens — bắt lỗi ảnh không thấy (aria, focus, forms,
  keyboard, reduced-motion).
- **F8 / P8.6 UX review**: checklist nền + gpt-taste (thẩm mỹ) +
  frontend-design (chủ đích).
- Bất kỳ lúc user nói "review UI/UX", "audit accessibility".

## Cách chạy

1. Đọc rules: `resources/web-interface-guidelines.md` (vendored — luôn
   sẵn, không phụ thuộc mạng; bài học SSL-filter: không fetch bắt buộc).
2. Đọc files UI được chỉ định (hoặc pattern — components/screens của SF).
3. Kiểm MỖI rule, ghi finding `file:line` — terse, high signal.
4. Phân loại P1 (a11y blocker, focus thiếu, form sai type) / P2 (nice).

Optional refresh (chỉ khi online chủ đích): upstream
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
— diff với bản vendored, cập nhật + ghi ngày trong NOTICE nếu đổi.

## Provenance

- Upstream: github.com/vercel-labs/web-interface-guidelines (MIT, © 2025
  Vercel Labs) — vendored nguyên vẹn tại `resources/` kèm LICENSE-upstream.
- Vendored vào story-team-kit 2026-08-28 làm engine cho P8 F7/F8.
