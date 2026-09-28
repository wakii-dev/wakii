// vi phrase fixes — in-sentence enforcement of the 25/09 glossary ruling for inflected
// forms the whole-value preserve set and BRAND_MISTRANSLATIONS word-boundary match miss
// (uncommitted/committing → "cam kết" leaks; commit vocabulary stays English in vi dev usage).
export const VI_PHRASE_FIXES = [
  { pattern: /chưa được cam kết/g, replacement: 'chưa commit', whenEnMatches: /\buncommitted\b/i },
  { pattern: /Chưa được cam kết/g, replacement: 'Chưa commit', whenEnMatches: /\buncommitted\b/i },
  { pattern: /không cam kết/g, replacement: 'chưa commit', whenEnMatches: /\buncommitted\b/i },
  { pattern: /Không cam kết/g, replacement: 'Chưa commit', whenEnMatches: /\bUncommitted\b/ },
  { pattern: /chưa cam kết/g, replacement: 'chưa commit', whenEnMatches: /\buncommitted\b/i },
  // Why: review P1 (27/09) — GT also emits the "không được cam kết" form, which the
  // patterns above miss and the /\bcommit/i catch-all can't catch ("uncommitted" has
  // no word boundary before the c).
  { pattern: /không được cam kết/g, replacement: 'chưa commit', whenEnMatches: /\buncommitted\b/i },
  { pattern: /Không được cam kết/g, replacement: 'Chưa commit', whenEnMatches: /\buncommitted\b/i },
  { pattern: /cam kết/g, replacement: 'commit', whenEnMatches: /\bcommit/i },
  { pattern: /Cam kết/g, replacement: 'Commit', whenEnMatches: /\bCommit/ },
  // Why: GT renders "kill them" (processes) with the human pronoun — vi dev usage keeps "kill".
  { pattern: /giết họ/g, replacement: 'kill chúng', whenEnMatches: /\bkill them\b/i },
  { pattern: /giết chúng/g, replacement: 'kill chúng', whenEnMatches: /\bkill\b/i },
  // Why: GT reads "terminal" as the adjective "cuối" (last) — "terminal session" becomes
  // "phiên cuối" ("last session"), wrong on 18 keys (27/09 full-catalog grep).
  { pattern: /phiên cuối/g, replacement: 'phiên terminal', whenEnMatches: /terminal session/i },
  { pattern: /Phiên cuối/g, replacement: 'Phiên terminal', whenEnMatches: /terminal session/i }
]
