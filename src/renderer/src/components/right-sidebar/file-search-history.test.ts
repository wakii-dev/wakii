import { describe, expect, it } from 'vitest'
import { loadSearchHistory, recordSearchQuery, saveSearchHistory } from './file-search-history'

function memoryStorage(initial: Record<string, string> = {}): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  data: Record<string, string>
} {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
    data
  }
}

describe('loadSearchHistory', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadSearchHistory(memoryStorage())).toEqual([])
  })

  it('reads back what was saved', () => {
    const storage = memoryStorage()
    saveSearchHistory(storage, ['alpha', 'beta'])
    expect(loadSearchHistory(storage)).toEqual(['alpha', 'beta'])
  })

  it('treats corrupt JSON as empty history', () => {
    expect(loadSearchHistory(memoryStorage({ 'wakii.file-search-history': '{oops' }))).toEqual([])
  })

  it('drops non-string entries from stored JSON', () => {
    expect(
      loadSearchHistory(memoryStorage({ 'wakii.file-search-history': '["ok",42,null]' }))
    ).toEqual(['ok'])
  })
})

describe('recordSearchQuery', () => {
  it('trims and prepends the new query', () => {
    expect(recordSearchQuery(['old'], '  new  ')).toEqual(['new', 'old'])
  })

  it('moves an existing query to the front instead of duplicating it', () => {
    expect(recordSearchQuery(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('caps the history at 10 entries', () => {
    let history = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10']
    history = recordSearchQuery(history, 'q11')
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('q11')
    expect(history).not.toContain('q10')
  })

  it('ignores blank queries', () => {
    expect(recordSearchQuery(['a'], '   ')).toEqual(['a'])
  })
})
