# Story: VI-1 — Hỗ trợ tiếng Việt (UI language built-in thứ 7)
Destination: story/vi-1-vietnamese-i18n
Epic spec: docs/superpowers/specs/2026-09-25-vietnamese-i18n-design.md
Context packs: docs/superpowers/contexts/vi-1-sf-1.md · vi-1-sf-2.md · vi-1-sf-3.md (SF ĐỌC PACK thay tự tổng hợp — prefix vi-1 tránh collision sf-*.md của story khác, bài học FI-458 B2)
Linear: ⏳ epic + sub-issues deferred — workspace FI unreachable (memory 21/09), remap lúc APPROVE khi workspace sống

## SF-1 Registry + wiring + pipeline enablement
Tier: 0
linear:
Depends on: —
What: picker Settings→Appearance có "Tiếng Việt", chọn được + persist; UI giữ tiếng Anh (catalog stub, fallback en) không crash; settings search ra dòng Language; tc xanh + plural probe vi có kết quả
Tasks: vi-vao-ui-language / vi-vao-ui-locale / picker-choice-va-fallback-tieng-viet / tao-vi-json-stub / renderer-lazy-loader / main-i18n-lazy-loader / appearance-search-keyword-va-endonym / en-json-picker-key / regen-runtime-catalog / bootstrap-locale-config-vi / gitignore-cache-file / plural-probe-runtime / smoke-switch-en-fallback-vi-vn

## SF-2 Catalog vi.json full production
Tier: 1
linear:
Depends on: SF-1
What: switch vi → settings/sidebar/worktree/dialogs tiếng Việt thực sự; native menu bar tiếng Việt; translatedness 100% leaf keys; brand Wakii không biến dạng
Tasks: bootstrap-prefix-flag / metric-script-translatedness / pipeline-run-nen-resume / glossary-vao-translation-policy / native-picker-labels-vi-pin / lo-1-settings / lo-2-terminal-git / lo-3-sidebar-worktree / lo-4-onboarding-dialogs-menus / lo-5-long-tail-cache-resume / plural-other-toan-bo / translatedness-100 / catalog-resync / native-menu-smoke

## SF-3 Guardrails + convergence QA
Tier: 2
linear:
Depends on: SF-2
What: guard tests vi xanh (mistranslation/intl/lazy/plugin-precedence/git-blame/coverage-ratchet); 4 màn chính tiếng Việt chuẩn qua visual pass; user spot-check xác nhận
Tasks: vi-mistranslation-guard / intl-locale-assert-vi / lazy-locale-test-vi / plugin-pack-precedence-case / git-blame-catalog-them-vi / coverage-ratchet-hook / visual-pass-man-chinh / user-spot-check-gate / docs-reference-vietnamese-localization
