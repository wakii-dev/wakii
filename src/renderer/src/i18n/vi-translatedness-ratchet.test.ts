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
 * A count only drops when an existing vi value reverts toward English —
 * exactly the regression this ratchet exists to catch.
 */
import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import vi from './locales/vi.json'
import { computeTranslatedness } from '../../../../config/scripts/locale-translatedness-metric.mjs'

const SF2_SHIP_TRANSLATED_COUNT = 14_764

describe('vi translatedness ratchet', () => {
  it('never drops below the SF-2 ship baseline', () => {
    const result = computeTranslatedness(en, vi, 'vi')
    expect(result.translated).toBeGreaterThanOrEqual(SF2_SHIP_TRANSLATED_COUNT)
  })
})
