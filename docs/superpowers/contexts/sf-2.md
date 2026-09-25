# SF-2 Context Pack — Catalog vi.json full production
> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments. Epic spec: `docs/superpowers/specs/2026-09-25-vietnamese-i18n-design.md`. Branch đích: `story/vi-1-vietnamese-i18n`.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)
1. **Flag `--prefix <p>` cho bootstrap-locale-catalog.mjs** — lọc key-prefix khi dịch (cơ chế chia lô chưa tồn tại: script hiện clone toàn cây en và dịch mọi value chưa có trong cache mỗi lượt; 11-12k request Google Translate / lượt full). Cache vẫn là backstop (run lại full = chỉ dịch phần thiếu).
1b. **Metric script translatedness (`--prefix` aware)** — đếm leaf keys có giá trị vi ≠ en theo prefix; DỰNG TRƯỚC lô 1. Exit criterion MỖI LÔ = `metric --prefix <lô>` = 100% trên domain đó. KHÔNG tự chế định nghĩa thứ hai — SF-3 ratchet TÁI DÙNG script này.
1c. **Pipeline ops protocol**: run nền từng lô (`nohup … > log`), monitor tiến độ, chết giữa chừng → resume qua cache (script save cache mỗi 25 items), retry 429. **5 lô CHẠY TUẦN TỰ bắt buộc** (cùng vi.json + cùng cache — parallel = merge conflict chắc chắn): lô N+1 chỉ start khi `metric --prefix <lô N>` = 100%.
2. **Glossary cơ chế (chốt TRƯỚC lô đầu — cache lưu giá trị ĐÃ repair, nhiễm là bền vững):** map glossary onto `config/scripts/locale-translation-policy.mjs` — `LOCALE_VALUE_OVERRIDES.vi` (giá trị đích cụ thể) / `LOCALE_KEY_OVERRIDES` (key vi dịch khác) / `BRAND_MISTRANSLATIONS.vi` (brand Wakii/Orca/Linear/Claude/Codex bị GT biến dạng → repair) — tái dùng cấu trúc `locale-generic-ui-terms.mjs`. Thuật ngữ giữ Anh: commit, worktree, merge, branch, gate, plugin, staging, push/pull/rebase, sidebar, tab…
3. **`NATIVE_PICKER_LABELS.vi` pin đủ 6 endonym** (english/chinese/korean/japanese/spanish/french/vietnamese — repairCatalog pin label picker; thiếu entry = label vi.json không deterministic). 5 locale khác thiếu key `vietnamese` là CHẤP NHẬN (runtime fallback endonym qua getUiLanguageChoiceLabel) — không "sửa".
4. **5 lô dịch — TUẦN TỰ (1c)**: lô 1 `--prefix settings.` / lô 2 terminal+git / lô 3 sidebar+worktree / lô 4 onboarding+dialogs+menus / lô 5 còn lại. Mỗi lô: bootstrap (`--prefix`) → **exit `metric --prefix` = 100%** → spot-check sample ≤10 key trong plan → commit vi.json.
5. **Plural:** mọi key plural en (`*_one`/`*_other`) có `*_other`; `_one` clone từ en là dead key (chấp nhận — pattern ja.json).
6. **Metric exit SF-2: translatedness = số leaf keys có giá trị vi ≠ giá trị en → 100%** (bootstrap clone full tree nên key KHÔNG BAO GIỜ thiếu — so-sánh-key-only là vacuous; phải so GIÁ TRỊ).
7. Re-run `pnpm run sync:localization-runtime-catalog` (en.json đã thêm key picker từ SF-1).
8. Native menu smoke: translateMain với vi trả chuỗi Việt cho vài menu chính.

## Touch map
- Sở hữu: `config/scripts/bootstrap-locale-catalog.mjs` (flag --prefix), `config/scripts/locale-translation-policy.mjs` (vi entries), `src/renderer/src/i18n/locales/vi.json` (nội dung), cache file (gitignored).
- Append-only: `.gitignore` nếu cache file tên khác quy ước.
- Read-only: `locale-generic-ui-terms.mjs` (pattern tham khảo), các mistranslation test (SF-3 sở hữu).
- KHÔNG đụng: registry/loaders/picker (SF-1 đã chốt), mọi test guard (SF-3).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)
- Switch vi → Settings/Appearance, sidebar, worktree pages, dialogs hiển thị tiếng Việt thực sự (không phải en, không phải GT-literal awkward theo glossary).
- Native menu bar vài mục chính tiếng Việt (File/Edit/View… theo translateMain).
- Translatedness = 100% leaf keys (script in số: vi≠en trên toàn leaf).
- Brand "Wakii" không bị dịch sai trong sample spot-check.

## Boundary
- KHÔNG sửa registry/loaders/picker/search (SF-1 chốt).
- KHÔNG thêm/chữa test guard (SF-3) — kể cả thấy giá trị dịch chưa chuẩn nghiêm trọng: ghi vào plan notes cho SF-3.
- KHÔNG dịch key thuộc `ENGLISH_ONLY_KEY_PREFIXES` (giữ giá trị en nguyên văn).
- Rate-limit Google Translate: chạy nền từng lô (nohup > log), KHÔNG chạy full không-cache; cache chặn re-request.
