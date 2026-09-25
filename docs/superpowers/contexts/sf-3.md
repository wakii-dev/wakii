# SF-3 Context Pack — Guardrails + convergence QA
> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments. Epic spec: `docs/superpowers/specs/2026-09-25-vietnamese-i18n-design.md`. Branch đích: `story/vi-1-vietnamese-i18n`.

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)
1. **vi mistranslation guard test** — pattern `ja-technical-literal-mistranslations.test` / `ko-ui-semantic-mistranslations.test`: assert các thuật ngữ kỹ thuật (commit/worktree/merge/branch/gate/plugin/push/pull) KHÔNG bị dịch literal trong sample values của vi.json; assert brand "Wakii" không biến dạng.
2. **intl-locale.test**: thêm assert `vi` — `Intl.DateTimeFormat` weekday + relative-time format hoạt động (Chromium ICU có Vietnamese).
3. **lazy-locale.test**: thêm case vi (lazy load OK, omit-key → fallback en).
4. **Plugin-pack precedence test**: case plugin pack khai báo locale `vi` đè/không đè built-in vi qua `resolveRendererResourceLanguage` (precedence logic đã có — chỉ thêm case).
5. **git-blame-locale-catalog.test**: thêm `vi` vào `CATALOGS` (hardcode 6 → 7) khi vi đủ 9 git-blame keys.
6. **Coverage ratchet hook**: TÁI DỤNG metric script của SF-2 (một định nghĩa translatedness duy nhất — cấm viết lại); test chặn vi translatedness KHÔNG GIẢM so baseline ghi cứng lúc ship; en thêm key mới KHÔNG chặn (pattern locale-english-regression.test: cấm blanket gate).
7. **Visual pass các màn chính** (browser walkthrough Rule 0 — screenshot BEFORE/AFTER): Settings/Appearance, terminal pane, sidebar/worktree list, command palette — mọi thứ tiếng Việt, không raw key, không layout vỡ (chuỗi vi dài hơn en ~10-20%).
8. **User spot-check gate**: tổng hợp screenshots các màn chính → gửi user xác nhận (GATE bắt buộc — quyết định #1).
9. **`docs/reference/vietnamese-localization.md`** (mới): cách vi.json được sinh (pipeline), glossary nằm đâu, quy trình thêm key mới (en.json → sync runtime → bootstrap vi → ratchet test).

## Touch map
- Sở hữu: test files mới/cập nhật trong `src/renderer/src/i18n/` (vi-*, lazy-locale, intl-locale, git-blame-locale-catalog, coverage-ratchet), plugin-pack precedence test (vị trí theo test precedence hiện có), `docs/reference/vietnamese-localization.md`.
- Read-only: vi.json (SF-2 sản phẩm — SF-3 KHÔNG sửa nội dung catalog; giá trị xấu → ghi notes để SF-2 fix), registry/loaders (SF-1).
- KHÔNG đụng: bootstrap script, translation policy.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)
- Toàn bộ test i18n + guard mới xanh (`pnpm vitest run src/renderer/src/i18n/` + suite liên quan).
- Visual pass: 4 màn chính tiếng Việt, screenshots BEFORE (en) / AFTER (vi) đính plan/Linear.
- User spot-check: xác nhận bằng lời/comment trên epic (hoặc worktree comment).
- Coverage ratchet: chạy test với vi.json giảm 1 giá trị thủ công → ĐỎ; nguyên trạng → XANH.

## Boundary
- KHÔNG sửa catalog vi.json (SF-2 sở hữu — thấy lỗi ghi notes).
- KHÔNG re-test registry wiring (SF-1 gate đã kiểm).
- KHÔNG mở scope sang mobile/CLI/plugin packs (out-of-scope epic).
- Tier-gate: gate SF-3 chỉ test chất lượng + guardrails; mọi wiring đã SF-1 chốt.
