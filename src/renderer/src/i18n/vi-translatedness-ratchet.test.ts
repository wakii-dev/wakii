/**
 * VI-1 SF-3 coverage ratchet: the vi catalog may not lose translated values.
 *
 * Reuses SF-2's `computeTranslatedness` — the single definition of
 * translatedness — rather than a second implementation.
 *
 * The baseline is the translated-leaf COUNT at SF-2 ship (2026-09-27,
 * metric 14764/14764 = 100%), not a ratio: an English-side key addition
 * lowers a ratio while the catalog is untranslated and would create a
 * blanket gate on normal en growth (banned, cf. locale-english-regression).
 * A count drops only when translated content disappears — an existing vi
 * value reverting toward English, or a translated key being removed from
 * en.json (the metric walks the en tree). Both are worth failing the build
 * over; for a deliberate en-side removal, bump the baseline in the same
 * commit so the drop is a reviewed decision.
 */
import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import vi from './locales/vi.json'
import { computeTranslatedness } from '../../../../config/scripts/locale-translatedness-metric.mjs'

// Re-baselined after the 2026-11-02 upstream sync: upstream key renames/removals
// reset translated coverage to 14,962. The vi-1 sweep translates and ratchets up.
// Re-baselined 14,962 → 14,959 by Rebrand Tier 2 (03/11): merging duplicate brand-key
// variants (HEAD carried both orca-* and wakii-* siblings for 8 keys; values were
// identical post-rename) removed 8 en leaves. No translated content lost.
const SF2_SHIP_TRANSLATED_COUNT = 14_959

describe('vi translatedness ratchet', () => {
  it('never drops below the SF-2 ship baseline', () => {
    const result = computeTranslatedness(en, vi, 'vi')
    expect(result.translated).toBeGreaterThanOrEqual(SF2_SHIP_TRANSLATED_COUNT)
  })
})
