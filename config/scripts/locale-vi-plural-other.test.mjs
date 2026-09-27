import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// CLDR vi has a single plural category (other) — i18next resolves *_other for
// every count and *_one is a dead key (SF-1 runtime probe). So the catalog
// contract is structural: every en plural family must carry *_other in vi.json.
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/

function collectLeaves(value, prefix = '', leaves = []) {
  if (typeof value === 'string') {
    leaves.push([prefix, value])
    return leaves
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return leaves
  }
  for (const [key, child] of Object.entries(value)) {
    collectLeaves(child, prefix ? `${prefix}.${key}` : key, leaves)
  }
  return leaves
}

describe('vi plural catalog contract', () => {
  it('every en plural family has a string *_other value in vi.json', async () => {
    const localesDir = path.join('src', 'renderer', 'src', 'i18n', 'locales')
    const en = JSON.parse(await fs.readFile(path.join(localesDir, 'en.json'), 'utf8'))
    const vi = JSON.parse(await fs.readFile(path.join(localesDir, 'vi.json'), 'utf8'))
    const viEntries = new Map(collectLeaves(vi))

    const families = new Map()
    for (const [key] of collectLeaves(en)) {
      const match = key.match(PLURAL_SUFFIX_RE)
      if (!match) {
        continue
      }
      const base = key.slice(0, -match[0].length)
      if (!families.has(base)) {
        families.set(base, new Set())
      }
      families.get(base).add(match[1])
    }

    expect(families.size).toBeGreaterThan(0)
    const violations = []
    for (const [base, suffixes] of families) {
      const otherKey = `${base}_other`
      const value = viEntries.get(otherKey)
      if (typeof value !== 'string' || value.length === 0) {
        violations.push(`${otherKey} (family: ${[...suffixes].join('/')})`)
      }
    }
    expect(violations).toEqual([])
  })
})
