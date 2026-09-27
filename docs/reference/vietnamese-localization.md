# Vietnamese UI localization (vi)

`vi` is the seventh built-in UI language and the first whose catalog was produced by the
machine-translation bootstrap (VI-1). This doc covers how `vi.json` is produced, where the
glossary lives, and what to do when the English catalog changes. The registry/wiring side
(language picker, lazy loaders) is described by the code itself: `src/renderer/src/i18n/`
and `src/shared/ui-language.ts`.

## The one translatedness definition

Everything that claims "vi is translated" goes through `computeTranslatedness()` in
`config/scripts/locale-translatedness-metric.mjs`. A leaf counts as translated when the vi
value **differs from the English value** — comparing values, not keys, because the bootstrap
clones the full English tree, so a missing key can never happen; only the value tells you
whether a string was actually translated. Two classes are satisfied by _staying equal_ to
English: preserve-policy leaves (`shouldPreserveEnglishValue`) and the seven language-picker
endonym labels (`Tiếng Việt`, `中文（简体）, …`), which every catalog pins verbatim.

The SF-3 ratchet test (`src/renderer/src/i18n/vi-translatedness-ratchet.test.ts`) reuses
that same function against a hard-coded floor: the translated-leaf **count** at ship
(14764). The floor is a count, not a percentage, on purpose — a percentage drops whenever
`en.json` grows a key that isn't translated yet, which would gate normal English growth. A
count drops only when translated content disappears: a vi value reverting toward English,
or a translated key removed from `en.json` (the metric walks the en tree). For a deliberate
en-side removal, bump the baseline in the same commit so the drop is a reviewed decision.

## How vi.json is produced

`config/scripts/bootstrap-locale-catalog.mjs vi [--prefix p1,p2]` is the pipeline:

1. It clones the full English tree, so every key always exists.
2. It translates leaf values through a machine-translation provider (value-level cache on
   disk — re-running a batch is free, interrupted batches resume by re-running the command).
3. It repairs the result through `repairCatalog` (`locale-translation-policy.mjs`), which
   applies the glossary _after_ translation so the cache never holds poisoned values.

`--prefix` scopes a run to dotted-key prefixes (batching). A full run without `--prefix`
sweeps the long tail; the per-batch exit gate is the metric above with the same `--prefix`.

## Where the glossary lives

Three repair entry points in `config/scripts/`, all applied by `repairCatalog`:

- `locale-brand-mistranslations.mjs` (`BRAND_MISTRANSLATIONS.vi`) — reverts observed
  machine-translation deformations of brands and Latin technical terms back to the Latin
  form (`Wakii`, `commit`, `branch`, `Claude Code`, the Gemini zodiac homograph, …). The
  wrong-form list was built from real translator probes, not guesses.
- `locale-vi-value-overrides.mjs` (`LOCALE_VALUE_OVERRIDES.vi`) — pins a specific English
  value to a specific Vietnamese value (wrong-button class: Save → `Lưu`, not `Cứu`).
- `locale-vi-key-overrides.mjs` (`LOCALE_KEY_OVERRIDES.vi`) — pins a specific _key_.

Vi-specific support files: `locale-vi-preserve-english-values.mjs` (whole-value tech labels
that stay English for vi only), `locale-vi-phrase-fixes.mjs` (phrase-level repairs), and
`NATIVE_PICKER_LABELS.vi` inside the policy (all seven picker endonyms, deterministic
through `repairCatalog`). The structural contract tests live next to the data:
`locale-translation-policy.vi.test.mjs`, `locale-vi-plural-other.test.mjs`.

Vietnamese CLDR has a single plural category (`other`), so i18next resolves every count
through `*_other`; `*_one` entries copied from `en.json` are dead but harmless.

## Adding or changing a key (the en → vi path)

1. Change the string in the app source (the `translate(key, fallback)` call site) and let
   `pnpm run sync:localization-catalog` fold it into `en.json` — or edit `en.json` directly
   if that is how the surface you touch is maintained.
2. Run the bootstrap for the new leaves: `node config/scripts/bootstrap-locale-catalog.mjs
vi --prefix <affected prefixes>` (the value cache keeps the untouched catalog free).
3. Check the result: `node config/scripts/locale-translatedness-metric.mjs vi --prefix …`
   per batch, then full — and the guard tests
   (`pnpm vitest run --config config/vitest.config.ts src/renderer/src/i18n/`), which pin
   Latin technical vocabulary, brand casing, picker endonyms, and the translatedness floor.
4. Regenerate the eager English bundle: `pnpm run sync:localization-runtime-catalog`
   (produces `en-runtime-required.json`; `verify:*` variants run read-only in `pnpm lint`).
5. If a value mistranslates, fix it in the glossary/override files above and re-run the
   bootstrap — do not hand-edit `vi.json` alone; the next bootstrap pass would overwrite it.

## Guards (SF-3)

- `vi-technical-literal-mistranslations.test.ts` — exact-label keys (`Push`/`Pull`/`Merge`/
  `Branch`/`Commit`) keep the English label; conditional scans ban the observed literal
  forms (`cam kết`, `nhánh`) wherever the English source carries the term; the `Wakii`
  brand keeps its casing catalog-wide; sentence samples keep vocabulary inline.
- `vi-translatedness-ratchet.test.ts` — the count floor described above.
- `intl-locale.test.ts` / `lazy-locale.test.ts` — real-ICU Vietnamese formatting
  (weekday/relative time), lazy-load delivery, English fallback for omitted keys, and
  plugin-pack precedence (a pack declaring `vi` wins when selected; the built-in pick still
  resolves the shipped catalog).
- `git-blame-locale-catalog.test.ts` — ships the nine git-blame strings in all seven locales.

Known leaked values at ship are recorded for a later catalog pass in
`docs/superpowers/evidence/sf-3-vietnamese-i18n/vi-catalog-notes-for-sf-2.md` — the guards
deliberately assert only classes that are clean today, so a leak fix can tighten them later.
