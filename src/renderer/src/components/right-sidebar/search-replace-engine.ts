// Why: stored SearchMatch positions cannot be trusted for replacement — the
// git-grep fallback reports whole lines, fabricated submatch spans appear in
// some transports, and rg byte offsets are not JS string indices. The engine
// re-derives every match from the fresh file content using the original query
// and flags; the stored match list is only a candidate-file roster.

export type SearchReplaceFlags = {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
}

export type DerivedReplacement = {
  /** UTF-16 code-unit span in the fresh content (exclusive end). */
  start: number
  end: number
  replacement: string
}

export type DerivedReplacements = {
  replacements: DerivedReplacement[]
  newContent: string
  matchCount: number
}

export function isInvalidReplaceRegex(query: string, flags: SearchReplaceFlags): boolean {
  try {
    compileSearchRegExp(query, flags)
    return false
  } catch {
    return true
  }
}

export function compileSearchRegExp(query: string, flags: SearchReplaceFlags): RegExp {
  const source = flags.wholeWord
    ? `${UNICODE_WORD_BOUNDARY_PREFIX}(?:${buildPatternSource(query, flags)})${UNICODE_WORD_BOUNDARY_SUFFIX}`
    : buildPatternSource(query, flags)
  return new RegExp(source, buildRegExpFlags(flags))
}

const UNICODE_WORD_BOUNDARY_PREFIX = '(?<![\\p{L}\\p{N}_])'
const UNICODE_WORD_BOUNDARY_SUFFIX = '(?![\\p{L}\\p{N}_])'

function buildPatternSource(query: string, flags: SearchReplaceFlags): string {
  if (flags.useRegex) {
    return query
  }
  return escapeRegExp(query)
}

function buildRegExpFlags(flags: SearchReplaceFlags): string {
  let patternFlags = 'gu'
  if (!flags.caseSensitive) {
    patternFlags += 'i'
  }
  return patternFlags
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Why: JS string ops are UTF-16 code-unit based, so spans from matchAll index
// correctly across multi-byte (chào) and astral (🎉) characters, and splicing
// the original string preserves CRLF and BOM bytes without any normalization.
export function deriveReplacements(
  content: string,
  query: string,
  replaceTerm: string,
  flags: SearchReplaceFlags
): DerivedReplacements {
  const regex = compileSearchRegExp(query, flags)
  const replacements: DerivedReplacement[] = []
  for (const match of content.matchAll(regex)) {
    if (match[0].length === 0) {
      // Why: zero-length matches (e.g. /a*/) have nothing to replace; taking
      // them would churn the file for no diff.
      continue
    }
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: flags.useRegex
        ? expandReplacementTemplate(replaceTerm, match)
        : replaceTerm
    })
  }

  let newContent = content
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, replacement } = replacements[i]
    newContent = newContent.slice(0, start) + replacement + newContent.slice(end)
  }

  return { replacements, newContent, matchCount: replacements.length }
}

// Why: manual splice bypasses String.prototype.replace, so the replacement
// template ($1, $&, $$, ...) must be expanded against the match explicitly.
export function expandReplacementTemplate(template: string, match: RegExpExecArray): string {
  const input = match.input
  return template.replace(/\$\$|\$&|\$`|\$'|\$(\d{1,2})|\$<([^>]+)>/g, (token, digits, name) => {
    if (token === '$$') {
      return '$'
    }
    if (token === '$&') {
      return match[0]
    }
    if (token === '$`') {
      return input.slice(0, match.index)
    }
    if (token === "$'") {
      return input.slice(match.index + match[0].length)
    }
    if (digits !== undefined) {
      const index = Number(digits)
      return index >= 1 && index < match.length ? (match[index] ?? '') : ''
    }
    if (name !== undefined && match.groups) {
      return match.groups[name] ?? ''
    }
    return token
  })
}
