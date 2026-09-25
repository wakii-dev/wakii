import { describe, expect, it } from 'vitest'
import { buildSearchRows, getNextMatchRowIndex, setAllSearchFilesCollapsed } from './search-rows'

describe('buildSearchRows', () => {
  it('includes file headers and expanded matches in row order (summary is rendered separately)', () => {
    const rows = buildSearchRows(
      {
        totalMatches: 3,
        truncated: false,
        files: [
          {
            filePath: '/repo/a.ts',
            relativePath: 'a.ts',
            matches: [
              { line: 1, column: 1, matchLength: 3, lineContent: 'foo' },
              { line: 2, column: 5, matchLength: 3, lineContent: 'bar foo' }
            ]
          },
          {
            filePath: '/repo/b.ts',
            relativePath: 'nested/b.ts',
            matches: [{ line: 8, column: 2, matchLength: 3, lineContent: ' foo' }]
          }
        ]
      },
      new Set<string>()
    )

    expect(rows.map((row) => row.type)).toEqual(['file', 'match', 'match', 'file', 'match'])
  })

  it('omits match rows for collapsed files', () => {
    const rows = buildSearchRows(
      {
        totalMatches: 2,
        truncated: true,
        files: [
          {
            filePath: '/repo/a.ts',
            relativePath: 'a.ts',
            matches: [{ line: 1, column: 1, matchLength: 3, lineContent: 'foo' }]
          },
          {
            filePath: '/repo/b.ts',
            relativePath: 'b.ts',
            matches: [{ line: 2, column: 1, matchLength: 3, lineContent: 'foo' }]
          }
        ]
      },
      new Set<string>(['/repo/a.ts'])
    )

    expect(rows.map((row) => row.type)).toEqual(['file', 'file', 'match'])
  })

  it('preserves the file result object for renderer-side count normalization', () => {
    const fileResult = {
      filePath: '/repo/a.ts',
      relativePath: 'a.ts',
      matchCount: 5,
      matches: [{ line: 1, column: 1, matchLength: 3, lineContent: 'foo' }]
    }

    const rows = buildSearchRows(
      {
        totalMatches: 5,
        truncated: false,
        files: [fileResult]
      },
      new Set<string>()
    )

    expect(rows[0]).toMatchObject({ type: 'file', fileResult })
    expect(rows[1]).toMatchObject({ type: 'match', fileResult })
  })
})

const twoFileResults = {
  totalMatches: 3,
  truncated: false,
  files: [
    {
      filePath: '/repo/a.ts',
      relativePath: 'a.ts',
      matches: [{ line: 1, column: 1, matchLength: 3, lineContent: 'foo' }]
    },
    {
      filePath: '/repo/b.ts',
      relativePath: 'b.ts',
      matches: [{ line: 2, column: 1, matchLength: 3, lineContent: 'foo' }]
    }
  ]
}

describe('setAllSearchFilesCollapsed', () => {
  it('collects every result file path when collapsing', () => {
    const collapsed = setAllSearchFilesCollapsed(twoFileResults, true)
    expect([...collapsed]).toEqual(['/repo/a.ts', '/repo/b.ts'])
  })

  it('returns an empty set when expanding', () => {
    const collapsed = setAllSearchFilesCollapsed(twoFileResults, false)
    expect(collapsed.size).toBe(0)
  })

  it('returns an empty set for null results', () => {
    expect(setAllSearchFilesCollapsed(null, true).size).toBe(0)
  })
})

describe('getNextMatchRowIndex', () => {
  const rows = buildSearchRows(twoFileResults, new Set<string>())
  // Row layout: 0 file a, 1 match a, 2 file b, 3 match b.

  it('moves down to the next match row, skipping file headers', () => {
    expect(getNextMatchRowIndex(rows, 1, 1)).toBe(3)
  })

  it('moves up to the previous match row, skipping file headers', () => {
    expect(getNextMatchRowIndex(rows, 3, -1)).toBe(1)
  })

  it('returns null at the boundary', () => {
    expect(getNextMatchRowIndex(rows, 3, 1)).toBeNull()
    expect(getNextMatchRowIndex(rows, 1, -1)).toBeNull()
  })

  it('returns null when there are no match rows at all', () => {
    const collapsed = buildSearchRows(twoFileResults, new Set(['/repo/a.ts', '/repo/b.ts']))
    expect(getNextMatchRowIndex(collapsed, 0, 1)).toBeNull()
  })
})
