import { describe, expect, it } from 'vitest'
import { parseBracketHeading, parseBracketSfs, type BracketSf } from './bracket-file-parse'

// Mirrors docs/superpowers/brackets/fi305-superpowers-android.md
const REAL_BRACKET = `# Story: FI-305 — Superpowers on Android — story workflow từ điện thoại (view + gates + notifications)
Destination: story/fi305-superpowers-android

## SF-1 Desktop RPC foundation + gate notifications
Tier: 0
linear: FI-306
Design: none
What: client mobile paired gọi được RPC để list stories
Depends on: —
Tasks: bracket-parse-shared-module / story-list-method

## SF-2 Mobile story screens + Linear status
Tier: 1
linear: FI-307
Design: none
What: mở app là thấy story list group theo worktree
Depends on: SF-1
Tasks: contract-conformance-smoke-test

## SF-3 Gate resolve UX + notification handling
Tier: 1
linear: FI-308
Design: none
What: phone thấy pending gates
Depends on: SF-1
Tasks: resolve-flow-options-freetext-confirm

## SF-4 Convergence QA + deep-link wiring
Tier: 2
linear: FI-309
Design: none
What: flow đầu-cuối chạy thật trên Android
Depends on: SF-2, SF-3
Tasks: deep-link-route-wiring
`

/** Type-safe narrowing: 'parse-error' is a valid union member the caller must handle. */
function expectParsedSfs(result: BracketSf[] | 'parse-error'): BracketSf[] {
  if (!Array.isArray(result)) {
    throw new Error('unexpected parse-error')
  }
  return result
}

describe('parseBracketHeading', () => {
  it('extracts epic id and full title from a real-format heading', () => {
    const result = parseBracketHeading(REAL_BRACKET, 'fi305-superpowers-android.md')
    expect(result.epicId).toBe('FI-305')
    expect(result.title).toBe(
      'Superpowers on Android — story workflow từ điện thoại (view + gates + notifications)'
    )
  })

  it('keeps extra — in the title (greedy capture to end of line)', () => {
    const text = '# Story: FI-1 — Alpha — beta'
    expect(parseBracketHeading(text, 'x.md')).toEqual({
      epicId: 'FI-1',
      title: 'Alpha — beta'
    })
  })

  it('falls back to file name without .md when heading is missing', () => {
    expect(parseBracketHeading('no heading here', 'my-story.md')).toEqual({
      epicId: null,
      title: 'my-story'
    })
  })

  it('trims heading title whitespace', () => {
    const text = '# Story: FI-2 —   Spaced title   '
    expect(parseBracketHeading(text, 'x.md').title).toBe('Spaced title')
  })
})

describe('parseBracketSfs', () => {
  it('parses a real-format bracket with 4 SFs (tiers 0/1/1/2)', () => {
    const sfs = expectParsedSfs(parseBracketSfs(REAL_BRACKET))
    expect(sfs).toHaveLength(4)
    expect(sfs.map((sf) => sf.tier)).toEqual([0, 1, 1, 2])
    expect(sfs.map((sf) => sf.linear)).toEqual(['FI-306', 'FI-307', 'FI-308', 'FI-309'])
    expect(sfs[0]).toMatchObject({
      name: 'SF-1',
      title: 'Desktop RPC foundation + gate notifications',
      what: 'client mobile paired gọi được RPC để list stories',
      dependsOn: []
    })
    expect(sfs[3]?.dependsOn).toEqual(['SF-2', 'SF-3'])
    expect(sfs[1]?.dependsOn).toEqual(['SF-1'])
  })

  it('returns [] for a valid heading with zero SF sections (caller sets sfTotal 0)', () => {
    expect(parseBracketSfs('# Story: FI-1 — Lone story\nbody text')).toEqual([])
  })

  it("returns 'parse-error' only when there is no heading AND no SF sections", () => {
    expect(parseBracketSfs('just some random notes\nnothing bracket-like')).toBe('parse-error')
    expect(parseBracketSfs('')).toBe('parse-error')
  })

  it('still parses SF sections when the heading is missing (not a parse-error)', () => {
    const sfs = expectParsedSfs(parseBracketSfs('## SF-1 Orphan section\nTier: 2'))
    expect(sfs).toHaveLength(1)
    expect(sfs[0]).toMatchObject({ name: 'SF-1', title: 'Orphan section', tier: 2 })
  })

  it('defaults missing fields (tier 0, empty what, no dependsOn, null linear)', () => {
    const text = '# Story: FI-1 — Sparse\n\n## SF-1 Bare section\n\n## SF-2 Next\nWhat: only what'
    const sfs = expectParsedSfs(parseBracketSfs(text))
    expect(sfs[0]).toEqual({
      name: 'SF-1',
      title: 'Bare section',
      tier: 0,
      what: '',
      dependsOn: [],
      linear: null
    })
    expect(sfs[1]).toMatchObject({ what: 'only what', tier: 0, linear: null })
  })

  it('handles CRLF line endings', () => {
    const crlf = REAL_BRACKET.replace(/\n/g, '\r\n')
    const sfs = expectParsedSfs(parseBracketSfs(crlf))
    expect(sfs).toHaveLength(4)
    expect(sfs[3]?.dependsOn).toEqual(['SF-2', 'SF-3'])
    expect(sfs.map((sf) => sf.linear)).toEqual(['FI-306', 'FI-307', 'FI-308', 'FI-309'])
    const heading = parseBracketHeading(crlf, 'fi305.md')
    expect(heading.epicId).toBe('FI-305')
    expect(heading.title).toBe(
      'Superpowers on Android — story workflow từ điện thoại (view + gates + notifications)'
    )
  })
})
