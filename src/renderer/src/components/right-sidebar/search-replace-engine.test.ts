import { describe, expect, it } from 'vitest'
import {
  compileSearchRegExp,
  deriveReplacements,
  isInvalidReplaceRegex
} from './search-replace-engine'

const FLAGS_OFF = { caseSensitive: false, wholeWord: false, useRegex: false }
const flags = (overrides: Partial<typeof FLAGS_OFF> = {}) => ({ ...FLAGS_OFF, ...overrides })

describe('compileSearchRegExp', () => {
  it('builds a global regex from a literal query', () => {
    const re = compileSearchRegExp('foo', flags())
    expect(re.global).toBe(true)
    expect('foo foo'.match(re)).toEqual(['foo', 'foo'])
  })

  it('escapes regex metacharacters in literal mode', () => {
    const re = compileSearchRegExp('a.c', flags())
    expect('a.c abc'.match(re)).toEqual(['a.c'])
  })

  it('respects caseSensitive off and on', () => {
    expect('Foo foo FOO'.match(compileSearchRegExp('foo', flags()))).toHaveLength(3)
    expect('Foo foo FOO'.match(compileSearchRegExp('foo', flags({ caseSensitive: true })))).toEqual(
      ['foo']
    )
  })

  it('uses the raw pattern in regex mode', () => {
    const re = compileSearchRegExp('f(o+)?', flags({ useRegex: true }))
    expect('foo f'.match(re)).toEqual(['foo', 'f'])
  })

  it('rejects JS-invalid regex patterns (POSIX class)', () => {
    expect(isInvalidReplaceRegex('[[:alpha:]]', flags({ useRegex: true }))).toBe(true)
    expect(isInvalidReplaceRegex('foo', flags({ useRegex: true }))).toBe(false)
    expect(isInvalidReplaceRegex('[[:alpha:]]', flags())).toBe(false)
  })
})

describe('deriveReplacements', () => {
  it('replaces literal matches and reports spans', () => {
    const result = deriveReplacements('hello world hello', 'hello', 'hi', flags())
    expect(result.matchCount).toBe(2)
    expect(result.newContent).toBe('hi world hi')
    expect(result.replacements).toEqual([
      { start: 0, end: 5, replacement: 'hi' },
      { start: 12, end: 17, replacement: 'hi' }
    ])
  })

  it('expands $1 capture groups in regex mode', () => {
    const result = deriveReplacements('abc123 def456', '(\\w+?)(\\d+)', '$2-$1', flags({ useRegex: true }))
    expect(result.matchCount).toBe(2)
    expect(result.newContent).toBe('123-abc 456-def')
  })

  it('expands $& in regex mode only and escapes $$', () => {
    const whole = deriveReplacements('cat', 'cat', '[$&]', flags({ useRegex: true }))
    expect(whole.newContent).toBe('[cat]')
    // Literal mode treats the replacement term as plain text — no template expansion.
    const literal = deriveReplacements('cat', 'cat', '[$&]', flags())
    expect(literal.newContent).toBe('[$&]')
    const escaped = deriveReplacements('a5', '\\d', '$$1', flags({ useRegex: true }))
    expect(escaped.newContent).toBe('a$1')
  })

  it('derives from multi-line regex matches spanning \\n', () => {
    const result = deriveReplacements('foo\nbar', 'foo\\nbar', 'baz', flags({ useRegex: true }))
    expect(result.matchCount).toBe(1)
    expect(result.newContent).toBe('baz')
  })

  it('keeps correct indices across multi-byte and astral characters', () => {
    const result = deriveReplacements('Xin chào thế giới', 'chào', 'hello', flags())
    expect(result.newContent).toBe('Xin hello thế giới')
    expect(result.replacements[0]).toEqual({ start: 4, end: 8, replacement: 'hello' })

    const astral = deriveReplacements('a🎉b', 'a🎉b', 'x', flags())
    expect(astral.newContent).toBe('x')
    // 'a🎉b' is 4 UTF-16 code units (🎉 is a surrogate pair).
    expect(astral.replacements[0]).toEqual({ start: 0, end: 4, replacement: 'x' })
  })

  it('wholeWord uses Unicode-aware boundaries, unlike ASCII \\b', () => {
    const content = 'cát cátí 9cát cát.'
    const result = deriveReplacements(content, 'cát', 'X', flags({ wholeWord: true }))
    // Standalone "cát" and "cát." match; "cátí" (following letter) and "9cát" (preceding digit) do not.
    expect(result.matchCount).toBe(2)
    expect(result.newContent).toBe('X cátí 9cát X.')
  })

  it('wholeWord wraps a regex pattern with the same boundaries', () => {
    const result = deriveReplacements('foo bar', 'fo+', 'X', flags({ wholeWord: true, useRegex: true }))
    expect(result.newContent).toBe('X bar')
  })

  it('preserves CRLF and BOM bytes exactly', () => {
    const content = '﻿first\r\nsecond\r\n'
    const result = deriveReplacements(content, 'first', 'première', flags())
    expect(result.newContent).toBe('﻿première\r\nsecond\r\n')
  })

  it('empty replace term removes matches', () => {
    const result = deriveReplacements('aaa', 'aa', '', flags())
    expect(result.matchCount).toBe(1)
    expect(result.newContent).toBe('a')
    expect(result.replacements).toEqual([{ start: 0, end: 2, replacement: '' }])
  })

  it('skips zero-length regex matches instead of churning content', () => {
    const result = deriveReplacements('bab', 'a*', 'X', flags({ useRegex: true }))
    expect(result.matchCount).toBe(1)
    expect(result.newContent).toBe('bXb')
  })

  it('returns unchanged content and zero matches when nothing matches', () => {
    const result = deriveReplacements('abc', 'zzz', 'x', flags())
    expect(result.matchCount).toBe(0)
    expect(result.newContent).toBe('abc')
    expect(result.replacements).toEqual([])
  })
})
