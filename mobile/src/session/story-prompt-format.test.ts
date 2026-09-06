import { describe, expect, it } from 'vitest'

import { formatStoryPrompt } from './story-prompt-format'

describe('formatStoryPrompt', () => {
  it('wraps a plain idea into the create-story invocation', () => {
    expect(formatStoryPrompt('dark mode toàn app')).toBe('create story: dark mode toàn app')
  })

  it('trims surrounding whitespace before wrapping', () => {
    expect(formatStoryPrompt('  dark mode  ')).toBe('create story: dark mode')
  })

  it('preserves inner newlines so multi-line ideas survive', () => {
    expect(formatStoryPrompt('line one\nline two')).toBe('create story: line one\nline two')
  })

  it('collapses empty and whitespace-only drafts to empty', () => {
    expect(formatStoryPrompt('')).toBe('')
    expect(formatStoryPrompt('   ')).toBe('')
  })
})
