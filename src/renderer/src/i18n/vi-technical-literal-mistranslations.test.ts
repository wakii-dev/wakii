/**
 * Guards the Vietnamese catalog against the bootstrap pipeline's literal-
 * translation failure mode. The epic glossary decision (25/09) keeps git
 * vocabulary — commit/worktree/merge/branch/gate/plugin/push/pull — in English
 * inside Vietnamese sentences, and the "Wakii" brand must not deform.
 *
 * Sample asserts pin known-good sentences; the catalog-wide scans catch a
 * bootstrap re-translation regression anywhere in vi.json, not just at the
 * sampled keys.
 */
import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import vi from './locales/vi.json'

function flattenStringLeaves(node: unknown, prefix = '', leaves = new Map<string, string>()) {
  if (!node || typeof node !== 'object') {
    return leaves
  }
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      leaves.set(path, value)
    } else {
      flattenStringLeaves(value, path, leaves)
    }
  }
  return leaves
}

const EN_LEAVES = flattenStringLeaves(en)
const VI_LEAVES = flattenStringLeaves(vi)

/** en value is exactly this short UI label (button/action labels, not sentences). */
function exactLabelKeys(label: string): string[] {
  return [...EN_LEAVES.entries()].filter(([, value]) => value === label).map(([key]) => key)
}

describe('vi technical literal guards', () => {
  it('keeps short git action labels in English (Push/Pull/Merge/Branch/Commit)', () => {
    for (const label of ['Push', 'Pull', 'Merge', 'Branch', 'Commit']) {
      const keys = exactLabelKeys(label)
      expect(keys.length, `en.json should carry the ${label} label`).toBeGreaterThan(0)
      for (const key of keys) {
        expect(VI_LEAVES.get(key), `${key} literal-translated the ${label} label`).toBe(label)
      }
    }
  })

  it('never renders commit as the literal cam kết', () => {
    const violations = [...EN_LEAVES.entries()]
      .filter(
        ([key, value]) => /\bcommit/i.test(value) && /cam kết/i.test(VI_LEAVES.get(key) ?? '')
      )
      .map(([key]) => key)
    expect(violations).toEqual([])
  })

  it('never renders branch as the literal nhánh', () => {
    const violations = [...EN_LEAVES.entries()]
      .filter(
        ([key, value]) => /\bbranch/i.test(value) && /\bnhánh/i.test(VI_LEAVES.get(key) ?? '')
      )
      .map(([key]) => key)
    expect(violations).toEqual([])
  })

  it('keeps the Wakii brand casing everywhere it appears', () => {
    const deformed = [...VI_LEAVES.entries()]
      .filter(([, value]) => /wakii/i.test(value) && !value.includes('Wakii'))
      .map(([key, value]) => `${key}: ${value}`)
    expect(deformed).toEqual([])
  })

  it('pins known-good sentences that keep git vocabulary inline', () => {
    // Source-control primary actions keep the English verb.
    expect(
      VI_LEAVES.get('auto.components.right.sidebar.source.control.primary.action.95550cff15')
    ).toBe('Push')
    expect(
      VI_LEAVES.get('auto.components.right.sidebar.source.control.primary.action.d64292a938')
    ).toBe('Pull')
    // Git error copy keeps branch + brand.
    expect(VI_LEAVES.get('auto.store.slices.worktrees.d1d78a7baa')).toMatch(/branch/)
    expect(VI_LEAVES.get('auto.store.slices.worktrees.d1d78a7baa')).toMatch(/Wakii/)
    // PR vocabulary keeps pull/merge in the sentence.
    expect(VI_LEAVES.get('auto.lib.linear.usage.examples.attachPrSummary')).toMatch(/\bpull\b/)
    expect(VI_LEAVES.get('auto.lib.linear.usage.examples.attachPrSummary')).toMatch(/\bmerge\b/)
    // Worktree stays a worktree.
    expect(VI_LEAVES.get('menu.openWorktreePalette')).toMatch(/Worktree/)
    expect(VI_LEAVES.get('auto.hooks.useSettingsNavigationMetadata.pluginsDescription')).toMatch(
      /plugin Wakii/
    )
  })
})
