// Pure bracket-file parsing shared by desktop RPC + plugin host bindings.
// No fs/node:path — callers own IO.

export type BracketHeading = {
  epicId: string | null
  title: string
}

export type BracketSf = {
  name: string
  title: string
  tier: number
  what: string
  dependsOn: string[]
  linear: string | null
}

// Permissive charset ([A-Za-z]) is intentional: plugin parser uses [A-Z] only.
const HEADING_RE = /^#\s+Story:\s*([A-Za-z]+-\d+)\s*[—–-]\s*(.+)$/m
const SF_SECTION_RE = /^##\s+(SF-\d+)\s+(.+)$/gm

export function parseBracketHeading(text: string, fileName: string): BracketHeading {
  const m = text.match(HEADING_RE)
  return {
    epicId: m?.[1] ?? null,
    title: m?.[2].trim() ?? fileName.replace(/\.md$/, '')
  }
}

// Ruling R1: 'parse-error' IFF no '# Story:' heading AND no SF sections
// (not a bracket at all). Valid heading + 0 SF → [] (caller sets sfTotal 0).
export function parseBracketSfs(text: string): BracketSf[] | 'parse-error' {
  const normalized = text.replace(/\r\n/g, '\n')
  const matches = [...normalized.matchAll(SF_SECTION_RE)]
  if (matches.length === 0 && !HEADING_RE.test(normalized)) {
    return 'parse-error'
  }
  return matches.map((m, i) => {
    const sectionEnd =
      i + 1 < matches.length ? (matches[i + 1] as RegExpMatchArray).index! : normalized.length
    const body = normalized.slice(m.index! + m[0].length, sectionEnd)
    const tier = body.match(/^Tier:\s*(\d+)/m)
    const linear = body.match(/^linear:\s*(\S+)/m)
    const what = body.match(/^What:\s*(.+)$/m)
    const depends = body.match(/^Depends on:\s*(.+)$/m)
    const dependsRaw = depends?.[1].trim()
    return {
      name: m[1],
      title: m[2].trim(),
      tier: tier ? Number.parseInt(tier[1], 10) : 0,
      what: what?.[1].trim() ?? '',
      dependsOn:
        !dependsRaw || dependsRaw === '—'
          ? []
          : dependsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      linear: linear?.[1] ?? null
    }
  })
}
