# SF-2 (VI-1 vi catalog) — independent code-review record

Reviewer: code-reviewer độc lập (read-only agent), 2026-09-27, worktree sf-2-vietnamese-i18n.

## Rounds (5 total — 3 bởi peer session trên phần catalog, 2 bởi completion session trên phần delta)

| Round | Scope | Verdict | Fixes |
|---|---|---|---|
| R1 (peer) | catalog + policy chain | CHANGES-REQUESTED — 3 P1 (global never-translate silent-revert 137 renderings ja/ko/zh/es/fr; ORCA_Gitea_* mangling; smoke vacuous-pass) | 936a9496ca |
| R2 (peer) | re-review | CHANGES-REQUESTED — 1 P1 (regression meta-test cho split invariant) + P2 smoke regex | b48ace29e2 |
| R3 (peer) | re-review | APPROVED — RED→GREEN meta-test verified; battery 47/47 | — |
| R4 (completion) | full surface + unmerged evidence commit e8a796e335 | CHANGES-REQUESTED — 3 P1 | 027670a8b7 |
| R5 (completion) | re-verify fix commit | **APPROVED** — fixes verified độc lập (regen byte-identical, 0 GT, battery 47/47, metric 100%) | — |

## R4 → R5 P1 closure

1. **`không được cam kết` phrase-form**: GT emits this form for "uncommitted" beyond the
   3 existing forms; catch-all `/cam kết/g` can't fire (`/\bcommit/i` has no word
   boundary inside "uncommitted"). Fix: 2 patterns added to VI_PHRASE_FIXES, gated on
   `/\buncommitted\b/i`. Leak was `ChangesModeView.ef25ae2d09` (outside RULE-0 scan
   surface) — now `"Không có thay đổi chưa commit."`
2. **`/orca-linear` translated**: brand term `Linear` is case-sensitive so the lowercase
   slash-command token leaked on 5 keys (GT: `/orca-tuyến tính`; search keyword reordered
   to `"tuyến tính orca"`). Fix: brand entry `'orca-linear': ['orca-tuyến tính',
   'tuyến tính orca']` + preserve pin `'orca-linear'` (reverted value lands en-identical).
3. **P2**: duplicated `'Kiểm soát nguồn'` brand form removed.

## Boundary ruling (audit note)

Commit e5a0c43f76 modified SF-1's existing `src/main/i18n/main-i18n-lazy-locale.test.ts`
(hard requirement: SF-3 owns guard tests). **Ruling: accepted with audit** — the old
assertion (`menu.file` → `'File'`) encoded the pre-translation stub state and is
falsified by SF-2's own deliverable; reverting would leave the branch B1-red (hard gate).
Change is the minimal assertion inversion + 2 added menu keys, disclosed in the commit
message. SF-3 owns future evolution of this test.

## Final state at 027670a8b7 (reviewer-verified)

- metric `14764/14764 = 100.00%` exit 0 · battery 6 files / 47 tests PASS · menu smoke 63/63
- regen simulation: cache + policy → byte-identical vi.json, 0 GT requests
- remaining P2 (non-blocking, audit log): vi search keywords raw GT (en fallback always
  indexed — search unaffected; SF-3+ candidate for `locale-search-keyword-overrides.mjs`);
  evidence txt time-of-run drift; `replaceMistranslatedForm` wrong-form substring replace
  (theoretical).
- Known minor outside review scope: `noteSlashBody` renders "the agent" as
  "nhân viên hỗ trợ" — candidate brand form for SF-3 quality pass.

**VERDICT: APPROVED** (R5, tại 027670a8b7)
