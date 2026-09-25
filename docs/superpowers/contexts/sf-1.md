# SF-1 Context Pack — Registry + wiring + pipeline enablement (vi)
> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments. Epic spec: `docs/superpowers/specs/2026-09-25-vietnamese-i18n-design.md`. Branch đích: `story/vi-1-vietnamese-i18n`.

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)
1. Registry: `vi` vào `SUPPORTED_UI_LOCALES` (src/shared/ui-locale.ts) + `UI_LANGUAGE_VIETNAMESE`/union/`UI_LANGUAGE_VALUES` (src/shared/ui-language.ts).
2. Picker: `UI_LANGUAGE_CHOICES` thêm `{value:'vi', labelKey:'settings.appearance.language.vietnamese'}` SAU French + `UI_LANGUAGE_CHOICE_FALLBACKS.vi = 'Tiếng Việt'` (src/renderer/src/i18n/supported-languages.ts).
3. **Tạo `src/renderer/src/i18n/locales/vi.json` = `{}` TRƯỚC khi wiring loader** (dynamic import bundle-time: thiếu file = tc + build đỏ).
4. Loaders: `NON_DEFAULT_LOCALE_LOADERS.vi` (src/renderer/src/i18n/i18n.ts) + `LAZY_LOCALE_LOADERS.vi` (src/main/i18n/main-i18n.ts) — cả hai `Record<Exclude<SupportedUiLocale,'en'>,...>` nên thiếu = tc đỏ.
5. Settings search (HAI phần — không mục nào tc bắt, exit greppable): `appearance-search.ts` (a) `translateSearchKeyword('settings.appearance.language.vietnamese', 'Tiếng Việt')` entry + (b) literal `'Tiếng Việt'` vào danh sách keyword cứng (dòng ~57-62).
6. en.json + key `settings.appearance.language.vietnamese: "Tiếng Việt"` → re-run `pnpm run sync:localization-runtime-catalog`.
7. Bootstrap: `LOCALE_CONFIG.vi = { targetLanguage: 'vi', ... }` (config/scripts/bootstrap-locale-catalog.mjs — copy pattern locale khác) + `.gitignore` += `.vi-catalog-cache.json`.
8. **Plural probe (exit criterion đo được):** script/it nhỏ chạy i18next với `lng:'vi'` + key plural `_one/_other` → assert resolver chọn `_other`, `_one` là dead key (pattern ja.json `connectedHostCount_one`). Ghi kết quả vào plan — SF-2 dựa vào đó.
9. Smoke: switch vi qua settings → UI giữ tiếng Anh (fallback) không crash; assert thêm system-path `vi-VN` → resolve `vi` qua SUPPORTED_UI_LOCALES.includes; `pnpm tc` xanh.

## Touch map
- Sở hữu: `src/shared/ui-language.ts`, `src/shared/ui-locale.ts`, `src/renderer/src/i18n/supported-languages.ts`, `src/renderer/src/i18n/i18n.ts`, `src/main/i18n/main-i18n.ts`, `src/renderer/src/i18n/locales/vi.json` (stub), `src/renderer/src/components/settings/appearance-search.ts`, `.gitignore` (dòng cache), `config/scripts/bootstrap-locale-catalog.mjs` (CHỈ LOCALE_CONFIG entry — flag `--prefix` là của SF-2).
- Append-only: `src/renderer/src/i18n/locales/en.json` (1 key picker).
- Read-only: `locale-translation-policy.mjs` (SF-2 sửa), mọi mistranslation test (SF-3).
- tc-batched (tự bắt qua union type, không cần sửa tay): `appearance-interface-summary.ts`, `AppearanceInterfaceSection.tsx`, `default-global-settings.ts`.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)
- Settings → Appearance → Language có "Tiếng Việt" (endonym), chọn được, persist sau restart.
- UI khi chọn vi (catalog rỗng) = tiếng Anh, không crash, không key rỗng.
- Settings search gõ "Việt"/"vietnamese" ra dòng Language.
- `pnpm tc` xanh; plural probe có kết quả ghi trong plan.

## Boundary
- KHÔNG dịch bất kỳ key nào (SF-2); KHÔNG đụng locale-translation-policy.mjs (SF-2); KHÔNG thêm test guard mistranslation (SF-3).
- KHÔNG đổi cơ chế lazy/eager (invariant lazy-locale.test: en eager ~128KB, locale khác lazy).
- KHÔNG special-case zh-tw-style cho vi (primary-subtag đã xử lý vi-VN → vi).
